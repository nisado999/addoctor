// AdDoctor backend (Cloudflare Worker).
// Flow: page -> /start (Apify crawls the Ad Library) -> /status (poll) -> /analyze (normalize + Claude writes the slide)
//
// Environment variables (Cloudflare > Workers > Settings > Variables):
//   APIFY_TOKEN      secret   your Apify API token
//   ANTHROPIC_KEY    secret   your Anthropic API key
//   ALLOW_ORIGIN     text     your site, e.g. https://app.addoctor.com  (use * only while testing)
//   APP_KEY          secret   optional: if set, the page must send it as header X-App-Key
//   MAX_ADS          text     optional cap per analysis, default 200, never above 800 (Apify bills per ad)
//   RATE_PER_HOUR    text     optional, paid calls one visitor may make per hour, default 60
//   DAILY_CAP        text     optional, paid calls allowed per day across all visitors, default 300
//   MODEL            text     optional, default claude-sonnet-5-5
//   META_TOKEN       secret   optional: Meta Ad Library API access token. When set, Competitor Spy reads the
//                             official (free) API and Apify is not used. Covers ads shown in the EU and UK.
//   SCRAPECREATORS_KEY secret optional: scrapecreators.com API key. Used when META_TOKEN is not set, instead of Apify.
//                             1 credit per page of about 30 ads, images included.
//   VISION_MAX       text     optional, how many ad creatives Claude looks at per analysis, default 16, never above 20
//   None of the three sources is needed for ads read by the AdDoctor helper (the bookmark a visitor clicks on the
//   Ad Library page): those arrive in /analyze as "ads" and only the Claude call costs anything.
//   GEMINI_KEY       secret   Google AI Studio API key (Social Pack images)
//   IMAGE_MODEL      text     optional, standard image model, default gemini-3.1-flash-image
//   IMAGE_MODEL_PREMIUM text  optional, premium image model, default gemini-3-pro-image

const ACTOR = "apify~facebook-ads-scraper";

const SLIDE_RULES = `Rules for "slide": write like this example, which is only about tone and length and must not be copied: "Collaborations with multiple well-known influencers like A and B throughout the year." / "They seem to primarily focus on promoting their skincare products with videos while also maintaining a presence with static images." / "In early January we notice a -30% offer and early in the summer a -50% on selected products." / "The brand's ad campaigns indicate that it prioritizes X and Y as their hero product lines." Cover, where the material supports it: influencer collaborations (an advertiser shown as "X with Brand"), video vs static mix, which product they focus on most, promotions and sales with the month they ran, hero product lines, and any sign-up or lead ads. Be unsure in tone. Use words like "seem to", "appear to", "looks to", "we notice", "indicate that". Never state anything as fact that the ads cannot prove, and never claim spend or results. Write in English, even if the ads are not.`;

const json = (env, body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*", "Access-Control-Allow-Headers": "Content-Type, X-App-Key, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
  });

const toMs = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v;     // seconds or ms
  const t = Date.parse(String(v).replace(" UTC", "Z").replace(" ", "T"));   // "2026-09-15 07:00:00 UTC"
  return isNaN(t) ? null : t;
};
const pick = (...vals) => vals.find((v) => v != null && v !== "");
const clean = (v) => { const t = String(v == null ? "" : v).trim(); return /\{\{.*\}\}/.test(t) ? "" : t; };   // drop "{{product.name}}" placeholders

// Creative images are only ever fetched from Meta's own image hosts, whoever supplied the link.
const FB_IMG = /^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|cdninstagram\.com)\//i;
function adImages(snap, cards) {
  const out = [];
  const add = (...u) => { const v = u.find((x) => typeof x === "string" && FB_IMG.test(x)); if (v && !out.includes(v)) out.push(v); };
  (Array.isArray(snap.images) ? snap.images : []).forEach((i) => add(i.resized_image_url, i.resizedImageUrl, i.original_image_url, i.originalImageUrl));
  (Array.isArray(snap.videos) ? snap.videos : []).forEach((v) => add(v.video_preview_image_url, v.videoPreviewImageUrl));
  cards.forEach((c) => add(c.resized_image_url, c.resizedImageUrl, c.original_image_url, c.originalImageUrl, c.video_preview_image_url, c.videoPreviewImageUrl));
  return out.slice(0, 4);
}
const linkOf = (u) => { try { const x = new URL(String(u)); return (x.hostname.replace(/^www\./, "") + x.pathname).replace(/\/+$/, "").slice(0, 70); } catch (e) { return ""; } };

// Turn one Ad Library item into the shape the page uses. The same record comes from three places with two spellings:
// Apify (camelCase: pageInfo.page.name, snapshot.displayFormat, isActive, startDateFormatted), and ScrapeCreators or
// the browser helper (Meta's own snake_case: page_name, snapshot.display_format, is_active, start_date in seconds).
function normalize(it) {
  const snap = it.snapshot || {};
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const card = cards.find((c) => clean(c.body) || clean(c.title)) || cards[0] || {};
  const bodyRaw = snap.body && typeof snap.body === "object" ? snap.body.text : snap.body;
  const body = clean(pick(clean(bodyRaw), clean(card.body), clean(it.adText), ""));
  const title = clean(pick(clean(snap.title), clean(card.title), clean(it.title), ""));
  const df = String(pick(snap.displayFormat, snap.display_format, it.displayFormat, "") || "").toUpperCase();
  // DCO (one ad with several versions) and DPA (product catalog) list every version or product as a "card", but the
  // Ad Library shows them as a single image or video, so only a real CAROUSEL counts as one. Judge them by the first card.
  const dynamic = df === "DCO" || df === "DPA";
  const isVid = (c) => !!(c.videoHdUrl || c.videoSdUrl || c.video_hd_url || c.video_sd_url || c.video === true);
  const hasVideo = (snap.videos || []).length > 0 || df === "VIDEO" || (dynamic ? !!cards[0] && isVid(cards[0]) : cards.some(isVid));
  const isCarousel = df === "CAROUSEL" || (!df && cards.length > 1);
  const format = hasVideo ? "Video" : isCarousel ? "Carousel" : "Static";
  const advertiser = String(pick(it.pageInfo && it.pageInfo.page && it.pageInfo.page.name, it.pageName, it.page_name, snap.pageName, snap.page_name, "") || "");
  const imgs = adImages(snap, cards);
  const catalog = dynamic && !body && !title;
  const startMs = toMs(pick(it.startDateFormatted, it.startDate, it.start_date));
  const endMs = toMs(pick(it.endDateFormatted, it.endDate, it.end_date));
  const active = pick(it.isActive, it.is_active);
  const days = startMs ? Math.max(0, Math.round((((active === true || !endMs) ? Date.now() : endMs) - startMs) / 86400000)) : null;
  const cm = advertiser.match(/^(.{2,60}?)\s+with\s+(.{2,40})$/i);
  // A partnership ad ("Creator with Brand") keeps the brand as the ad's page and the creator as the snapshot's page.
  const partner = String(pick(snap.page_name, snap.pageName, "") || "").trim();
  const creator = cm && cm[1].trim().toLowerCase() !== cm[2].trim().toLowerCase() ? cm[1].trim()
    : partner && it.page_name && partner.toLowerCase() !== String(it.page_name).trim().toLowerCase() ? partner.slice(0, 60) : "";
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const headline = wf((title || lines[0] || (catalog ? "Catalog ad (text is filled in per product)" : "")).slice(0, 110));
  const rest = wf((title ? lines : lines.slice(1)).join(" ").slice(0, 400));
  return {
    libId: String(pick(it.adArchiveID, it.adArchiveId, it.ad_archive_id, it.adId, it.id, "")),
    advertiser, headline, body: rest, cta: clean(pick(snap.ctaText, snap.cta_text, card.ctaText, card.cta_text, "")),
    format, startMs, endMs: active === true ? null : (endMs || null), days, creator,
    active: active === true || (active !== false && !endMs),
    img: imgs[0] || "", imgs, versions: Math.max(1, Math.min(Number(pick(it.collationCount, it.collation_count, 1)) || 1, 999)),
    link: linkOf(pick(snap.linkUrl, snap.link_url, card.linkUrl, card.link_url, "")),
    kind: df === "DPA" ? "product catalog ad" : df === "DCO" && cards.length > 1 ? "several versions of one ad" : "",
  };
}

/* ------------------------- ScrapeCreators (paid, cheap) ------------------------- */
// One request returns one page of an advertiser's ads (about 30) in Meta's own format, images included, for 1 credit.
// The page reads long advertisers in several calls to /page (a free Worker may make only 50 requests per call), passing
// back the cursor each time: "from" is where to continue, "pages" how many to read now, "room" how many ads are still wanted.
const adCap = (env) => Math.min(Number(env.MAX_ADS) || 200, 1000);
async function scAds(env, q, from = "", pages = 30, room = adCap(env)) {
  const cap = room;
  const out = [];
  let cursor = from;
  for (let page = 0; page < pages && out.length < cap; page++) {
    const p = { pageId: q.id, country: q.country || "ALL", status: "ALL", sort_by: "relevancy_monthly_grouped" };
    if (q.from) p.start_date = q.from;
    if (q.to) p.end_date = q.to;
    if (cursor) p.cursor = cursor;
    const url = "https://api.scrapecreators.com/v1/facebook/adLibrary/company/ads";
    const big = cursor.length > 4000;   // long cursors do not fit in a URL
    const r = await fetch(big ? url : url + "?" + new URLSearchParams(p), big
      ? { method: "POST", headers: { "x-api-key": env.SCRAPECREATORS_KEY, "content-type": "application/json" }, body: JSON.stringify(p) }
      : { headers: { "x-api-key": env.SCRAPECREATORS_KEY } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) {
      if (out.length) break;   // keep what was read
      throw new Error("ScrapeCreators: " + String(j.message || j.error || r.status).slice(0, 120));
    }
    const items = Array.isArray(j.results) ? j.results : Array.isArray(j.ads) ? j.ads : [];
    out.push(...items);
    cursor = String(j.cursor || "");
    if (!cursor || !items.length) { cursor = ""; break; }
  }
  return { items: out.slice(0, cap), cursor };
}

// The parts of one Ad Library record that normalize() reads, so /page can hand ads to the browser without the bulk.
function slimAd(n) {
  const s = n.snapshot || {};
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const media = (list, keys) => (Array.isArray(list) ? list : []).slice(0, 4).map((m) => Object.fromEntries(keys.filter((k) => m && m[k]).map((k) => [k, m[k]])));
  return {
    ad_archive_id: String(n.ad_archive_id || ""), page_name: str(n.page_name, 120) || str(s.page_name, 120), is_active: n.is_active,
    start_date: n.start_date, end_date: n.end_date, collation_count: n.collation_count,
    snapshot: {
      page_name: str(s.page_name, 120), body: { text: str(s.body && typeof s.body === "object" ? s.body.text : s.body, 900) },
      title: str(s.title, 200), cta_text: str(s.cta_text, 60), display_format: str(s.display_format, 20), link_url: str(s.link_url, 300),
      images: media(s.images, ["resized_image_url", "original_image_url"]), videos: media(s.videos, ["video_preview_image_url"]),
      cards: (Array.isArray(s.cards) ? s.cards : []).slice(0, 6).map((c) => ({ body: str(c.body, 500), title: str(c.title, 200), cta_text: str(c.cta_text, 60), link_url: str(c.link_url, 300), resized_image_url: c.resized_image_url, original_image_url: c.original_image_url, video_preview_image_url: c.video_preview_image_url, video: !!(c.video_hd_url || c.video_sd_url) })),
    },
  };
}

// Which source reads the Ad Library for /start. The free official API wins, then the cheap one, then Apify.
const spySource = (env) => (env.META_TOKEN ? "meta" : env.SCRAPECREATORS_KEY ? "sc" : env.APIFY_TOKEN ? "apify" : "");

/* ---------------------- Meta Ad Library API (official) ---------------------- */
// A "run" for this path is just the request packed into a hex string, so /status and /analyze need no storage.
const hexEnc = (o) => "meta" + [...new TextEncoder().encode(JSON.stringify(o))].map((b) => b.toString(16).padStart(2, "0")).join("");
const hexDec = (r) => JSON.parse(new TextDecoder().decode(new Uint8Array((r.slice(4).match(/../g) || []).map((h) => parseInt(h, 16)))));

function normalizeMeta(it, format) {
  const titles = (it.ad_creative_link_titles || []).map(clean).filter(Boolean);
  const bodies = (it.ad_creative_bodies || []).map(clean).filter(Boolean);
  const body = bodies[0] || "";
  const title = titles[0] || "";
  const advertiser = String(it.page_name || "");
  const startMs = toMs(it.ad_delivery_start_time);
  const stop = toMs(it.ad_delivery_stop_time);
  const endMs = stop && stop < Date.now() ? stop : null;
  const days = startMs ? Math.max(0, Math.round(((endMs || Date.now()) - startMs) / 86400000)) : null;
  const partner = String(it.bylines || "").trim();
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  return {
    libId: String(it.id || ""), advertiser,
    headline: wf((title || lines[0] || "").slice(0, 110)),
    body: wf((title ? lines : lines.slice(1)).join(" ").slice(0, 400)),
    cta: "", format: format === "Video" ? "Video" : new Set(titles).size > 1 ? "Carousel" : "Static", snap: String(it.ad_snapshot_url || ""),
    startMs, endMs, days, active: !endMs, creator: partner && partner.toLowerCase() !== advertiser.toLowerCase() ? partner : "",
  };
}

// Two passes: videos first (so they can be labelled), then everything else.
async function metaAds(env, q) {
  const cap = Math.min(Number(env.MAX_ADS) || 200, 800);
  const byId = new Map();
  const pass = async (mediaType, format) => {
    const p = new URLSearchParams({
      search_page_ids: q.id, ad_reached_countries: JSON.stringify([q.country || "ALL"]), ad_active_status: "ALL", ad_type: "ALL",
      media_type: mediaType, limit: "100", access_token: env.META_TOKEN,
      fields: "id,page_name,bylines,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,publisher_platforms,ad_snapshot_url",
    });
    if (q.from) p.set("ad_delivery_date_min", q.from);
    if (q.to) p.set("ad_delivery_date_max", q.to);
    let url = "https://graph.facebook.com/v21.0/ads_archive?" + p;
    for (let page = 0; url && page < 8 && byId.size < cap; page++) {   // 8 pages x 2 passes keeps room for the creative reads below
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error("Meta Ad Library: " + ((j.error && j.error.message) || r.status));
      (j.data || []).forEach((it) => { const a = normalizeMeta(it, format); if (a.libId && !byId.has(a.libId) && (a.headline || a.body)) byId.set(a.libId, a); });
      url = j.paging && j.paging.next;
    }
  };
  await pass("VIDEO", "Video");
  await pass("ALL", "");
  return [...byId.values()];
}

// Creative reading. Each ad has a preview page (ad_snapshot_url) whose HTML carries the image, or a video's cover
// frame. Read it for the most-used creatives only, so Claude can describe what the ads look like.
// Meta may refuse these reads; every failure is counted in "vision" and the text analysis carries on without it.
const VISION_MAX = 12;
const IMG_KEYS = ["original_image_url", "resized_image_url", "video_preview_image_url"];
function snapImage(html) {
  for (const k of IMG_KEYS) {
    const m = html.match(new RegExp('"' + k + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)+")'));
    if (m) { try { const u = JSON.parse(m[1]); if (/^https:\/\//.test(u)) return u; } catch (e) {} }
  }
  return "";
}
async function readCreatives(ads) {
  const groups = new Map();
  ads.forEach((a) => {
    if (!a.snap) return;
    const k = (a.headline + " " + a.body).toLowerCase().replace(/\s+/g, " ").slice(0, 70);
    const g = groups.get(k) || { n: 0, a };
    g.n++; groups.set(k, g);
  });
  const top = [...groups.values()].sort((x, y) => y.n - x.n || (y.a.days || 0) - (x.a.days || 0)).slice(0, VISION_MAX);
  const vision = { tried: top.length, pages: 0, found: 0, images: 0, note: "" };
  const out = await Promise.all(top.map(async (g) => {
    try {
      const r = await fetch(g.a.snap, { headers: { "user-agent": "Mozilla/5.0", accept: "text/html" } });
      if (!r.ok) { vision.note = vision.note || "preview page " + r.status; return null; }
      vision.pages++;
      const src = snapImage(await r.text());
      if (!src) { vision.note = vision.note || "no image in preview page"; return null; }
      vision.found++;
      const ir = await fetch(src);
      const type = (ir.headers.get("content-type") || "").split(";")[0];
      if (!ir.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) { vision.note = vision.note || "image " + ir.status + " " + type; return null; }
      const buf = await ir.arrayBuffer();
      if (buf.byteLength > 3000000) { vision.note = vision.note || "image too large"; return null; }
      vision.images++;
      return { n: g.n, format: g.a.format, headline: g.a.headline, libId: g.a.libId, days: g.a.days, type, data: b64(buf) };
    } catch (e) { vision.note = vision.note || String(e.message || e).slice(0, 80); return null; }
  }));
  return { images: out.filter(Boolean), vision };
}

const PROMO_RE = /\d\s?%|\bsales?\b|offer|discount|black friday|cyber|1\s?\+\s?1|προσφορ|[εέ]κπτ[ωώ]σ|δώρο|κουπόν/i;

// Same job when the ads already carry image links (ScrapeCreators, Apify, the browser helper): load the creatives
// that the most ads share, and the ones that ran longest, so Claude sees what the advertiser leans on.
async function readAdImages(env, ads) {
  const max = Math.max(0, Math.min(Number(env.VISION_MAX) || 16, 20));
  const groups = new Map();
  ads.forEach((a) => {
    if (!a.img) return;
    const k = a.img.replace(/[?#].*$/, "").split("/").pop();   // the same file is reused across ads
    const g = groups.get(k) || { n: 0, a };
    g.n += a.versions || 1;
    if ((a.days || 0) > (g.a.days || 0)) g.a = a;
    groups.set(k, g);
  });
  const score = (g) => g.n + (g.a.days || 0) / 20;
  const ranked = [...groups.values()].sort((x, y) => score(y) - score(x));
  // A third of the places go to the newest ads that talk about an offer: sale artwork is short-lived, so it never
  // ranks as most-used, and it is where discounts are printed on the image.
  const promos = ranked.filter((g) => PROMO_RE.test(g.a.headline + " " + g.a.body + " " + g.a.link)).sort((x, y) => (y.a.startMs || 0) - (x.a.startMs || 0)).slice(0, Math.floor(max / 3));
  const top = [...ranked.filter((g) => !promos.includes(g)).slice(0, max - promos.length), ...promos];
  const vision = { tried: top.length, pages: top.length, found: top.length, images: 0, note: "" };
  const out = await Promise.all(top.map(async (g) => {
    try {
      const ir = await fetch(g.a.img);
      const type = (ir.headers.get("content-type") || "").split(";")[0];
      if (!ir.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) { vision.note = vision.note || "image " + ir.status + " " + type; return null; }
      const buf = await ir.arrayBuffer();
      if (buf.byteLength > 2500000) { vision.note = vision.note || "image too large"; return null; }
      vision.images++;
      return { n: g.n, format: g.a.format, headline: g.a.headline, libId: g.a.libId, days: g.a.days, url: g.a.img, type, data: b64(buf) };
    } catch (e) { vision.note = vision.note || String(e.message || e).slice(0, 80); return null; }
  }));
  return { images: out.filter(Boolean), vision };
}

// Slicing text can cut an emoji in half (a lone surrogate), which makes the request invalid JSON. Remove any such halves.
// An error the visitor can act on: answered as 422, which the page shows as written.
const bad = (msg) => Object.assign(new Error(msg), { status: 422 });
const wf = (t) => String(t).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");

// One line per group of near-identical ads. When there are too many to fit, every line's ad text is shortened
// rather than dropping the newest groups off the end.
function compact(ads, cap = 26000, len = 170) {
  const groups = new Map();
  ads.forEach((a) => {
    const k = (a.headline + " " + a.body).toLowerCase().replace(/\s+/g, " ").slice(0, 70);
    const g = groups.get(k) || { n: 0, a, starts: [], ends: [], fm: new Set() };
    g.n++; g.fm.add(a.format); if (a.startMs) g.starts.push(a.startMs); if (a.endMs) g.ends.push(a.endMs);
    groups.set(k, g);
  });
  const d = (ms) => new Date(ms).toISOString().slice(0, 10);
  const lines = [...groups.values()].sort((x, y) => Math.min(...(x.starts.length ? x.starts : [0])) - Math.min(...(y.starts.length ? y.starts : [0]))).map((g) => {
    const st = g.starts.length ? d(Math.min(...g.starts)) : "?";
    const en = g.ends.length && g.ends.length === g.n ? d(Math.max(...g.ends)) : "running";
    const a = g.a;
    return wf(`x${g.n} | ${[...g.fm].join("/")}${a.kind ? " (" + a.kind + ")" : ""} | ${st} to ${en} | ${a.creator ? "creator " + a.creator : a.advertiser} | ${(a.headline + " " + a.body).slice(0, len)}${a.cta ? " | button: " + a.cta : ""}${a.link ? " | goes to: " + a.link : ""}\n`);
  });
  const full = lines.reduce((s, l) => s + l.length, 0);
  if (full <= cap) return lines.join("");
  if (len > 40) return compact(ads, cap, Math.max(40, Math.floor(len * (cap / full) * 0.8)));
  // Still too long with short lines: keep an even sample across the whole period, not just the oldest ads.
  const step = Math.ceil(full / cap);
  return `(only 1 in every ${step} groups is listed, spread evenly over the period)\n` + lines.filter((_, i) => i % step === 0).join("");
}

const REPORT_SECTIONS = `"Offers and sales" (every discount, sale, promo code, gift, free shipping or bundle, with the size of the offer and the dates or month it ran; include offers that are only printed on the image), "Products and collections" (what is advertised most, hero products, categories, seasonal drops, where the ads send people), "How the ads look" (only when creatives are shown: product shot or lifestyle, models, settings, text and badges on the image, colours, layouts, polished or user-made), "Messaging and hooks" (recurring angles, phrases, calls to action, tone, language), "Formats and timing" (video, static and carousel mix, how many ads launch and when, bursts around sales, how long ads stay live, long runners), "Creators and partners" (influencers, collaborations, other pages running the ads)`;

async function writeSlide(env, ads, brand, from, to, images = []) {
  const prompt = `You are a direct-response paid media analyst studying a competitor's Meta ads. Today is ${new Date().toISOString().slice(0, 10)}. Advertiser: ${brand || "unknown"}. Period: ${from || "?"} to ${to || "?"}. Total distinct ads read: ${ads.length}.
Each line below is a group of near-identical ads: x<count> | format | start to end (or "running") | advertiser or creator | ad text | button | landing page.
Return ONLY JSON:
{"slide":[5 to 7 short bullets in the style of an agency competitor slide],
"report":[{"title":"section name","bullets":["one finding per bullet"]}],
"creatives":[{"i":1,"sees":"one sentence on what creative 1 shows"}],
"insights":[3 to 5 short bullets a media buyer can act on]}
${SLIDE_RULES}
Rules for "report": this is the full list of everything you noticed. Use these sections, in this order, and leave a section out when the ads give no evidence for it: ${REPORT_SECTIONS}. Up to 6 bullets per section, each one a single concrete finding of at most 30 words that names what you saw: the offer, the product, the phrase, the month, the count of ads. Translate quoted ad text to English. Facts you can read in the ads (an offer, a date, a count) are stated plainly; anything about intent or performance is worded as a guess.
${images.length ? `After the ad list you are shown the creative of the ${images.length} most-used and longest-running ads (for a video, its cover frame). Look at each one closely and read any text printed on it: prices, discount badges, sale names and dates on an image count as offers even when the ad text does not mention them. Use what you see in "slide", in "report" and in at least one insight. In "creatives" give one entry per creative, numbered as shown: what the image shows and any text or offer printed on it, in at most 25 words. Describe only what is visible.` : `No creatives could be shown, so leave "creatives" empty and leave out "How the ads look".`}

ADS:
${compact(ads, ads.length > 300 ? 60000 : 26000)}`;
  const content = [{ type: "text", text: wf(prompt) }];
  images.forEach((im, i) => {
    content.push({ type: "text", text: wf(`Creative ${i + 1}: used by ${im.n} ad${im.n === 1 ? "" : "s"}, ${im.format}${im.days != null ? ", live " + im.days + " days" : ""}, headline "${im.headline}"`) });
    content.push({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } });
  });
  const out = await askClaude(env, content, 6000);
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
  return {
    slide: list(out.slide, 8, 400), insights: list(out.insights, 6, 400),
    report: (Array.isArray(out.report) ? out.report : []).map((s) => ({ title: clip(s && s.title, 60), bullets: list(s && s.bullets, 8, 400) })).filter((s) => s.title && s.bullets.length).slice(0, 8),
    creatives: (Array.isArray(out.creatives) ? out.creatives : []).map((c) => { const im = images[Number(c && c.i) - 1]; return im ? { libId: im.libId || "", img: im.url || "", n: im.n, format: im.format, sees: clip(c.sees, 300) } : null; }).filter(Boolean),
  };
}


/* ------------------------------ Social Pack ------------------------------ */

const MIX = ["product-hero", "lifestyle", "quick-tip", "detail", "myth-truth", "flat-lay", "benefit-callout", "checklist", "brand-quote", "behind-the-scenes"];
const MIX_HELP = {
  "product-hero": "A clean, scroll-stopping hero shot of the product. No text on the image.",
  "lifestyle": "The product being used or worn in a real, natural setting. No text on the image. If a person appears, do it carefully: a calm, natural pose, a relaxed realistic face, hands relaxed or out of frame, natural light, the whole garment and its print clearly visible, no gestures and no posing at the camera.",
  "quick-tip": "A photo that shows ONE usage or styling idea through the scene itself (how it is worn, layered or arranged). No text on the image.",
  "detail": "A close-up detail shot that shows quality, texture or craft. No text on the image.",
  "myth-truth": "A calm, editorial photo that quietly carries one idea about the brand (for example a still portrait by a window). The idea goes in the caption. No text on the image. A person must be done carefully: natural, still, relaxed hands, the print clearly visible.",
  "flat-lay": "A styled flat lay or arrangement of the product from above. No text on the image.",
  "benefit-callout": "A photo that shows ONE benefit visually (fabric weight, print quality, stitching, fit). No text on the image.",
  "checklist": "A styled arrangement or scene that shows what comes with the product. No text on the image.",
  "brand-quote": "A quiet, atmospheric photo that carries the brand's mood and values through props and setting. No text on the image.",
  "behind-the-scenes": "A behind-the-scenes or making-of moment that builds trust. No text on the image.",
};

const stripFence = (t) => String(t || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
// The outermost {...} or [...] in the text. indexOf/lastIndexOf keep this linear however the model's reply looks.
const jsonSpan = (text) => {
  const s = stripFence(text);
  const a = [s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0).sort((x, y) => x - y)[0];
  if (a === undefined) return s;
  const e = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  return e > a ? s.slice(a, e + 1) : s;
};
const parseJson = (text) => JSON.parse(jsonSpan(text));
const clip = (v, n) => wf(String(v == null ? "" : v)).slice(0, n);

// The answer is asked for as a call to a "reply" tool, which arrives as an already-parsed object, so a stray double
// quote in an ad's text can't break it. Some models refuse tools or a forced tool choice, so the tool is only offered
// (tool_choice auto), a refusal falls back to plain text, and plain-text JSON gets its unescaped quotes repaired.
const REPLY_TOOL = { name: "reply", description: "Return the answer as the JSON object described in the instructions, with exactly those keys.", input_schema: { type: "object", additionalProperties: true } };

// Escapes double quotes that sit inside a JSON string, judged by what follows them: a closing quote is followed by
// , : } ] or the end. Leaves valid JSON unchanged.
function repairJson(s) {
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr && c === "\\") { out += c + (s[i + 1] || ""); i++; continue; }
    if (c === '"') {
      if (!inStr) { inStr = true; out += c; continue; }
      let k = i + 1;
      while (k < s.length && /\s/.test(s[k])) k++;
      if (k >= s.length || /[,:}\]]/.test(s[k])) { inStr = false; out += c; } else out += '\\"';
      continue;
    }
    out += inStr && c === "\n" ? "\\n" : inStr && c === "\r" ? "\\r" : inStr && c === "\t" ? "\\t" : c;
  }
  return out;
}

const parseLoose = (text) => { try { return parseJson(text); } catch (e) { return JSON.parse(repairJson(jsonSpan(text))); } };

async function askClaude(env, content, maxTokens = 2000, mode = "tool", temp) {
  const parts = typeof content === "string" ? [{ type: "text", text: content }] : content;
  const body = { model: env.MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content: parts }] };
  if (temp !== undefined) body.temperature = temp;
  if (mode === "tool") { body.tools = [REPLY_TOOL]; body.tool_choice = { type: "auto" }; body.messages[0].content = [...parts, { type: "text", text: "Give your answer by calling the reply tool with that JSON object." }]; }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || "Anthropic error " + r.status;
    if (temp !== undefined && r.status === 400 && /temperature/i.test(msg)) return askClaude(env, content, maxTokens, mode);   // this model takes no temperature
    if (mode === "tool" && r.status === 400 && /tool/i.test(msg)) return askClaude(env, content, maxTokens, "text", temp);   // this model takes no tools
    throw new Error(msg);
  }
  const tool = (j.content || []).find((b) => b.type === "tool_use");
  if (tool && tool.input && typeof tool.input === "object" && Object.keys(tool.input).length) return tool.input;
  const text = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  try { return parseLoose(text); } catch (e) {
    // Still unreadable: ask once more, in plain text, for valid JSON.
    if (mode === "again") throw new Error("The analysis came back in a form that could not be read. Try again.");
    return askClaude(env, [...parts, { type: "text", text: "Return valid JSON only. Inside strings use single quotes, never double quotes." }], maxTokens, "again", temp);
  }
}

const PACK_RULES = `Hard rules: never invent discounts, prices, statistics, awards, reviews, testimonials, health claims or guarantees. Never name competitors. Text written ON an image must be very short (max 12 words in total), plain words, no emoji. Captions: a strong first line (the hook), then 1-3 short lines, then 3-5 hashtags. Write captions and on-image text in the language of the product description unless the brief says otherwise.`;


/* ---- store link + photo references ---- */

const BAD_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|.*\.(local|internal|localhost)$)/i;
function safeUrl(s) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(String(s).trim()) ? String(s).trim() : "https://" + String(s).trim()); } catch (e) { throw new Error("That does not look like a web address"); }
  if (!/^https?:$/.test(u.protocol) || BAD_HOST.test(u.hostname) || u.hostname.indexOf(".") < 0) throw new Error("That address can't be used");
  return u;
}
const UA = { "user-agent": "Mozilla/5.0 (compatible; AdDoctorBot/1.0)", "accept-language": "en,el;q=0.8" };
async function getText(url, max = 1500000) {
  const r = await fetch(url, { headers: { ...UA, accept: "text/html,application/json" }, redirect: "follow" });
  if (!r.ok) { const e = new Error("The site answered with an error (" + r.status + ")"); e.status = r.status; throw e; }
  return (await r.text()).slice(0, max);
}
const unent = (t) => String(t || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const plain = (h) => unent(String(h || "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const metaOf = (html, key) => {
  const re = new RegExp("<meta[^>]+(?:property|name)=[\"']" + key + "[\"'][^>]*>", "i");
  const m = html.match(re); if (!m) return "";
  const c = m[0].match(/content=["']([^"']*)["']/i); return c ? unent(c[1]) : "";
};
const GOOD_IMG = /\.(jpe?g|png|webp)(\?|#|$)/i;
const BAD_IMG = /(logo|icon|sprite|avatar|badge|payment|flag|favicon|placeholder|pixel|spinner|star|rating|trust)/i;
function absImg(src, base) { try { return new URL(String(src).trim().replace(/&amp;/g, "&"), base).href; } catch (e) { return ""; } }
function pushImg(list, src, base, label) {
  const u = absImg(src, base);
  if (!u || !/^https?:/.test(u) || BAD_IMG.test(u) || !(GOOD_IMG.test(u) || /cdn|image|media|upload/i.test(u))) return;
  const key = u.replace(/[?#].*$/, "").replace(/_(\d+x\d*|\d*x\d+)(?=\.)/, "");
  if (list.some((i) => i.key === key)) return;
  list.push({ url: u, label: clip(label, 80), key });
}

async function readStore(u) {
  const origin = u.origin; const out = { name: "", text: "", images: [], source: "page" };
  // Shopify stores expose clean product data; try it first
  try {
    const m = u.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/([^\/?#]+)/i);
    const j = JSON.parse(await getText(m ? `${origin}/products/${m[1]}.js` : `${origin}/products.json?limit=120`, 4000000));
    const all = j.products ? j.products : j.title ? [j] : [];
    // A shop lists its newest products first, so the first few can all be one kind (all tees). Take one product per kind in turn.
    const kinds = new Map();
    all.forEach((p) => { const k = String(p.product_type || p.type || String(p.title || "").trim().split(/\s+/).pop() || "").toLowerCase(); kinds.set(k, [...(kinds.get(k) || []), p]); });
    const items = [];
    for (let round = 0; items.length < Math.min(all.length, 24); round++) {
      const before = items.length;
      kinds.forEach((list) => { if (list[round] && items.length < 24) items.push(list[round]); });
      if (items.length === before) break;
    }
    if (items.length) {
      out.source = "shopify";
      out.name = clip(items[0].vendor || u.hostname.replace(/^www\./, ""), 80);
      out.text = items.slice(0, 8).map((p) => `${p.title}${p.type || p.product_type ? " (" + (p.type || p.product_type) + ")" : ""}: ${plain(p.description || p.body_html).slice(0, 220)}`).join("\n");
      items.forEach((p) => {
        const imgs = (p.images || []).map((x) => (typeof x === "string" ? x : x.src)).filter(Boolean);
        (items.length === 1 ? imgs : imgs.slice(0, 1)).forEach((src) => pushImg(out.images, src, origin, p.title));
        if (!p.images && p.featured_image) pushImg(out.images, p.featured_image, origin, p.title);
      });
      if (out.images.length) return out;
    }
  } catch (e) { /* not a Shopify store, read the page */ }
  const html = await getText(u.href);
  out.name = clip(metaOf(html, "og:site_name") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || u.hostname, 80);
  const title = metaOf(html, "og:title") || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const desc = metaOf(html, "og:description") || metaOf(html, "description");
  let ld = "";
  (html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []).slice(0, 6).forEach((b) => {
    try {
      const walk = (n) => { if (!n || typeof n !== "object") return; if (Array.isArray(n)) return n.forEach(walk);
        if (/Product/i.test(String(n["@type"]))) { ld += `${n.name || ""}: ${plain(n.description).slice(0, 220)}\n`; [].concat(n.image || []).forEach((i) => pushImg(out.images, typeof i === "string" ? i : i && i.url, u.href, n.name)); }
        Object.values(n).forEach((v) => typeof v === "object" && walk(v)); };
      walk(JSON.parse(b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "")));
    } catch (e) {}
  });
  [...html.matchAll(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi)].forEach((m) => { const c = m[0].match(/content=["']([^"']+)["']/i); if (c) pushImg(out.images, c[1], u.href, title); });
  [...html.matchAll(/<img\b[^>]*>/gi)].forEach((m) => {
    if (out.images.length >= 14) return;
    const tag = m[0];
    const src = (tag.match(/(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/i) || [])[1];
    const set = (tag.match(/srcset=["']([^"']+)["']/i) || [])[1];
    const w = Number((tag.match(/\bwidth=["']?(\d+)/i) || [])[1] || 0);
    if (w && w < 150) return;
    const best = set ? set.split(",").map((x) => x.trim().split(/\s+/)[0]).pop() : src;
    pushImg(out.images, best || src, u.href, (tag.match(/alt=["']([^"']*)["']/i) || [])[1] || "");
  });
  out.text = [title, desc, ld, plain(html).slice(0, 1500)].filter(Boolean).join("\n");
  return out;
}

async function packStore(env, b) {
  const u = safeUrl(b.url);
  let site;
  try { site = await readStore(u); } catch (e) { throw new Error(e.message && /address|web/.test(e.message) ? e.message : "We could not read that site. Try Upload photos or Describe it instead."); }
  if (!site.images.length && !site.text.trim()) throw new Error("We could not find products on that page. Try a product or collection link, or use Upload photos.");
  const o = await askClaude(env, `From this online store data, write a short description of what the store sells, for a social media creative brief.
Store: ${site.name}
Data:
${clip(site.text, 2800)}
Return ONLY JSON: {"name":"brand or store name","description":"2-3 plain sentences: what is sold, who it is for, what stands out. Use only facts present in the data, no invented claims, no prices or discounts. Write in the language of the store."}`, 600).catch(() => ({}));
  return {
    name: clip(o.name || site.name, 80),
    description: clip(o.description || site.text.split("\n")[0], 600),
    images: site.images.slice(0, 12).map((i) => ({ url: i.url, label: i.label })),
    source: site.source,
  };
}

function b64(buf) { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
async function loadRef(r, hostOk) {
  if (r && r.data) {
    const d = String(r.data); const m = d.match(/^data:([^;,]+)/);
    const data = d.replace(/^data:[^,]+,/, "");
    if (data.length > 4500000) throw new Error("A photo is too large");
    return { mime: (m && m[1]) || r.mime || "image/jpeg", data };
  }
  // Redirects are followed by hand, so every hop is checked again: a trusted host can't bounce this fetch elsewhere.
  // "hostOk" (optional) is a pattern the host of each hop must match.
  let u = safeUrl(r && r.url), resp = null;
  for (let hop = 0; hop < 4; hop++) {
    if (hostOk && !hostOk.test(u.hostname)) throw new Error("That image can't be read");
    resp = await fetch(u.href, { headers: UA, redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
      if (hop === 3) throw new Error("Could not load a product photo (too many redirects)");
      try { u = safeUrl(new URL(resp.headers.get("location"), u).href); } catch (e) { throw new Error("Could not load a product photo"); }
      continue;
    }
    break;
  }
  if (!resp.ok) throw new Error("Could not load a product photo (" + resp.status + ")");
  if (Number(resp.headers.get("content-length")) > 6000000) throw new Error("A product photo is too large");
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > 6000000) throw new Error("A product photo is too large");
  let mime = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) mime = /\.png/i.test(u.pathname) ? "image/png" : /\.webp/i.test(u.pathname) ? "image/webp" : "image/jpeg";
  return { mime, data: b64(buf) };
}
async function loadRefs(list, max) {
  const refs = (Array.isArray(list) ? list : []).slice(0, max);
  const got = []; let lastErr = null;
  for (const r of refs) { try { got.push(await loadRef(r)); } catch (e) { lastErr = e; } }
  if (refs.length && !got.length) throw lastErr || new Error("Could not load the product photos");
  return got;
}

async function packBrief(env, b) {
  const prompt = `You are a senior social media creative director. Turn this short product description into a creative brief for a set of organic 4:5 Instagram feed posts.
Description: ${clip(b.description, 700) || "(none, use the photos)"}
Audience (optional): ${clip(b.audience, 200)}
Tone (optional): ${clip(b.tone, 120)}
Brand colors (optional): ${clip(b.colors, 120)}
Language (optional): ${clip(b.language, 40)}
Return ONLY JSON: {"product":"what is sold, one line","audience":"who it is for, one line","tone":"3-5 words","language":"language for captions and on-image text","visualStyle":"2-3 sentences describing a consistent photographic style: light, setting, props, color palette, mood. Real-looking photography, never illustrations.","palette":"3-4 colors as words","avoid":"short list of things the images must avoid"}
${PACK_RULES}`;
  let content = prompt;
  const shots = await loadRefs([].concat((b.images || []).map((d) => ({ data: d })), (b.imageUrls || []).map((url) => ({ url }))), 3).catch(() => []);
  if (shots.length) content = [...shots.map((s) => ({ type: "image", source: { type: "base64", media_type: s.mime, data: s.data } })), { type: "text", text: prompt + "\nProduct photos are attached. Describe the REAL product you see (type, colors, materials, shape) in the 'product' and 'visualStyle' fields, and keep the style consistent with these photos. If the description is empty, rely on the photos." }];
  const o = await askClaude(env, content, 900);
  return { product: clip(o.product, 200), audience: clip(o.audience, 200), tone: clip(o.tone, 80), language: clip(o.language, 40), visualStyle: clip(o.visualStyle, 600), palette: clip(o.palette, 120), avoid: clip(o.avoid, 200) };
}

async function packPosts(env, b) {
  const idx = (Array.isArray(b.indexes) ? b.indexes : []).map(Number).filter((n) => n >= 0 && n < 60).slice(0, 10);
  if (!idx.length) throw new Error("indexes required");
  const br = b.brief || {};
  const lines = idx.map((i, n) => `${n + 1}. type "${MIX[i % MIX.length]}": ${MIX_HELP[MIX[i % MIX.length]]}`).join("\n");
  const prompt = `You are a senior social media creative director planning organic 4:5 Instagram feed posts for one brand. Each post must feel different from the others (different angle, setting, props, composition).
BRIEF
Product: ${br.product}
Audience: ${br.audience}
Tone: ${br.tone}
Language: ${br.language}
Visual style: ${br.visualStyle}
Palette: ${br.palette}
Avoid: ${br.avoid}

${b.photos ? "Real photos of the product will be given to the image model as references. Every imagePrompt must feature that exact product in a new scene. Never describe the product's design, prints, graphics, logos or text in the imagePrompt: just call it 'the product from the reference photos'. Prefer compositions that show the side of the product that the photos show, usually the front.\n" : ""}Write exactly ${idx.length} posts, in this order, one per line below (post ${idx.map((i) => i + 1).join(", ")} of ${Number(b.total) || idx.length} in the full pack):
${lines}

Return ONLY JSON: {"posts":[{"title":"2-5 words","imagePrompt":"a detailed photography prompt: subject, setting, camera angle, light, props, composition. Real photography. Do NOT describe any text here.","overlayText":"always an empty string: no words are printed on these images","caption":"the caption without hashtags","hashtags":["#a","#b","#c"]}]}
${PACK_RULES}`;
  const o = await askClaude(env, prompt, 4000);
  const list = Array.isArray(o.posts) ? o.posts : [];
  return idx.map((i, n) => {
    const p = list[n] || {};
    const type = MIX[i % MIX.length];
    const hasText = false;   // 30-Day Drop images carry no added words; the customer adds their own later
    return {
      index: i, type,
      title: clip(p.title, 60) || type.replace(/-/g, " "),
      imagePrompt: clip(p.imagePrompt, 900),
      overlayText: hasText ? clip(p.overlayText, 120) : "",
      caption: clip(p.caption, 700),
      hashtags: (Array.isArray(p.hashtags) ? p.hashtags : []).map((h) => clip(h, 40)).filter(Boolean).slice(0, 6),
    };
  });
}

function imagePromptText(b, br) {
  if (b.raw) return clip(b.prompt, 1600) + " Format: 4:5 portrait.";
  const style = br && br.visualStyle ? `Overall style: ${clip(br.visualStyle, 500)} ` : "";
  const text = b.overlayText
    ? `Print exactly this text on the image, spelled exactly as written, in clean modern typography with strong contrast and generous margins, nothing else written anywhere: "${clip(b.overlayText, 120)}".`
    : "Do not add any text, letters, captions, logos or watermarks anywhere in the image. Wording already printed on the product itself stays exactly as in the reference photos.";
  const fix = b.fix ? ` Important change to apply: ${clip(b.fix, 500)}` : "";
  return `Create a photorealistic 4:5 portrait Instagram feed photo. ${style}${clip(b.prompt, 900)} ${text}${fix}`;
}

const FIDELITY = (n) => `The ${n > 1 ? n + " attached photos show" : "attached photo shows"} the REAL product${n > 1 ? " from different angles or in different colors" : ""}. They are the only source of truth for its design. Reproduce the product exactly: same shape, fabric, color, fit, logo, artwork and text, in the same position and size as in the photos. Do NOT add, invent, move, duplicate, restyle or crop any print, graphic, logo, text, patch, label, stitching or embroidery that is not visible in the photos. Any area of the product that the photos do not show (for example a back, a sleeve or a pocket) must stay plain and unprinted unless the photos show otherwise. Only the scene, the model, the light and the props are new. `;

const inline = (x) => ({ inlineData: { mimeType: x.mime, data: x.data } });

async function packImage(env, b, who) {
  // Raw prompts skip the brief and go straight to the image model, so only a signed-in owner may use them.
  if (b.raw && !who) { const e = new Error("Sign in to use this."); e.status = 401; e.code = "signin_required"; throw e; }
  if (b.raw && !isOwner(env, who)) { const e = new Error("This feature is only for the site owner."); e.status = 403; e.code = "owner_only"; throw e; }
  const refs = await loadRefs(b.refs, 4);
  return geminiImage(env, [...refs.map(inline), { text: (refs.length ? FIDELITY(refs.length) : "") + imagePromptText(b, b.brief) }], b.quality);
}

// One 4:5 image from the image model. "parts" are the reference images and the instruction, in order.
const RATIOS = ["4:5", "9:16", "1:1", "16:9"];
async function geminiImage(env, parts, quality, ratio) {
  if (!env.GEMINI_KEY) throw new Error("GEMINI_KEY is not set on the server");
  const model = quality === "premium" ? (env.IMAGE_MODEL_PREMIUM || "gemini-3-pro-image") : (env.IMAGE_MODEL || "gemini-3.1-flash-image");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: RATIOS.includes(ratio) ? ratio : "4:5" } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  // The provider's own message stays in the server log; the visitor only sees a short line.
  if (!r.ok) { console.log("image model error", r.status, JSON.stringify(j.error || {}).slice(0, 500)); const e = new Error("The image model could not make this image. Try again."); e.status = r.status === 429 ? 429 : 502; throw e; }
  const got = ((j.candidates || [])[0] || {}).content ? (j.candidates[0].content.parts || []) : [];
  const img = got.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
  if (!img) {
    const why = (j.candidates && j.candidates[0] && j.candidates[0].finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || "no image returned";
    console.log("image model returned no image", String(why).slice(0, 80)); const e = new Error("The image model returned no image. Try a different photo or wording."); e.status = 422; throw e;
  }
  return { mime: img.mimeType || img.mime_type || "image/png", data: img.data, model };
}

/* ------------------------ An ad from a template and a product photo ------------------------ */
// "Make it with my product": the template is only a style reference, the visitor's photos are the product.
// With "base" (an ad made earlier) and "fix", the same call edits that ad instead of starting again.
// How any words in an ad must look: made as part of the picture, never a flat caption laid over it.
const NATIVE_TEXT = `TEXT MUST LOOK NATIVE. The words must look like they were really there when the photo was taken, never like a layer added in an editor. If the old text was printed on a product (a can, bottle, box, bag, label, sign, screen), print the new words on that product itself as part of its real design: following its curve and perspective, lit by the same light, with the same gloss, reflections, shadows and surface texture, and the real printing method of that product (foil, ink, emboss, metallic, matte). If the old text was a headline in the scene, set it with the same depth, lighting and perspective as the old one. The lettering itself must be designed like a top packaging and advertising designer would for this exact product and its audience: pick the typeface style, weight, width, spacing and finish that fit it. For an energy or sports drink use aggressive, bold, condensed, sharp-edged lettering with energy and metallic or gradient highlights; for skincare, tea or luxury use refined, elegant lettering; for kids or sweets use playful lettering; and so on. Never default to a plain basic sans-serif. Spell every word exactly as given, crisp and fully readable, and keep a strong, balanced layout with the product's own logo or artwork.`;

const PRODUCT_TRUTH = (n) => `The ${n > 1 ? "other " + n + " images show" : "other image shows"} the REAL product${n > 1 ? " from different angles or in different colours" : ""}. ${n > 1 ? "They are" : "It is"} the only source of truth for the product: reproduce it exactly, with the same shape, material, colour, logo, artwork and text, in the same position and size. Do not add, invent, move, restyle or remove any print, logo, label or detail. A side of the product that the ${n > 1 ? "photos do" : "photo does"} not show stays plain.`;

// Inspired ads: a text model first reads the reference and the customer's product, and writes down the ad format to keep
// and, if the reference has words on it, the new wording for this product. The image model then follows that plan.
async function planInspired(env, style, refs, note, headline, about) {
  const img = (x) => ({ type: "image", source: { type: "base64", media_type: x.mime, data: x.data } });
  const content = [
    { type: "text", text: "IMAGE 1 is an inspiration ad. The images after it show the customer's REAL product." },
    img(style), ...refs.map(img),
    { type: "text", text: `Work out what kind of ad IMAGE 1 is (typed or notes text card, script sheet, review or testimonial card, before and after, poster with a headline, UGC selfie, model photo, product on a surface, screenshot style...) and how it is laid out, so another designer can rebuild the same kind of ad for the customer's product.${about ? ` What it shows: ${about}` : ""}
If IMAGE 1 has wording on it, write the new wording for the customer's product: the same structure, number of lines, labels and tone (for example a numbered Hook, Problem, Solution script keeps those labels), about the customer's product only, short and believable, no invented numbers, prices, ratings or claims. ${headline ? `The customer's own wording is '${headline}': use it word for word as the main line.` : ""}${note ? ` About the product: ${note}` : ""} Write the wording in the language of the customer's note, or English.
Return ONLY JSON: {"format":"the kind of ad, one line","layout":"where each element sits and how it looks, two sentences","hasText":true or false,"lines":["each line of the new wording, in order"]}. Inside strings use single quotes, never double quotes.` },
  ];
  const o = await askClaude(env, content, 900);
  const lines = (Array.isArray(o.lines) ? o.lines : []).map((x) => clip(x, 160)).filter(Boolean).slice(0, 8);
  return { format: clip(o.format, 200), layout: clip(o.layout, 400), hasText: !!o.hasText && lines.length > 0, lines };
}

// Looks at one finished ad and decides how an offer line should be added to it: where, how big, in what style.
async function planOffer(env, base, offer) {
  const content = [
    { type: "image", source: { type: "base64", media_type: base.mime, data: base.data } },
    { type: "text", text: `You are an art director. This is a finished ad. The customer wants this offer added to it: "${offer}".
First study the ad: its format, what the eye reads first, the typography, the colours, the mood (quiet and premium, or loud and promotional), and where there is empty space. Then decide how the offer should appear so that it is noticed and believed but supports the ad instead of fighting its headline. There is no fixed rule: a minimal or luxury ad may want a small, quiet line; a sale or direct-response ad may want a big bold badge, banner or sticker. Choose the placement, the size, the style (plain line, pill badge, sticker, stamp, banner, handwritten note) and the colours that fit THIS ad, and keep it easy to read on a phone with a comfortable margin from the edges and from the product.
Return ONLY JSON: {"thinking":"two short sentences on what you saw and why you chose this","instruction":"one paragraph for an image editor: exactly where the offer goes relative to the existing elements, its size relative to the image height, its style and colours, and its margin. It must not move, resize or overlap anything already in the image."} Inside strings use single quotes, never double quotes.` },
  ];
  const o = await askClaude(env, content, 700);
  return clip(o.instruction, 700);
}

// Turns a reviewer's fixes into one careful instruction for the image editor. A person decides, with the picture in front of them,
// which fixes are safe to make and exactly how far to go, so nothing gets enlarged into something else or pushed into the headline.
async function planFixes(env, base, list) {
  const content = [
    { type: "image", source: { type: "base64", media_type: base.mime, data: base.data } },
    { type: "text", text: `You are an art director. This is a finished ad. A reviewer suggested these fixes:
${list.map((x, i) => (i + 1) + ". " + x).join("\n")}
Decide which of them you can make safely, and write the instruction for an image editor. Rules: keep the layout, the headline, all wording and the look exactly as they are. You may scale one element up by at most about 25 percent, or nudge it, only if there is clearly free space and the result keeps a comfortable margin from the edges and does not touch or overlap any other element or text. You may darken or lighten a colour, sharpen a blurred detail, or correct a misspelling. Do not add anything and do not remove anything. Skip any fix that cannot be made without crowding the layout. If you could not make any of them safely, return an empty instruction.
Return ONLY JSON: {"thinking":"two short sentences","instruction":"one paragraph for the image editor naming exactly what to change, by how much, and what must stay exactly the same"}. Inside strings use single quotes, never double quotes.` },
  ];
  const o = await askClaude(env, content, 700);
  const t = clip(o.instruction, 800).trim();
  return t ? t + " Keep every other element exactly as it is, in the same size and place." : "";
}

// Guided builder: the customer's answers (and what we read from their site) become three different ad concepts.
async function planScratch(env, b) {
  const a = b.answers || {}, s = b.site || {};
  const facts = [
    ["Brand", a.brand || s.name], ["What they sell", a.sells || s.description], ["Offer", a.offer], ["Audience", a.audience],
    ["Goal of the ad", a.goal], ["Tone", a.tone], ["Wording wanted", a.wording], ["Language", a.language],
  ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${clip(v, 300)}`).join("\n");
  const o = await askClaude(env, `You are a senior direct-response creative director designing static Meta (Facebook and Instagram) ads from scratch for one business. Write exactly 3 concepts. Each uses a clearly different angle (for example the problem it solves, the result you get, social proof or proof of quality, the offer itself, a lifestyle moment) and a different scene.
THE BUSINESS
${facts}
${b.photos ? "Real photos of the product are provided, so every scene must feature that exact product." : "No product photo exists, so design the visual around the idea and do not claim to show the real product."}
Rules: use only the facts above. ${a.offer ? "The offer may appear in the ad exactly as given." : "There is NO offer: print no discount, price, free shipping or deadline anywhere."} No invented numbers, ratings, awards or testimonials. Headlines are short (max 8 words), believable and in the language given, or the language of the brand.
Return ONLY JSON: {"concepts":[{"title":"2-4 words","angle":"one short line","headline":"the exact headline to print, or empty string if the visual should carry the ad","sub":"an optional short line under it, or empty string","scene":"a detailed description of the visual: setting, composition, light, colours, props, where the text sits. Do not repeat the headline here."}]}. Inside strings use single quotes, never double quotes.`, 1400);
  const list = (Array.isArray(o.concepts) ? o.concepts : []).slice(0, 3);
  if (list.length < 3) throw new Error("We could not plan the ads. Try again.");
  return { concepts: list.map((c) => ({ title: clip(c.title, 50), angle: clip(c.angle, 120), headline: clip(c.headline, 90), sub: clip(c.sub, 120), scene: clip(c.scene, 700) })) };
}

async function makeAd(env, b) {
  const ratio = RATIOS.includes(b.ratio) ? b.ratio : "4:5";   // video templates are full-height frames, so the whole person stays in the picture
  const refs = await loadRefs((Array.isArray(b.refs) ? b.refs : []).map((d) => ({ data: d })), 3);
  if (b.mode === "scratch") {
    // A tailor-made ad: no template, only the concept written for this customer and (if any) their product photos.
    const c = b.concept || {}, a = b.answers || {};
    // Photos from the customer's website arrive as links; each hop is checked by loadRef/safeUrl.
    if (refs.length < 3 && Array.isArray(b.refUrls)) refs.push(...await loadRefs(b.refUrls.map((url) => ({ url })), 3 - refs.length));
    const head = clip(c.headline, 90).trim(), sub = clip(c.sub, 120).trim();
    const words = head
      ? `Put this headline in the advert, spelled exactly as written, readable with strong contrast and generous margins: "${head}". ${NATIVE_TEXT}${sub ? ` Under it, smaller, exactly: "${sub}".` : ""} Write nothing else anywhere, apart from what is on the product itself.`
      : "No headline, caption, watermark or added logo. The only lettering allowed is what is on the product itself.";
    const brand = clip(a.brand, 80).trim();
    return geminiImage(env, [...refs.map(inline), { text: `Create a polished ${ratio} advert for Facebook and Instagram, designed from scratch for ${brand || "this business"}. ${a.sells ? "It sells: " + clip(a.sells, 240) + ". " : ""}${a.tone ? "Tone: " + clip(a.tone, 100) + ". " : ""}
Concept: ${clip(c.angle, 140)}. Scene and layout: ${clip(c.scene, 700)}
${refs.length ? PRODUCT_TRUTH(refs.length) + " Show the real product clearly and fully in frame." : "There is no product photo, so do not invent a specific branded product, logo or packaging; let the idea and the scene carry the ad."}
People, if any, look real with natural hands and faces. Natural or cool light, never an orange glow. ${a.offer ? `The offer may be shown exactly as written, spelled exactly: "${clip(a.offer, 80)}".` : "Show no discount, price or offer anywhere."}
${words}` }], b.quality, ratio);
  }
  if (!refs.length && !b.resize && !b.base) throw new Error("Add a photo of your product first");   // a saved ad opened from the Vault is edited without product photos
  const headline = clip(b.headline, 90).trim(), sub = clip(b.sub, 120).trim();
  const text = headline
    ? `Put this headline in the advert, spelled exactly as written, readable with strong contrast and generous margins: "${headline}". ${NATIVE_TEXT}${sub ? ` Under it, smaller, exactly: "${sub}".` : ""} Write nothing else anywhere, apart from what is on the product itself.`
    : b.mode === "inspired"
      ? "If the reference ad has wording on it (a script, headline, labels, a review), write NEW wording in the same style, length and layout for the customer's product, based on the product photos and the note, short and believable, with no false claims, spelled correctly and sharp. If the reference has no wording, add none. No watermark and no invented logo."
      : "No headline, caption, watermark or added logo anywhere. The only lettering allowed is what is on the product itself.";
  if (b.base && b.resize) {
    // Same advert in another shape: the scene is extended or re-framed, nothing in it is redrawn.
    const base = await loadRef({ data: b.base });
    return geminiImage(env, [inline(base), { text: `This is a finished advert. Make the SAME advert as a ${ratio} image. Keep the person, the product, every logo and every word of text exactly as they are, the same colours, light and style. Do not redraw, restyle, move or crop anything that is in the image: only continue the background and scene naturally where the new shape needs more room (floor, wall, sky, surroundings), and when the new shape is narrower, keep the whole subject fully in frame. Text must stay spelled exactly and sharp. Nothing may be added that is not already part of this scene.` }], b.quality, ratio);
  }
  if (b.base) {
    const base = await loadRef({ data: b.base });
    let fix = clip(b.fix, 500).trim();
    const list = (Array.isArray(b.fixes) ? b.fixes : []).map((x) => clip(x, 220)).filter(Boolean).slice(0, 4);
    if (list.length) {
      const how = await planFixes(env, base, list).catch(() => "");
      fix = how || "Improve the advert as described: " + list.join(" ") + " Do not change the layout, headline or wording; keep every element in its place.";
    }
    const offer = clip(b.offer, 80).trim();
    if (offer) {
      // An art director's decision first: where this offer goes, how big and in what style depends on this particular ad.
      const how = await planOffer(env, base, offer).catch(() => "");
      fix = `Add this offer to the advert, spelled exactly as written: "${offer}". ${how || "Choose the placement, size and style that suit this advert, make it easy to read on a phone, and keep a margin from the edges."} Do not move, resize or overlap anything that is already in the image; every existing element stays exactly as it is.`;
    }
    if (!fix) throw new Error("Say what to change");
    return geminiImage(env, [inline(base), ...refs.map(inline), { text: `The FIRST image is an advert that already exists. Change it as described and keep everything else exactly as it is: same model, same framing, same light, same text unless told otherwise. Do NOT resize, move, crop, re-space or re-layout any element: every headline, text block, product and picture keeps exactly the same size and position as in this first image, and nothing may overlap anything it did not overlap before. Change only the one thing named below, as little as possible.\nChange: ${fix}\n${refs.length ? PRODUCT_TRUTH(refs.length) + " The product in the advert must stay identical to it." : "The product in the advert must stay exactly as it is in the first image."} Any text on the image must be spelled exactly and stay sharp.` }], b.quality, ratio);
  }
  if (!b.template) throw new Error("template required");
  const style = await loadRef({ data: b.template });
  const about = clip(b.about, 400).trim(), note = clip(b.note, 300).trim(), where = clip(b.placement, 160).trim();
  // A logo or print is not a whole garment: it goes small and neat on the garment unless the customer says where and how big.
  const place = where
    ? `\nLOGO PLACEMENT, follow exactly: if the customer's photo is a logo, graphic or print rather than a complete product, apply it on the product in the advert like this: ${where}. Keep that size and spot, judged against the garment as seen in the first image. A "small" logo is pocket-sized, about 8 to 12 percent of the garment's width, much smaller than a palm.`
    : "\nIf the customer's photo is only a logo, graphic or print rather than a complete product, it is the print for the garment or product in the advert: place it SMALL and neat in the natural logo spot (for a top, on the chest, about the size of a palm, a pocket-sized mark, roughly 8 to 12 percent of the garment's width). Never blow it up across the whole front and never centre a huge print unless asked.";
  if (b.mode !== "inspired") {
    // One to one: the template photo is edited, not re-imagined, so the person, place and light stay as they are.
    const words = b.keepText ? "Keep every word of text in the image exactly as it is, in the same place and style."
      : headline ? `Replace ALL of the old headline text in the image (every line of it, including any second or smaller line) with this new text and nothing else: "${headline}". Use the same place, font style and weight as the old headline. None of the old words may remain anywhere in the image. Any text that is part of the customer's own photo stays as it is. ${NATIVE_TEXT}`
      : "Remove all headline and caption text from the image and leave clean background where it was.";
    return geminiImage(env, [inline(style), ...refs.map(inline), { text: `RULE ONE, above everything else: DO NOT CHANGE THE FIRST IMAGE. This is a photo edit, not a new picture. Keep every person, face, hair style, hair texture, skin tone, body, pose, hand, prop, background, light, colour, crop and word exactly as they are, and change only the single thing described below.
The FIRST image is a finished advert photo. EDIT it, do not recreate it. The other image${refs.length > 1 ? "s are the customer's own photos" : " is the customer's own photo"} and must be used AS THEY ARE, never redrawn, restyled, re-posed or turned into a flat-lay or cut-out. If the first image shows a picture inside it (a photo printed in a newspaper or magazine, on a screen, a poster, a card), put the customer's photo there unchanged: same person, same clothes, same background, same crop, only scaled to fit that frame. If the first image shows the product physically worn or held, replace only that product with the real product from the customer's photo. Everything else must stay pixel-for-pixel the same: the same person with the same face, hair, skin, pose and expression, the same clothes other than the product, the same background, camera angle, framing, lighting and colours. Never change the person's skin tone, ethnicity, age, face, hair colour, hair length, hair texture or hairstyle, and never swap them for someone else, even slightly. If the person has dark skin or curly hair they keep it exactly. Do not move, raise, lower, resize, crop or re-pose anything: every hand, arm, object, prop and the whole body stay in exactly the same place in the frame, and a face that is visible stays fully visible and uncovered. Treat the first image as a locked layer and only paint the new product over the old one inside the area the old product occupied.
${words}
${PRODUCT_TRUTH(refs.length)}
FINAL CHECK before you answer: the result must look like the first image with only the product area swapped. If the person, her hair, her skin tone, her pose, the newspaper position or the background differ from the first image in any way, you have failed; redo it. The customer's photo itself must look exactly like the uploaded photo.${place}${note ? `\nAbout the product: ${note}` : ""}` }], b.quality, ratio);
  }
  let plan = null;
  if (b.mode === "inspired" && env.ANTHROPIC_KEY) plan = await planInspired(env, style, refs, note, headline, about).catch(() => null);
  const planned = plan && plan.format ? `\nAD FORMAT TO REPRODUCE: ${plan.format}. LAYOUT: ${plan.layout}` : "";
  const finalText = plan && plan.format
    ? (plan.hasText
      ? `Print exactly this wording on the ad, spelled exactly as written, in the same lettering style, size and placement as the reference, crisp and fully readable, line by line:\n${plan.lines.map((l) => '"' + l + '"').join("\n")}\nWrite nothing else anywhere apart from what is on the product itself.`
      : "The reference has no wording, so add no headline, caption, watermark or logo. The only lettering allowed is what is on the product itself.")
    : text;
  return geminiImage(env, [inline(style), ...refs.map(inline), { text: `Create a photorealistic ${ratio} portrait advert for Facebook and Instagram.
${b.mode === "inspired"
  ? "The FIRST image is an inspiration reference, an existing advert. Make a NEW advert in the SAME FORMAT. First work out what kind of ad it is (for example a typed or notes text card, a script sheet, a review or testimonial card, a before and after split, a poster with a big headline, a UGC selfie, a model photo, a product on a surface, a screenshot style ad). The new ad MUST be that same kind of ad with the same structure and the same types of elements in the same kind of arrangement (text blocks, an inset product photo, badges, a person only if the reference has one). Rebuild it for the customer's product with fresh wording, new small details and a new look within the same mood and palette. Do not turn a text or graphic ad into a photo of a person, and do not turn a photo ad into a text card. Do not copy the reference's product, its wording about another product, or any logo or brand name in it."
  : "The FIRST image is the exact layout to reproduce, an existing advert. Recreate it one to one: same composition, camera angle, framing, setting, model pose, lighting, colour mood and the same place for the text. The only thing that changes is the product. Do not copy its product, its wording, or any logo or brand name in it."}${about ? `\nWhat the reference shows: ${about}` : ""}${planned}
${PRODUCT_TRUTH(refs.length)}
Put the real product where the reference has its product: worn by the model if the reference shows a model and the product is clothing, footwear or an accessory, otherwise held, standing in the scene, or shown as the reference shows its product (for example a small photo in a corner), at a similar size in the frame. The customer's photos only show the product: use the product from them, not the person wearing it, unless the reference format has a person. The whole product must be in frame and clearly visible. Anything else the model wears is plain and neutral (black, grey or white) and never matches the product's colour, so only the real product stands out. People must look real, with natural hands and faces. Natural or cool light, never an orange glow.${place}${note ? `\nAbout the product: ${note}` : ""}
${finalText}` }], b.quality, ratio);
}

/* ------------------------ One competitor creative, broken down ------------------------ */
// Claude reads one ad image (plus its text) and returns the pieces a creative strategist would note.
// Only Meta's own image hosts are fetched, so this route can't be used to reach anything else.
const AD_IMG_HOST = /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com|cdninstagram\.com|tiktokcdn(-[a-z]{2,3})?\.com|tiktokv\.(com|us|eu)|googlesyndication\.com)$/i;
const AWARENESS = ["unaware", "problem", "solution", "product", "most"];

async function creativeBreakdown(env, b) {
  let host = "";
  try { host = new URL(String(b.img || "")).hostname; } catch (e) { /* handled below */ }
  if (!AD_IMG_HOST.test(host)) throw bad("That creative image can't be read");
  const ref = await loadRef({ url: b.img }, AD_IMG_HOST);
  const organic = b.kind === "organic";
  const prompt = `You are a senior direct-response creative strategist breaking down ONE competitor ${organic ? "organic social post (not a paid ad, so there is no button)" : "ad (Meta, " + (clip(b.format, 20) || "unknown format") + ")"}. If it is a video you only see its cover frame, so do not describe motion or audio you cannot see.
Brand: ${clip(b.brand, 80) || "unknown"}. ${organic ? "Posted" : "Running for"} ${Number(b.days) >= 0 ? Number(b.days) + (organic ? " days ago" : " days") : "an unknown time" + (organic ? " ago" : "")}.
${organic ? "Post caption" : "Ad text"}: headline "${clip(b.headline, 160)}"${b.body ? `, body "${clip(b.body, 500)}"` : ""}${b.cta ? `, button "${clip(b.cta, 40)}"` : ""}.
Describe only what is visible in the image or written in the ad text. Never invent claims, prices, results or reviews. If an element is not present write "Not shown".
Return ONLY JSON: {"hook":"how it grabs attention in the first second, one sentence","problem":"the problem or desire it points at","solution":"how the product answers it","proof":"social proof, demo, result or authority shown","offer":"discount, bundle, guarantee or urgency","cta":"the call to action","visual":"what the image shows and how it is composed, one sentence","angle":"the creative angle in 2 to 5 words","awareness":"unaware | problem | solution | product | most","persona":"who this speaks to, one short line","tags":["max 5 short tags such as UGC, text overlay, before and after, founder, demo"],"why":"one sentence on why this may be working"}
Inside JSON strings use single quotes when you quote words, never double quotes.`;
  const o = await askClaude(env, [{ type: "image", source: { type: "base64", media_type: ref.mime, data: ref.data } }, { type: "text", text: prompt }], 900);
  const aw = String(o.awareness || "").toLowerCase();
  const f = (k, n = 240) => clip(o[k], n) || "Not shown";
  return {
    hook: f("hook"), problem: f("problem"), solution: f("solution"), proof: f("proof"), offer: f("offer"), cta: f("cta", 120),
    visual: f("visual"), angle: f("angle", 60), persona: f("persona", 160), why: f("why", 300),
    awareness: AWARENESS.find((a) => aw.startsWith(a)) || "",
    tags: (Array.isArray(o.tags) ? o.tags : []).map((t) => clip(t, 30)).filter(Boolean).slice(0, 5),
  };
}

/* ------------------------ Find an advertiser by name ------------------------ */
// ScrapeCreators' Ad Library company search: 1 credit per search, returns the page id the Spy needs.
async function brandSearch(env, b) {
  const q = clip(b.q, 80).trim();
  if (q.length < 2) throw bad("Type at least 2 letters");
  if (!env.SCRAPECREATORS_KEY) throw bad("Brand search is not set up on the server. Paste an Ad Library link instead.");
  const r = await fetch("https://api.scrapecreators.com/v1/facebook/adLibrary/search/companies?" + new URLSearchParams({ query: q }), { headers: { "x-api-key": env.SCRAPECREATORS_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error("Brand search failed: " + String(j.message || j.error || r.status).slice(0, 120));
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    brands: (Array.isArray(j.searchResults) ? j.searchResults : []).filter((x) => x && x.page_id && !x.page_is_deleted).slice(0, 12).map((x) => ({
      id: String(x.page_id).replace(/\D/g, ""), name: clip(x.name, 120), category: clip(x.category, 60),
      likes: num(x.likes), ig: clip(x.ig_username, 60), igFollowers: num(x.ig_followers),
      verified: /^(BLUE|GRAY|GREY)_VERIFIED$/i.test(String(x.verification || "")), avatar: AD_IMG_HOST.test((() => { try { return new URL(x.image_uri).hostname; } catch (e) { return ""; } })()) ? String(x.image_uri) : "",
    })),
  };
}

/* ------------------------ A brand's organic posts (Instagram + TikTok) ------------------------ */
// ScrapeCreators, 1 credit per request: two pages of Instagram posts and one page of TikTok's most popular videos.
// Posts are returned in one shape, best first, so the page can show them like ads.
const HANDLE_RE = /^[A-Za-z0-9._]{1,40}$/;
const cleanHandle = (v) => {
  let s = String(v || "").trim();
  const m = s.match(/(?:instagram\.com|tiktok\.com)\/@?([A-Za-z0-9._]+)/i);   // a pasted profile link
  if (m) s = m[1];
  s = s.replace(/^@+/, "").replace(/[/?#].*$/, "");
  if (/^(p|reel|reels|tv|explore|stories|accounts|video|tag|share)$/i.test(s)) return "";
  return HANDLE_RE.test(s) ? s : "";
};
const nz = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

async function scGet(env, path, params) {
  const r = await fetch("https://api.scrapecreators.com" + path + "?" + new URLSearchParams(params), { headers: { "x-api-key": env.SCRAPECREATORS_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error(String(j.message || j.error || "ScrapeCreators " + r.status).slice(0, 140));
  return j;
}

/* ---------------------- Google and TikTok ads (read through ScrapeCreators) ----------------------
   The Google Ads Transparency Center and TikTok's ad library list each creative with its dates and a picture but almost
   no ad copy, so these reports lean on the pictures, the formats and how long each ad has run. Field names follow
   ScrapeCreators' documented samples; each read is defensive in case a field is missing. */
const listOf = (j, ...keys) => { for (const k of keys) if (j && Array.isArray(j[k])) return j[k]; return []; };
const httpsUrl = (v) => (/^https:\/\//i.test(String(v || "")) ? String(v) : "");
const shown = (startMs, endMs) => {
  const active = !endMs || Date.now() - endMs < 4 * 86400000;   // the libraries only record when an ad was last seen
  return { startMs, endMs: active ? null : endMs, active, days: startMs ? Math.max(0, Math.round(((active ? Date.now() : endMs) - startMs) / 86400000)) : null };
};

function googleAd(it, name) {
  const fmt = String(it.format || "").toLowerCase();
  return {
    libId: String(it.creativeId || ""), advertiser: String(it.advertiserName || name || ""),
    headline: fmt === "text" ? "Text ad" : fmt === "video" ? "Video ad" : "Image ad", body: "", cta: "",
    format: fmt === "video" ? "Video" : "Static", ...shown(toMs(it.firstShown), toMs(it.lastShown)),
    creator: "", img: httpsUrl(it.imageUrl), imgs: [], versions: 1, link: "", kind: "",
  };
}

function tiktokAd(it, name) {
  const v = Array.isArray(it.videos) && it.videos[0] || {};
  const img = httpsUrl(v.cover_img) || httpsUrl(Array.isArray(it.image_urls) && it.image_urls[0]);
  const video = !!(v.video_url || v.cover_img);
  return {
    libId: String(it.id || ""), advertiser: String(it.name || name || ""),
    headline: video ? "Video ad" : "Image ad", body: "", cta: "", format: video ? "Video" : "Static",
    ...shown(toMs(it.first_shown_date), toMs(it.last_shown_date)),
    creator: "", img, imgs: [], versions: 1, link: "", kind: it.estimated_audience ? "estimated audience " + clip(it.estimated_audience, 20) : "",
  };
}

async function pagedAds(env, path, params, map, cap) {
  const seen = new Set(), out = [];
  let cursor = "";
  for (let page = 0; page < 8 && out.length < cap; page++) {
    const j = await scGet(env, path, cursor ? { ...params, cursor } : params);
    const items = listOf(j, "ads");
    items.map(map).forEach((a) => { if (a.libId && !seen.has(a.libId)) { seen.add(a.libId); out.push(a); } });
    cursor = String(j.cursor || "");
    if (!cursor || !items.length || j.has_more === false) break;
  }
  return out.slice(0, cap);
}

// Search by name: the advertiser behind a name, so the page can offer a pick list like the Meta brand search.
async function platformFind(env, b) {
  const q = clip(b.q, 80).trim();
  if (q.length < 2) throw bad("Type at least 2 letters");
  if (!env.SCRAPECREATORS_KEY) throw bad("Search is not set up on the server. Paste a library link instead.");
  if (b.platform === "google") {
    const j = await scGet(env, "/v1/google/adLibrary/advertisers/search", { query: q });
    const rows = [j.advertisers, j.results, j.items, j.data].find(Array.isArray) || [];
    const list = rows.map((x) => ({ id: String(pick(x.advertiserId, x.advertiser_id, x.id, "")), name: clip(pick(x.advertiserName, x.advertiser_name, x.name, ""), 120), sub: clip(pick(x.region, x.country, x.location, ""), 40) })).filter((x) => x.id && x.name);
    const dom = q.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dom)) list.unshift({ id: "domain:" + dom, name: dom, sub: "Search by website" });   // a typed website also works without an advertiser id
    return { brands: list.slice(0, 12) };
  }
  const j = await scGet(env, "/v1/tiktok/ad-library/search", { advertiser_name: q });
  const list = listOf(j, "advertiser_matches").map((x) => ({ id: String(x.ids || ""), name: clip(x.name, 120), sub: "" })).filter((x) => x.id && x.name);
  const first = listOf(j, "ads")[0];
  if (!list.length && first && first.adv_biz_ids) list.push({ id: String(first.adv_biz_ids), name: clip(first.name || q, 120), sub: "" });
  return { brands: list.slice(0, 12) };
}

async function writePlatformSlide(env, ads, brand, platform, images) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const count = (f) => ads.filter(f).length;
  const months = {};
  ads.forEach((a) => { if (a.startMs) { const k = day(a.startMs).slice(0, 7); months[k] = (months[k] || 0) + 1; } });
  const longest = [...ads].filter((a) => a.days != null).sort((x, y) => y.days - x.days).slice(0, 12)
    .map((a) => `${a.format}${a.kind ? " (" + a.kind + ")" : ""} | ${a.days} days | ${day(a.startMs)} to ${a.active ? "still running" : day(a.endMs)}`).join("\n");
  const lib = platform === "google" ? "Google Ads Transparency Center (search, display and YouTube ads)" : "TikTok ad library";
  const prompt = `You are a direct-response paid media analyst studying a competitor's ads from the ${lib}. Today is ${day(Date.now())}. Advertiser: ${brand || "unknown"}.
This library gives each ad's format, dates and a picture, but almost no ad copy, spend or results. Read the facts below and the creatives shown after them. Never invent copy, spend, audiences, results or numbers that are not shown.
Ads read: ${ads.length}. Still running: ${count((a) => a.active)}. Video: ${count((a) => a.format === "Video")}. Image or text: ${count((a) => a.format !== "Video")}.
Ads started per month: ${Object.entries(months).sort().slice(-14).map(([m, n]) => m + " x" + n).join(", ") || "unknown"}.
Longest-running ads:
${longest || "(no dates)"}
Return ONLY JSON:
{"slide":[5 to 7 short bullets in the style of an agency competitor slide],
"report":[{"title":"section name","bullets":["one finding per bullet"]}],
"creatives":[{"i":1,"sees":"one sentence on what creative 1 shows"}],
"insights":[3 to 5 short bullets a media buyer can act on]}
Use hedged wording ("seems to", "appears to"). For "report" use these sections and skip any the facts and pictures do not support, up to 5 bullets each: "Formats and creative style", "What has run longest", "Offers and text printed on the creatives", "Cadence and timing".
Inside JSON strings use single quotes when you quote words, never double quotes.`;
  const content = [{ type: "text", text: wf(prompt) }];
  images.forEach((im, i) => {
    content.push({ type: "text", text: wf(`Creative ${i + 1}: ${im.format}${im.days != null ? ", live " + im.days + " days" : ""}`) });
    content.push({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } });
  });
  const out = await askClaude(env, content, 4000);
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
  return {
    slide: list(out.slide, 8, 400), insights: list(out.insights, 6, 400),
    report: (Array.isArray(out.report) ? out.report : []).map((s) => ({ title: clip(s && s.title, 60), bullets: list(s && s.bullets, 8, 400) })).filter((s) => s.title && s.bullets.length).slice(0, 6),
    creatives: (Array.isArray(out.creatives) ? out.creatives : []).map((c) => { const im = images[Number(c && c.i) - 1]; return im ? { libId: im.libId || "", img: im.url || "", n: im.n, format: im.format, sees: clip(c.sees, 300) } : null; }).filter(Boolean).slice(0, 12),
  };
}

async function platformRead(env, b) {
  const platform = b.platform === "google" ? "google" : b.platform === "tiktok" ? "tiktok" : "";
  if (!platform) throw bad("Pick Google or TikTok");
  if (!env.SCRAPECREATORS_KEY) throw bad("Google and TikTok are not set up on the server.");
  const id = String(b.id || "").replace(/[^A-Za-z0-9:._-]/g, "").slice(0, 80), name = clip(b.name, 120).trim();
  if (!id) throw bad("Pick the advertiser from the search, or paste its library link.");
  const cap = Math.min(Number(env.MAX_ADS) || 200, 400);
  let ads;
  if (platform === "google") {
    ads = await pagedAds(env, "/v1/google/company/ads", id.startsWith("domain:") ? { domain: id.slice(7) } : { advertiser_id: id }, (it) => googleAd(it, name), cap);
  } else {
    if (!name) throw bad("TikTok needs the advertiser's name as well. Pick it from the search or paste its library link.");
    ads = await pagedAds(env, "/v1/tiktok/ad-library/search", { advertiser_name: name, adv_biz_ids: id }, (it) => tiktokAd(it, name), cap);
  }
  if (!ads.length) throw bad(`No ${platform === "google" ? "Google" : "TikTok"} ads found for that advertiser.`);
  const brand = name || ads[0].advertiser;
  let slide = [], insights = [], report = [], creatives = [], aiError = "";
  const { images, vision } = await readAdImages(env, ads);
  try { ({ slide, insights, report, creatives } = await writePlatformSlide(env, ads, brand, platform, images)); } catch (e) { aiError = String(e.message || e).slice(0, 200); }
  return { platform, count: ads.length, brand, ads, slide, insights, report, creatives, aiError, vision };
}

function igPost(it, handle) {
  const cap = it.caption && typeof it.caption === "object" ? it.caption.text : it.caption;
  const cand = (m) => (m && m.image_versions2 && Array.isArray(m.image_versions2.candidates) && m.image_versions2.candidates[0] && m.image_versions2.candidates[0].url) || "";
  const thumb = cand(it) || (Array.isArray(it.carousel_media) && cand(it.carousel_media[0])) || String(it.thumbnail_url || "");
  const video = it.media_type === 2 || (Array.isArray(it.video_versions) && it.video_versions.length > 0);
  const code = String(it.code || "").replace(/[^A-Za-z0-9_-]/g, "");
  return {
    platform: "instagram", id: String(it.pk || it.id || code), handle,
    url: code ? `https://www.instagram.com/${video ? "reel" : "p"}/${code}/` : "",
    caption: clip(cap, 600), likes: nz(it.like_count), comments: nz(it.comment_count),
    views: nz(it.play_count || it.view_count || it.ig_play_count), shares: 0,
    thumb: String(thumb), ts: nz(it.taken_at) * 1000 || Date.parse(it.created_at) || 0, video, carousel: Array.isArray(it.carousel_media) && it.carousel_media.length > 1,
  };
}

function ttPost(it, handle) {
  const s = it.statistics || {};
  const v = it.video || {};
  const first = (o) => (o && Array.isArray(o.url_list) && o.url_list[0]) || "";
  const slide = it.image_post_info && Array.isArray(it.image_post_info.images) && it.image_post_info.images[0];
  const thumb = first(v.dynamic_cover) || first(v.cover) || first(v.origin_cover) || (slide && (first(slide.display_image) || first(slide.thumbnail))) || "";
  const id = String(it.aweme_id || "").replace(/\D/g, "");
  return {
    platform: "tiktok", id, handle, url: id ? `https://www.tiktok.com/@${handle}/video/${id}` : "",
    caption: clip(it.desc, 600), likes: nz(s.digg_count), comments: nz(s.comment_count), views: nz(s.play_count), shares: nz(s.share_count),
    thumb: String(thumb), ts: nz(it.create_time) * 1000, video: !slide, carousel: !!slide, pinned: it.is_top === 1, ad: !!it.is_ad,
  };
}

async function organicPosts(env, b) {
  if (!env.SCRAPECREATORS_KEY) throw bad("Organic research is not set up on the server.");
  const ig = cleanHandle(b.instagram), tt = cleanHandle(b.tiktok);
  if (!ig && !tt) throw bad("Add an Instagram or TikTok handle, or a profile link");
  const out = { posts: [], notes: [] };
  const jobs = [];
  if (ig) jobs.push((async () => {
    let cursor = "";
    for (let page = 0; page < 2; page++) {
      const j = await scGet(env, "/v2/instagram/user/posts", { handle: ig, ...(cursor ? { next_max_id: cursor } : {}) });
      const items = Array.isArray(j.items) ? j.items : [];
      items.forEach((it) => out.posts.push(igPost(it, ig)));
      cursor = String(j.next_max_id || "");
      if (!j.more_available || !cursor || !items.length) break;
    }
  })().catch((e) => out.notes.push("Instagram: " + e.message)));
  if (tt) jobs.push((async () => {
    const j = await scGet(env, "/v3/tiktok/profile/videos", { handle: tt, sort_by: "popular" });
    (Array.isArray(j.aweme_list) ? j.aweme_list : []).forEach((it) => { const p = ttPost(it, tt); if (p.id && !p.ad) out.posts.push(p); });
  })().catch((e) => out.notes.push("TikTok: " + e.message)));
  await Promise.all(jobs);
  // Views exist only for videos (and Instagram photos have none), so ranking by engagement keeps both comparable.
  const score = (p) => p.likes + p.comments * 5 + p.shares * 3;
  const seen = new Set();
  out.posts = out.posts.filter((p) => p.id && (p.thumb || p.caption) && !seen.has(p.platform + ":" + p.id) && seen.add(p.platform + ":" + p.id)).sort((a, c) => score(c) - score(a)).slice(0, 48);
  if (!out.posts.length && !out.notes.length) out.notes.push("No public posts came back for that handle.");
  return out;
}

/* ------------------------ Ask a question about one advertiser's ads ------------------------ */
// The page sends the ads it already has (compact), so nothing is fetched again. Claude answers from them only
// and names the ads it used as evidence, which the page shows as thumbnails.
async function askAds(env, b) {
  const question = clip(b.question, 400).trim();
  if (!question) throw bad("Ask a question first");
  const ads = (Array.isArray(b.ads) ? b.ads : []).filter((a) => a && typeof a === "object").slice(0, 400);
  if (!ads.length) throw bad("Analyze an advertiser first");
  const lines = ads.map((a, i) => `${i + 1} | ${clip(a.format, 12)} | ${Number.isFinite(Number(a.days)) ? Number(a.days) + "d" : "?"} | ${clip(a.start, 10) || "?"} | ${clip(a.headline, 140)}${a.body ? " / " + clip(a.body, 220) : ""}${a.cta ? " [" + clip(a.cta, 30) + "]" : ""}`).join("\n");
  const history = (Array.isArray(b.history) ? b.history : []).filter((h) => h && typeof h === "object").slice(-4).map((h) => `Q: ${clip(h.q, 300)}\nA: ${clip(h.a, 700)}`).join("\n\n");
  const prompt = `You are a senior paid-social strategist answering a question about ONE advertiser's Meta ads. Today is ${new Date().toISOString().slice(0, 10)}. Advertiser: ${clip(b.brand, 80) || "unknown"}.
Each line is one ad: number | format | days running | first seen (YYYY-MM-DD) | headline / body [button].
Answer only from these ads. Do not mention ad numbers in the answer; list them only in "evidence". Ad libraries show what runs, not spend or results, so treat long-running ads as likely winners and say so plainly when that matters. Never invent numbers, products or claims. If the ads cannot answer the question, say what is missing.
${history ? "Earlier in this conversation:\n" + history + "\n" : ""}
Question: ${question}

Return ONLY JSON: {"answer":"a direct answer in 2 to 6 short paragraphs or bullets (lines starting with '- '), plain text, no markdown headings","evidence":[up to 6 ad numbers that best support the answer]}
Inside JSON strings use single quotes when you quote words, never double quotes.

ADS:
${lines}`;
  const o = await askClaude(env, prompt, 1400);
  const ev = (Array.isArray(o.evidence) ? o.evidence : []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= ads.length);
  return { answer: String(o.answer || "").slice(0, 3000), evidence: [...new Set(ev)].slice(0, 6).map((n) => String(ads[n - 1].id || "")) };
}

/* ------------------------ Winning ads library ------------------------ */
// Ads that have run for a month or more are the ones their advertiser keeps paying for, so they are the best public
// sign of a winner. Each category names well-known advertisers; their ads are read from the Ad Library once, kept
// for two days, and every visitor after that is served the saved copy (about 2 credits per brand per refresh).
const LIBRARY = {
  skincare: { label: "Skincare & beauty", brands: ["Glow Recipe", "Summer Fridays", "Tatcha", "Sol de Janeiro", "Rare Beauty", "Olaplex", "Function of Beauty"] },
  fashion: { label: "Fashion & apparel", brands: ["Gymshark", "SKIMS", "Fabletics", "Princess Polly", "Vuori", "Allbirds", "Bombas"] },
  health: { label: "Health & supplements", brands: ["Athletic Greens", "Ritual", "Huel", "Bloom Nutrition", "Liquid I.V.", "Transparent Labs", "Hims"] },
  home: { label: "Home & living", brands: ["Brooklinen", "Parachute", "Our Place", "Ruggable", "Purple Mattress", "Casper", "Quip"] },
  pets: { label: "Pets", brands: ["BarkBox", "The Farmer's Dog", "Ollie", "Wild One", "Chewy", "Fi Collar"] },
  food: { label: "Food & drink", brands: ["Magic Spoon", "Olipop", "Athletic Brewing", "Graza", "Liquid Death", "Poppi", "HelloFresh"] },
  tech: { label: "Tech & gadgets", brands: ["Oura", "Anker", "Casetify", "Ember", "Therabody", "Whoop", "Peloton"] },
  jewelry: { label: "Jewelry & accessories", brands: ["Mejuri", "Pandora", "Gorjana", "Brilliant Earth", "Missoma", "Vrai"] },
};
const LIB_TTL = 2 * 86400;
const LIB_MIN_DAYS = 30;

const nameKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const metaHostOk = (u) => { try { return AD_IMG_HOST.test(new URL(String(u)).hostname); } catch (e) { return false; } };

// The Ad Library page for a brand name: an exact name match, else the most followed result.
async function findPage(env, name) {
  const j = await scGet(env, "/v1/facebook/adLibrary/search/companies", { query: name });
  const list = (Array.isArray(j.searchResults) ? j.searchResults : []).filter((x) => x && x.page_id && !x.page_is_deleted);
  const hit = list.find((x) => nameKey(x.name) === nameKey(name)) || list.slice().sort((a, c) => (Number(c.likes) || 0) - (Number(a.likes) || 0))[0];
  if (!hit) return null;
  return { id: String(hit.page_id).replace(/\D/g, ""), name: clip(hit.name, 120), ig: clip(hit.ig_username, 60), avatar: metaHostOk(hit.image_uri) ? String(hit.image_uri) : "" };
}

async function winningAds(env, b) {
  const niche = Object.prototype.hasOwnProperty.call(LIBRARY, b.niche) ? b.niche : "";
  if (!niche) throw bad("Pick a category");
  if (!env.SCRAPECREATORS_KEY) throw bad("The winning ads library is not set up on the server yet.");
  const key = "https://library.addoctor.internal/v1/" + niche;
  const hit = typeof caches !== "undefined" ? await caches.default.match(key) : null;
  if (hit) { try { return await hit.json(); } catch (e) { /* read it again below */ } }
  const lists = await Promise.all(LIBRARY[niche].brands.map(async (name) => {
    try {
      const pg = await findPage(env, name);
      if (!pg) return [];
      const { items } = await scAds(env, { id: pg.id, country: "ALL" }, "", 1, 40);
      const seen = new Set();
      return items.map(normalize)
        .filter((a) => a.libId && a.img && a.days !== null && a.days >= LIB_MIN_DAYS && (a.headline || a.body) && !seen.has(a.libId) && seen.add(a.libId))
        .sort((x, y) => y.days - x.days).slice(0, 6)
        .map((a) => ({ libId: a.libId, advertiser: pg.name, avatar: pg.avatar, headline: a.headline, body: a.body, cta: a.cta, format: a.format, days: a.days, active: a.active, img: a.img, link: a.link }));
    } catch (e) { return []; }
  }));
  const ads = lists.flat().sort((x, y) => y.days - x.days).slice(0, 48);
  if (!ads.length) throw new Error("Could not load winning ads for this category right now. Try again in a minute.");
  const out = { niche, label: LIBRARY[niche].label, ads, updated: new Date().toISOString(), minDays: LIB_MIN_DAYS };
  if (typeof caches !== "undefined") { try { await caches.default.put(key, new Response(JSON.stringify(out), { headers: { "Cache-Control": `max-age=${LIB_TTL}`, "Content-Type": "application/json" } })); } catch (e) { /* served uncached */ } }
  return out;
}

/* ------------------------ Find your competitors ------------------------ */
// Claude searches the web to learn what the brand sells and who it sells to, then names the brands that compete
// for the same buyer. Each one is matched to its Ad Library page so the page can open Competitor Spy on it.
async function askClaudeSearch(env, prompt, maxTokens = 3000) {
  const call = async (withSearch) => {
    const body = { model: env.MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
    if (withSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || "Anthropic error " + r.status), { status: r.status });
    return (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  };
  let text;
  try { text = await call(true); } catch (e) { if ([400, 403, 404].includes(e.status)) text = await call(false); else throw e; }   // no web search for this key or model: answer from what the model knows
  try { return parseLoose(text); } catch (e) { return askClaude(env, "Return the following answer as the JSON object it describes, and nothing else:\n\n" + text, maxTokens); }
}

async function findRivals(env, b) {
  const input = clip(b.brand, 200).trim();
  if (input.length < 2) throw bad("Type your brand name or paste your website");
  const looksUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(input);
  const site = looksUrl ? safeUrl(input).hostname.replace(/^www\./, "") : "";
  // The market changes who competes: a brand's rivals in one country are not the same as its rivals worldwide.
  const code = /^[A-Za-z]{2}$/.test(String(b.market || "")) ? String(b.market).toUpperCase() : "";
  let country = "";
  try { country = code ? new Intl.DisplayNames(["en"], { type: "region" }).of(code) || "" : ""; } catch (e) { /* unknown code: treated as global */ }
  const market = country ? code : "";
  const where = country
    ? `Market: ${country} only. Find competitors that sell to and advertise to buyers in ${country}: local brands from ${country} and international brands that actively sell there. Judge price level against that market and search in ${country}'s language as well as English. Ignore brands that do not serve ${country}.`
    : `Market: global. Find the main international competitors that sell across several countries, not brands that only sell in one local market.`;
  // 1. Who the brand really is. A bare name can belong to unrelated businesses, so confirm it, then describe its look and buyer.
  let siteText = "";
  if (site) { try { siteText = clip((await readStore(safeUrl(site))).text, 2000); } catch (e) { /* the web search below still works */ } }
  const profPrompt = `You are a brand strategist. Work out who this brand really is. Brand: ${site || input}.
${siteText ? "Text from its own website:\n" + siteText + "\n" : ""}Use web search to confirm you have the right brand ("${input}" may be a name shared by unrelated businesses: find its own website and social profiles) and to learn its look and its customers.
Return ONLY JSON: {"name":"","site":"domain.com","country":"where it is based","sells":"what it sells, one sentence","look":"its brand style in a few words, e.g. dark minimal streetwear, pastel playful gifts, clinical premium skincare","buyer":"who buys it: age, gender, subculture or lifestyle","price":"budget, mid or premium, with a typical price","search":["3 short phrases a buyer of this brand would search to find similar brands"],"not":["2 to 4 kinds of brand that sell a similar product but are NOT competitors because their style or buyer is different"]}
Inside JSON strings use single quotes when you quote words, never double quotes.`;
  const prof = (await askClaudeSearch(env, profPrompt, 1500)) || {};
  const profile = { name: clip(prof.name, 80) || input, site: site || String(prof.site || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0].slice(0, 80), country: clip(prof.country, 60), sells: clip(prof.sells, 240), look: clip(prof.look, 140), buyer: clip(prof.buyer, 240), price: clip(prof.price, 100) };

  // 2. Candidates that look like that brand, not just ones that sell the same kind of product.
  const candPrompt = `You are a market analyst finding the competitors of one brand, so a marketer can study the ads those competitors run.
${where}
Brand profile: ${JSON.stringify({ ...profile, not: Array.isArray(prof.not) ? prof.not.map((x) => clip(x, 100)) : [] })}
Use web search (for example: ${(Array.isArray(prof.search) ? prof.search : []).slice(0, 3).map((x) => '"' + clip(x, 80) + '"').join(", ") || "the brand's product type plus its style"}) to find 12 real brands whose product, STYLE and BUYER are all close to this brand's, so a marketer would put the two brands' ads side by side. A brand that sells the same type of product to a different buyer or in a different style is NOT a competitor.
Rules: only real brands operating now that you found evidence for. Never invent a brand or a website. Do not list the brand itself. Do not list marketplaces or giant general retailers unless the brand is itself one. For each, describe from its own site or social what it sells, its look and who buys it.
Return ONLY JSON: {"candidates":[{"name":"","site":"domain.com","sells":"","look":"","buyer":"","price":"cheaper, similar, pricier or unknown"}]}
Inside JSON strings use single quotes when you quote words, never double quotes.`;
  const found = await askClaudeSearch(env, candPrompt, 3500);
  const cand = (Array.isArray(found && found.candidates) ? found.candidates : []).filter((c) => c && typeof c === "object" && c.name);
  if (!cand.length) throw new Error("No competitors came back for that brand. Check the name and try again.");

  // 3. A separate, strict review: each candidate is scored against the profile and weak matches are dropped.
  const judgePrompt = `You are a strict reviewer deciding whether each candidate really competes for the same buyer as this brand.
Brand profile: ${JSON.stringify(profile)}
Candidates:
${cand.slice(0, 14).map((c, i) => `${i + 1}. ${clip(c.name, 80)} | sells: ${clip(c.sells, 120)} | look: ${clip(c.look, 100)} | buyer: ${clip(c.buyer, 120)} | price: ${clip(c.price, 20)}`).join("\n")}
Score every candidate from 0 to 10 on: product (same type of item), style (same look and brand vibe), buyer (same age, gender and lifestyle), price. "fit" is the overall score and can never be higher than the lower of style and buyer. Be strict: a different style or a different buyer is at most 4 even when the product type matches. Kids, baby or gift brands do not compete with an adult streetwear brand, and a pastel playful brand does not compete with a dark one.
Return ONLY JSON: {"scores":[{"i":1,"product":0,"style":0,"buyer":0,"price":0,"fit":0,"type":"direct or adjacent","why":"one sentence naming what this brand and the candidate share"}]}`;
  const judged = await askClaude(env, judgePrompt, 2500);
  const byI = new Map((Array.isArray(judged && judged.scores) ? judged.scores : []).map((s) => [Number(s && s.i), s]));
  const seen = new Set([nameKey(profile.name), nameKey(site.split(".")[0])]);
  const all = cand.slice(0, 14).map((c, idx) => {
    const s = byI.get(idx + 1) || {};
    const host = String(c.site || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
    return {
      name: clip(c.name, 80), site: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host.slice(0, 80) : "", why: clip(s.why, 260),
      type: /adjacent/i.test(s.type) ? "adjacent" : "direct", price: ["cheaper", "similar", "pricier"].find((p) => new RegExp("^" + p, "i").test(String(c.price || ""))) || "",
      fit: Math.max(0, Math.min(10, Math.round(Number(s.fit) || 0))),
    };
  }).filter((c) => c.name && !seen.has(nameKey(c.name)) && seen.add(nameKey(c.name))).sort((a, b) => b.fit - a.fit);
  const strong = all.filter((c) => c.fit >= 6);
  const comps = (strong.length >= 3 ? strong : all.filter((c) => c.fit >= 5)).slice(0, 8);
  if (!comps.length) throw new Error("No close competitors came back for that brand. Add its website address and try again.");
  if (env.SCRAPECREATORS_KEY) {
    await Promise.all(comps.map(async (c) => {
      try { const pg = await findPage(env, c.name); if (pg) Object.assign(c, { pageId: pg.id, pageName: pg.name, avatar: pg.avatar, ig: pg.ig }); } catch (e) { /* shown without an ads link */ }
    }));
  }
  return { brand: { name: profile.name, site: profile.site, sells: profile.sells, look: profile.look, buyer: profile.buyer }, competitors: comps, market, marketName: country };
}

// The score is a fixed rubric. The model only rates each point (full, partial or miss) and names what is wrong; the
// arithmetic is done here, so every lost point has a stated reason. The same ad always gets the same review.
const RUBRIC = [
  { id: "offer", w: 18, name: "Offer", label: "A clear offer or reason to act", ask: "Does the ad give a concrete reason to act now: a discount, free shipping, a guarantee, a bundle, a trial, a deadline, or a clear call to action tied to a real benefit? full = a concrete offer or a clear call to action with a benefit is visible. partial = a benefit is shown but no concrete offer or call to action, or the customer's note has an offer that is not shown on the ad. miss = nothing gives a reason to act. Never answer na.", always: true },
  { id: "hook", w: 12, name: "Hook and scroll-stop", label: "Stops the scroll and has one clear idea", ask: "Is the idea clear in one second, and would it stop a thumb scrolling a feed?", always: true },
  { id: "product", w: 14, name: "Product", label: "Product clear and true to its photos", ask: "Is the product easy to see and the same product as in the reference photos? Flag only real differences: a different shape, colour or material, a print or logo that is missing, wrong or clearly changed, or a product too small to recognise. Small details being small is not a flaw: a chest logo on a garment that is small in the frame cannot be legible and must not be marked down if it is in the right place and looks like the real one. Answer na when this ad's format deliberately shows no product (for example a text-only card)." },
  { id: "text", w: 10, name: "Text", label: "Text legible and correct", ask: "Is any wording spelled correctly, large enough for a phone and high contrast? Answer na when the ad has no wording." },
  { id: "craft", w: 10, name: "Visual quality", label: "Well made for its format", ask: "Is it executed well for its format: realistic if a photo, tidy and balanced if a graphic, nothing cut off, no distortions or odd hands and faces?", always: true },
  { id: "claims", w: 6, name: "Wording", label: "Believable wording, no unsupported claims", ask: "Is the wording believable? Only flag claims that contradict or go well beyond what the customer told us, and word that fix as something to check. Answer na when the ad has no wording." },
  { id: "proof", w: 10, name: "Social proof", label: "Trust signals", ask: "Is there a trust signal a stranger would believe: a star rating, review quote, customer count, press mention, guarantee badge or similar? full = a clear trust signal is visible. minor = a weak or generic one. partial or miss = none, with miss for ads that ask for a purchase with no trust at all. Never answer na. Never suggest inventing a rating or a review: the fix is to add a real one the customer has.", always: true },
  { id: "audience", w: 10, name: "Audience fit", label: "Speaks to the right buyer", ask: "Do the wording, look and tone fit the kind of buyer this product is for, judged from the product and the customer's note?", always: true },
  { id: "policy", w: 10, name: "Meta ad policy", label: "Safe under Meta's ad rules", ask: "Is the ad free of things Meta rejects: before and after body claims, guaranteed results, health or income promises, wording that points at a personal attribute of the viewer, misleading urgency or fake interface elements? full = no risk. A real risk is partial or miss and the note must name it.", always: true },
];


async function reviewKey(parts) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function makeReview(env, b) {
  const data = String(b.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!data || data.length > 3000000) throw new Error("image missing or too large");
  const headline = clip(b.headline, 90).trim(), format = clip(b.format, 200).trim(), note = clip(b.note, 300).trim();
  // The same ad, wording and context always returns the same review.
  const cacheUrl = typeof caches !== "undefined" ? "https://review.addoctor.internal/" + (await reviewKey([data, headline, format, note, String((b.refs || []).length), "v7"])) : "";
  if (cacheUrl) { const hit = await caches.default.match(cacheUrl).catch(() => null); if (hit) return hit.json(); }
  const refs = await loadRefs((Array.isArray(b.refs) ? b.refs : []).map((d) => ({ data: d })), 2).catch(() => []);
  const tpl = b.template ? await loadRef({ data: b.template }).catch(() => null) : null;
  const prompt = `You are a strict, fair creative reviewer rating one static Meta ad (Facebook and Instagram) against a fixed rubric. Rate only what you can see. Be consistent: the same ad must always get the same ratings.
${headline ? `Headline the customer asked to have printed on the image: "${headline}"` : "The customer asked for no particular headline. Wording on the image is fine when it belongs to the ad's format."}
THE AD'S FORMAT IS INTENDED. This ad was deliberately built to follow a reference ad${format ? ` of this kind: ${format}` : ""}${tpl ? ", shown in the first image" : ""}. Everything that belongs to that format (typed or handwritten text, numbered lines or labels such as Hook, Problem and Solution, a small product photo in a corner, a plain background, a UGC or screenshot look) is on purpose. Never list it as a flaw and never suggest changing the layout or the format.${note ? ` Facts the customer gave about their product, so wording that matches them is not an invented claim: ${note}` : ""}${refs.length ? " Compare the product with the reference photos of the real product; a real difference in shape, colour, print, logo design or text is a flaw, but a detail that is only small because the product is small in the frame is not." : ""}
Rate each point "full" (no flaw), "minor" (a small flaw), "partial" (a real flaw) or "miss" (a serious flaw), or "na" when its question says it may be answered na:
${RUBRIC.map((r) => `- ${r.id}: ${r.ask}`).join("\n")}
Rules: rate "full" unless you can name a concrete, visible flaw. "minor" is a small flaw, "partial" is a real flaw, "miss" is a serious one. For every point that is not "full", "note" must say exactly what the flaw is and how to fix it, in one short sentence starting with a verb, so the customer knows why points were lost. For the offer, never invent a discount or deal: say to show the offer from the customer's note, or to add one they really have (for example free shipping, a guarantee, a bundle or a deadline). For a "full" point, "note" is a short phrase on what works.
Return ONLY JSON: {"verdict":"one plain sentence","criteria":[{"id":"stop","rating":"full|minor|partial|miss|na","note":"..."}, one entry for each of the ${RUBRIC.length} ids],"regen":"a short edit instruction for an image editor, or an empty string"}
REGEN RULES: regen may only ask for SMALL, local corrections to things already in the picture, for example darken a pale grey text colour, make one blurred word sharp, fix a misspelled word, or tidy a garbled logo so it matches the product photo. It must NEVER ask to enlarge, shrink, move, crop, add or remove any element, never touch the layout, the headline, the product size or position, and never add an offer or any new wording. If a flaw can only be fixed by changing size, layout or adding something, leave it out of regen. If nothing qualifies, regen is an empty string.
Inside the JSON strings use single quotes when you quote words, never double quotes.`;
  const imgBlock = (x) => ({ type: "image", source: { type: "base64", media_type: x.mime, data: x.data } });
  const blocks = [
    ...(tpl ? [{ type: "text", text: "The reference ad whose format this ad follows:" }, imgBlock(tpl)] : []),
    ...(refs.length ? [{ type: "text", text: "Reference photos of the REAL product:" }, ...refs.map(imgBlock)] : []),
    ...(tpl || refs.length ? [{ type: "text", text: "The ad to judge:" }] : []),
  ];
  const content = [...blocks, { type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }];
  // The reply sometimes comes wrapped in another object. Read it either way, ask once more, and never return an empty score.
  const unwrap = (x) => (x && typeof x === "object" && !Array.isArray(x.criteria) ? Object.values(x).find((v) => v && typeof v === "object" && Array.isArray(v.criteria)) || x : x);
  const good = (x) => x && Array.isArray(x.criteria) && RUBRIC.every((r) => x.criteria.some((c) => c && c.id === r.id));
  let o = unwrap(await askClaude(env, content, 1200, "tool", 0));
  if (!good(o)) o = unwrap(await askClaude(env, content, 1200, "tool", 0));
  if (!good(o)) throw new Error("The check could not be read. Try again.");
  // Points that do not apply to this ad's format are left out and the rest are scaled to 100, so a good text-only ad can still score 100.
  const LEVEL = { full: 1, minor: 0.8, partial: 0.5, miss: 0.15 };
  const rated = RUBRIC.map((r) => {
    const c = o.criteria.find((x) => x && x.id === r.id);
    const k = String(c.rating || "").toLowerCase();
    return { r, c, na: k === "na" && !r.always, got: LEVEL[k] === undefined ? 0.5 : LEVEL[k] };
  });
  const total = rated.filter((x) => !x.na).reduce((a, x) => a + x.r.w, 0) || 100;
  let score = 0;
  const strengths = [], fixes = [], pillars = [];
  for (const { r, c, na, got } of rated) {
    const text = clip(c.note, 170).trim();
    if (na) { pillars.push({ id: r.id, label: r.name, na: true, note: text }); continue; }
    const share = (r.w / total) * 100;
    score += share * got;
    pillars.push({ id: r.id, label: r.name, score: Math.round(got * 100), note: text });
    if (got === 1) { if (text) strengths.push(`${r.name}: ${text}`); }
    else fixes.push(`${text || r.label} (-${Math.max(1, Math.round(share * (1 - got)))} points: ${r.name.toLowerCase()})`);
  }
  const out = { score: Math.round(score), verdict: clip(o.verdict, 240), strengths: strengths.slice(0, 3), fixes: fixes.slice(0, 5), pillars };
  if (cacheUrl) await caches.default.put(cacheUrl, new Response(JSON.stringify(out), { headers: { "Cache-Control": "max-age=2592000", "content-type": "application/json" } })).catch(() => {});
  return out;
}

/* Improve: the picture is never redrawn. A text model looks at the finished ad and designs a few text layers (an offer, a proof line,
   a supporting line); the page draws them itself with its own text engine, so the photo and the product stay exactly as they are. */
const IMPROVE_PICKS = ["offer", "proof", "line"];
const LAYER_THEMES = ["bold", "ink", "tag", "red", "outline", "script"];
const LAYER_FONTS = ["theme", "sans", "heavy", "impact", "condensed", "rounded", "serif", "elegant", "mono", "hand"];
async function makeImprove(env, b) {
  const data = String(b.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!data || data.length > 3000000) throw new Error("image missing or too large");
  const picks = [...new Set((Array.isArray(b.picks) ? b.picks : []).filter((p) => IMPROVE_PICKS.includes(p)))].slice(0, 3);
  if (!picks.length) throw new Error("Pick what to improve");
  const inp = b.inputs && typeof b.inputs === "object" ? b.inputs : {};
  const given = { offer: clip(inp.offer, 80).trim(), proof: clip(inp.proof, 90).trim() };
  if (picks.includes("offer") && !given.offer) throw new Error("Type your real offer");
  if (picks.includes("proof") && !given.proof) throw new Error("Type your real review, rating or customer count");
  const note = clip(b.note, 300).trim(), format = clip(b.format, 200).trim();
  const want = picks.map((p) => (p === "offer" ? `- kind "offer": print exactly "${given.offer}"` : p === "proof" ? `- kind "proof": print exactly "${given.proof}"` : `- kind "line": write ONE short supporting line, at most 8 words, that gives the buyer a reason to care, using only the product and the note: no numbers, no ratings, no claims, no prices`)).join("\n");
  const prompt = `You are an art director adding a few text layers on top of a finished ad. The picture itself must not change, so you only design text. Layers wanted:
${want}
${format ? `The ad's format: ${format}.` : ""}${note ? ` About the product: ${note}` : ""}
First study the ad: its typography, colours, mood (quiet and premium, or loud and promotional), what the eye reads first, and where it is empty. Then, for each layer, decide where it goes, how big, and in what style, so that it is noticed and believed but supports the ad instead of fighting its headline. There is no fixed rule: small and quiet can be right, big and bold can be right, depending on this ad. Every layer must sit in empty space, never over the product, a face or existing text, with at least 5 percent margin from the image edges, and its colours must contrast with what is behind it.
Numbers: x and y are the CENTRE of the layer as a share of the image width and height (0 to 1). s is the letter size as a share of the image width (0.035 small, 0.05 medium, 0.08 big). theme is one of ${LAYER_THEMES.join(", ")}: ink = dark bold letters, tag = dark letters on a white pill, red = white letters on a red pill, bold = white letters with a shadow, outline = white letters with a dark outline, script = italic serif. font is one of ${LAYER_FONTS.join(", ")} (theme keeps the theme's font). color is a hex colour for the letters or null, box is a hex colour for a pill behind the letters, false for none, or null to keep the theme's.
Return ONLY JSON: {"thinking":"two short sentences on what you saw and why","layers":[{"kind":"offer|proof|line","text":"...","x":0.5,"y":0.9,"s":0.05,"theme":"tag","font":"theme","color":null,"box":null}]}. Inside strings use single quotes, never double quotes.`;
  const o = await askClaude(env, [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }], 900, "tool", 0);
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || "")) ? String(c) : null);
  const got = Array.isArray(o.layers) ? o.layers : [];
  const layers = picks.map((kind, i) => {
    const l = got.find((x) => x && x.kind === kind) || {};
    const text = kind === "offer" ? given.offer : kind === "proof" ? given.proof : clip(l.text, 70).trim();
    return {
      kind, text,
      x: num(l.x, 0.1, 0.9, 0.5), y: num(l.y, 0.06, 0.94, 0.9 - 0.08 * i), s: num(l.s, 0.03, 0.11, 0.05),
      theme: LAYER_THEMES.includes(l.theme) ? l.theme : "ink", font: LAYER_FONTS.includes(l.font) ? l.font : "theme",
      color: hex(l.color), box: l.box === false ? false : hex(l.box),
    };
  }).filter((l) => l.text);
  if (!layers.length) throw new Error("Nothing could be added. Try again.");
  return { layers, thinking: clip(o.thinking, 300) };
}

async function packReview(env, b) {
  const data = String(b.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!data || data.length > 3000000) throw new Error("image missing or too large");
  const br = b.brief || {};
  const refs = await loadRefs(b.refs, 3).catch(() => []);
  const prompt = `You are an elite direct-response social creative strategist doing a "post check" on one organic Instagram feed post. Be specific, practical and honest. No filler.
Brand: ${br.product || "unknown"} for ${br.audience || "unknown"}. Tone: ${br.tone || ""}.
Caption: ${clip(b.caption, 700)}
Text that was supposed to be printed on the image: ${b.overlayText ? '"' + clip(b.overlayText, 120) + '"' : "none (the image should have no text)"}
Judge: (1) stop-power at first glance, (2) text on the image: spelled exactly as intended, legible, with contrast and margins, (3) caption hook and clarity, (4) fit with the brand, (5) one clear idea.${refs.length ? " (6) PRODUCT FIDELITY: compare the product in the post with the reference photos of the real product. Flag ANY print, graphic, logo, text, patch, embroidery, color or shape on the product that is not in the reference photos. If you find one, make it the FIRST item in fixes, lower the score by at least 20, and write regen so the image model removes it and keeps the product identical to the reference." : ""}
Return ONLY JSON: {"score":0-100,"verdict":"one plain sentence","strengths":["max 2 short items"],"fixes":["max 3 concrete changes, each starting with a verb"],"regen":"one paragraph telling an image model what to change in the image to apply the visual fixes, or empty string if the image needs no change"}
Never invent facts about the product.`;
  const blocks = refs.length
    ? [{ type: "text", text: "Reference photos of the REAL product:" }, ...refs.map((x) => ({ type: "image", source: { type: "base64", media_type: x.mime, data: x.data } })), { type: "text", text: "The generated post to judge:" }]
    : [];
  const o = await askClaude(env, [...blocks, { type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }], 900);
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))),
    verdict: clip(o.verdict, 240),
    strengths: (Array.isArray(o.strengths) ? o.strengths : []).map((x) => clip(x, 160)).slice(0, 2),
    fixes: (Array.isArray(o.fixes) ? o.fixes : []).map((x) => clip(x, 200)).slice(0, 3),
    regen: clip(o.regen, 500),
  };
}

/* ------------------------------ Abuse limits ------------------------------ */
// Every paid call (Apify, Anthropic, Gemini) goes through here, so these limits are what protect the bill.
//   ALLOW_ORIGIN   comma-separated sites allowed to call the Worker, e.g. https://nisado999.github.io
//                  When set to anything but *, requests from other sites (or with no Origin) are refused.
//   RATE_PER_HOUR  paid calls one visitor (IP address) may make per hour, default 60
//   DAILY_CAP      paid calls allowed per day across all visitors, default 300
//   USER_PER_HOUR  paid calls one signed-in account may make per hour, default 120 (instead of the per-connection limit)
//   USER_DAILY     paid calls one signed-in account may make per day, default 200
//   OWNER_EMAILS   comma-separated confirmed addresses of the site owners: the only accounts that may use raw image
//                  prompts (Template Lab), and exempt from the per-account limits
// Counters live in Cloudflare's edge cache, which is per data centre, so the numbers are approximate:
// good enough to stop a script hammering the API, not an exact meter.
const SUPABASE_URL = "https://ivzyyeokjcmsucldawja.supabase.co";   // same project as src/auth.js; SUPABASE_URL overrides it
const SUPABASE_PUBLISHABLE = "sb_publishable_U5tc2OA2H7vyDAYyVWPE9Q_U9W-aZWu";   // public by design; SUPABASE_ANON_KEY overrides it
const supaBase = (env) => String(env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, "");

// Who the Bearer token belongs to: { id, email, verified }, or null when Supabase does not accept it. Answers are kept
// for five minutes so a Social Pack does not ask Supabase 35 times. Throws when Supabase cannot be reached.
async function supaUser(env, auth) {
  const token = (auth.match(/^Bearer (\S+)$/) || [])[1];
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const key = "https://tokens.addoctor.internal/" + [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const hit = typeof caches !== "undefined" ? await caches.default.match(key) : null;
  if (hit) return hit.json();
  const r = await fetch(supaBase(env) + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE, Authorization: "Bearer " + token } });
  if (r.status === 401 || r.status === 403) return null;
  const u = r.ok ? await r.json().catch(() => null) : null;
  if (!u || !u.id) throw new Error("Could not check the sign-in");
  const who = { id: u.id, email: String(u.email || "").toLowerCase(), verified: !!u.email_confirmed_at };
  if (typeof caches !== "undefined") await caches.default.put(key, new Response(JSON.stringify(who), { headers: { "Cache-Control": "max-age=300" } }));
  return who;
}

// OWNER_EMAILS is a comma-separated list. Only a confirmed address counts.
const isOwner = (env, who) => !!who && who.verified && String(env.OWNER_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean).includes(who.email);

// Deletes the signed-in caller's own account. The caller's token says who they are; the service role key does the delete.
async function deleteAccount(env, req) {
  if (!env.SUPABASE_SERVICE_ROLE) return json(env, { error: "Deleting accounts is not set up on this server yet.", code: "not_configured" }, 501);
  const who = await supaUser(env, req.headers.get("Authorization") || "");
  if (!who) return json(env, { error: "Sign in to delete your account.", code: "signin_required" }, 401);
  const del = await fetch(supaBase(env) + "/auth/v1/admin/users/" + encodeURIComponent(who.id), { method: "DELETE", headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE } });
  if (!del.ok) return json(env, { error: "Could not delete the account. Try again." }, 502);
  return json(env, { ok: true });
}

const PAID = /^\/(start|page|analyze|creative|brands|organic|ask|rivals|spy\/|pack\/|make\/)/;

async function bump(key, ttl) {
  if (typeof caches === "undefined") return 0;
  const url = "https://limits.addoctor.internal/" + key;
  const hit = await caches.default.match(url);
  const n = (hit ? parseInt(await hit.text(), 10) || 0 : 0) + 1;
  await caches.default.put(url, new Response(String(n), { headers: { "Cache-Control": `max-age=${ttl}` } }));
  return n;
}

/* Free changes: a new ad comes back with a signed grant for its account. An edit that carries the grant is free
   until FREE_EDITS uses of that grant have been counted. Forged, expired or other people's grants never match. */
const FREE_EDITS = 2;
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function grantMac(env, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(env.GRANT_SECRET || env.GEMINI_KEY || "x"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
}
async function signGrant(env, uid) {
  const body = `${uid}.${crypto.randomUUID()}.${Date.now()}`;
  return body + "." + (await grantMac(env, body));
}
// Counts one use. Returns the free changes left after it, or -1 when the grant is not valid or is used up.
async function useGrant(env, uid, token) {
  const p = String(token || "").split(".");
  if (p.length !== 4 || p[0] !== uid) return -1;
  if (p[3] !== (await grantMac(env, p.slice(0, 3).join(".")))) return -1;
  if (Date.now() - Number(p[2]) > 6 * 3600000) return -1;
  const n = await bump(`grant/${p[1]}`, 6 * 3600);
  return n <= FREE_EDITS ? FREE_EDITS - n : -1;
}

// Used when ALLOW_ORIGIN is not set: the live site and local dev servers. Set ALLOW_ORIGIN in Cloudflare to change it.
const DEFAULT_ORIGINS = "https://nisado999.github.io,http://localhost:5173,http://localhost:4173";

function allowedOrigin(req, env) {
  const list = String(env.ALLOW_ORIGIN || DEFAULT_ORIGINS).split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (list.includes("*")) return "*";
  const origin = (req.headers.get("Origin") || "").replace(/\/+$/, "");
  return list.includes(origin) ? origin : null;
}

/* ------------------------------ Billing ------------------------------ */
// Server-side credits: one balance per signed-in account in Supabase (supabase/billing.sql), spent before each paid
// action and refunded if the action fails. Off until BILLING=on, so the code can ship before Paddle is set up.
//   BILLING                 "on" to charge credits and require sign-in for paid actions
//   SUPABASE_SERVICE_ROLE   already used by /account/delete; also runs the credit functions
//   PADDLE_WEBHOOK_SECRET   the notification destination's secret key (Paddle > Developer tools > Notifications)
//   PADDLE_CLIENT_TOKEN     Paddle's client-side token (safe to expose)
//   PADDLE_ENV              "sandbox" while testing, otherwise leave unset
//   PADDLE_PRICES           JSON mapping our price keys to Paddle price ids, for example
//                           {"starter_month":"pri_..","starter_year":"pri_..","pro_month":"pri_..","pro_year":"pri_..",
//                            "agency_month":"pri_..","agency_year":"pri_..","topup":"pri_.."}
const billingOn = (env) => String(env.BILLING || "").toLowerCase() === "on";
const TOPUP_CREDITS = 200;   // per top-up unit; keep in step with src/plans.js

// What one action costs, in credits. Keep in step with src/plans.js. /start is free but needs a balance of
// START_NEEDS, because the paid read (ScrapeCreators) happens before the analysis that is charged.
const START_NEEDS = 15;
function creditCost(path, b) {
  const premium = !!b && b.quality === "premium";
  switch (path) {
    case "/analyze": return 15;
    case "/spy/read": return 15;
    case "/creative": return 1;
    case "/ask": return 3;
    case "/organic": return 3;
    case "/rivals": return 3;
    case "/make/ad": return premium ? 12 : 5;
    case "/make/review": return 1;
    case "/make/plan": return 2;
    case "/make/improve": return 2;
    case "/pack/image": return premium ? 12 : 5;
    case "/pack/brief": case "/pack/posts": return 2;
    case "/pack/store": case "/pack/review": return 1;
    default: return 0;
  }
}

async function dbRpc(env, fn, args) {
  if (!env.SUPABASE_SERVICE_ROLE) throw Object.assign(new Error("Billing is not set up on the server yet."), { status: 502 });
  const r = await fetch(supaBase(env) + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { console.log("rpc " + fn + " failed", r.status, JSON.stringify(j).slice(0, 200)); throw Object.assign(new Error("Could not reach your credit balance. Try again."), { status: 502 }); }
  return j;
}

const accountView = (a) => ({
  plan: a.plan, status: a.status, interval: a.billing_interval || null, periodEnd: a.current_period_end || null, refillAt: a.refill_at || null,
  planCredits: a.plan_credits, extraCredits: a.extra_credits, total: a.plan_credits + a.extra_credits, segment: a.segment || null,
});

const priceKeys = (env) => { try { const m = JSON.parse(env.PADDLE_PRICES || "{}"); return m && typeof m === "object" ? m : {}; } catch (e) { return {}; } };

async function billingRoute(env, req, u) {
  const p = u.pathname;
  if (p === "/billing/config" && req.method === "GET") {
    const prices = priceKeys(env);
    return json(env, { enabled: billingOn(env), checkout: !!(env.PADDLE_CLIENT_TOKEN && Object.keys(prices).length), paddle: { env: env.PADDLE_ENV === "sandbox" ? "sandbox" : "production", token: env.PADDLE_CLIENT_TOKEN || "" }, prices });
  }
  const who = await supaUser(env, req.headers.get("Authorization") || "");
  if (!who) throw Object.assign(new Error("Sign in first."), { status: 401, code: "signin_required" });
  if (p === "/billing/me" && req.method === "GET") return json(env, accountView(await dbRpc(env, "billing_refresh", { uid: who.id })));
  if (p === "/billing/segment" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    await dbRpc(env, "billing_set_segment", { uid: who.id, seg: String(b.segment || "") });
    return json(env, { ok: true });
  }
  return json(env, { error: "not found" }, 404);
}

// Paddle posts here when someone pays, renews, upgrades or cancels. The signature is the only thing that proves it
// came from Paddle, so nothing is read before it checks out.
async function paddleWebhook(env, req) {
  if (!env.PADDLE_WEBHOOK_SECRET) return json(env, { error: "Webhook secret not set" }, 500);
  const raw = await req.text();
  const sig = req.headers.get("Paddle-Signature") || "";
  const ts = (sig.match(/ts=(\d+)/) || [])[1], h1 = (sig.match(/h1=([a-f0-9]+)/i) || [])[1];
  if (!ts || !h1 || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return json(env, { error: "Invalid signature" }, 400);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(env.PADDLE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(ts + ":" + raw)));
  const want = [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
  let diff = want.length ^ h1.length;
  for (let i = 0; i < want.length && i < h1.length; i++) diff |= want.charCodeAt(i) ^ h1.toLowerCase().charCodeAt(i);
  if (diff !== 0) return json(env, { error: "Invalid signature" }, 400);

  let ev; try { ev = JSON.parse(raw); } catch (e) { return json(env, { error: "Bad body" }, 400); }
  const d = ev.data || {};
  const uid = String((d.custom_data && d.custom_data.user_id) || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return json(env, { ok: true, ignored: "no account on this event" });

  const byId = Object.fromEntries(Object.entries(priceKeys(env)).map(([k, v]) => [String(v), k]));
  const found = (d.items || []).map((i) => ({ key: byId[String((i.price && i.price.id) || i.price_id || "")], qty: Number(i.quantity) || 1 })).filter((x) => x.key);
  const planItem = found.find((x) => /^(starter|pro|agency)_(month|year)$/.test(x.key));
  const [plan, interval] = planItem ? planItem.key.split("_") : [null, null];
  const t = String(ev.event_type || "");
  const evId = String(ev.event_id || "");
  const customer = d.customer_id || null;

  if (t === "transaction.completed") {
    const top = found.find((x) => x.key === "topup");
    if (top) await dbRpc(env, "billing_add_extra", { uid, amount: TOPUP_CREDITS * top.qty, ref_id: "txn:" + String(d.id || evId) });
    if (planItem) await dbRpc(env, "billing_set_plan", { uid, new_plan: plan, new_status: "active", new_interval: interval, period_end: (d.billing_period && d.billing_period.ends_at) || null, customer, subscription: d.subscription_id || null, reset: true, ref_id: "evt:" + evId });
  } else if (/^subscription\.(created|updated|activated|resumed|past_due|paused|canceled)$/.test(t)) {
    const cancelling = (d.scheduled_change && d.scheduled_change.action === "cancel") || t === "subscription.canceled";
    const status = cancelling ? "canceled" : t === "subscription.paused" ? "paused" : t === "subscription.past_due" ? "past_due" : "active";
    const end = cancelling ? ((d.scheduled_change && d.scheduled_change.effective_at) || (d.current_billing_period && d.current_billing_period.ends_at) || new Date().toISOString()) : ((d.current_billing_period && d.current_billing_period.ends_at) || null);
    await dbRpc(env, "billing_set_plan", { uid, new_plan: plan, new_status: status, new_interval: interval, period_end: end, customer, subscription: d.id || null, reset: false, ref_id: "evt:" + evId });
  }
  return json(env, { ok: true });
}

async function handle(req, rawEnv, hooks) {
    if (req.method === "POST" && new URL(req.url).pathname === "/billing/webhook") return paddleWebhook(Object.assign(Object.create(rawEnv), { ALLOW_ORIGIN: "*" }), req);
    const origin = allowedOrigin(req, rawEnv);
    // json() reads ALLOW_ORIGIN for the CORS header; give it the one origin that matched.
    const env = Object.assign(Object.create(rawEnv), { ALLOW_ORIGIN: origin || String(rawEnv.ALLOW_ORIGIN || "").split(",")[0].trim() });
    if (req.method === "OPTIONS") return json(env, {});
    if (!origin) return json(env, { error: "This site is not allowed to use the AdDoctor API." }, 403);
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) return json(env, { error: "unauthorized" }, 401);
    const u = new URL(req.url);
    if (u.pathname === "/account/delete" && req.method === "POST") {
      try { return await deleteAccount(env, req); } catch (e) { return json(env, { error: "Could not delete the account. Try again." }, 502); }
    }
    if (u.pathname.startsWith("/billing/")) {
      try { return await billingRoute(env, req, u); }
      catch (e) { return json(env, e && e.code ? { error: String(e.message).slice(0, 240), code: e.code } : { error: String((e && e.message) || e).slice(0, 240) }, e && [401, 403, 422, 429, 502].includes(e.status) ? e.status : 500); }
    }
    let who = null;
    if (PAID.test(u.pathname)) {
      const now = Date.now();
      if (req.headers.get("Authorization")) {
        try { who = await supaUser(env, req.headers.get("Authorization")); } catch (e) { return json(env, { error: "Could not check your sign-in. Try again in a moment." }, 502); }
        if (!who) return json(env, { error: "Your sign-in has expired. Sign in again.", code: "signin_required" }, 401);
      }
      if (who) {
        // A signed-in caller is counted by account, so a shared network does not use up one person's allowance.
        if (!isOwner(env, who)) {
          const perHour = Number(env.USER_PER_HOUR) || 120, perDay = Number(env.USER_DAILY) || 200;
          if ((await bump(`user/${who.id}/${Math.floor(now / 3600000)}`, 3600)) > perHour) return json(env, { error: "You have made a lot of requests this hour. Try again in a while.", code: "rate_limited" }, 429);
          if ((await bump(`userday/${who.id}/${Math.floor(now / 86400000)}`, 86400)) > perDay) return json(env, { error: "You have reached today's limit for your account. Try again tomorrow.", code: "daily_cap" }, 429);
        }
      } else {
        const rawIp = req.headers.get("CF-Connecting-IP") || "unknown";
      const ip = rawIp.includes(":") ? rawIp.split(":").slice(0, 4).join(":") : rawIp;   // an IPv6 caller counts as its whole /64
        if ((await bump(`ip/${ip}/${Math.floor(now / 3600000)}`, 3600)) > (Number(env.RATE_PER_HOUR) || 60)) return json(env, { error: "Too many requests from this connection. Try again in an hour.", code: "rate_limited" }, 429);
      }
      if ((await bump(`day/${Math.floor(now / 86400000)}`, 86400)) > (Number(env.DAILY_CAP) || 300)) return json(env, { error: "AdDoctor has reached its daily limit. Try again tomorrow.", code: "daily_cap" }, 429);
    }
    // Credits: with BILLING on, a paid action needs a signed-in account and is charged before it runs; the wrapper
    // below gives the credits back if the action fails. The site owners are never charged.
    if (PAID.test(u.pathname) && billingOn(env)) {
      if (!who) return json(env, { error: "Sign in to use this. Your free credits are tied to your account.", code: "signin_required" }, 401);
      if (!isOwner(env, who)) {
        try {
          let peek = {};
          if (req.method === "POST" && (u.pathname === "/make/ad" || u.pathname === "/make/improve" || u.pathname === "/pack/image")) peek = await req.clone().json().catch(() => ({}));
          let cost = creditCost(u.pathname, peek);
          if (cost > 0 && peek.grant && ((u.pathname === "/make/ad" && peek.base) || u.pathname === "/make/improve")) {
            const left = await useGrant(env, who.id, peek.grant);
            if (left >= 0) { cost = 0; hooks.freeLeft = left; }
          }
          if (cost > 0) {
            const ref = `spend:${who.id}:${crypto.randomUUID()}`;
            const r = await dbRpc(env, "billing_spend", { uid: who.id, amount: cost, why: u.pathname, ref_id: ref });
            if (!r.ok) return json(env, { error: `This needs ${cost} credits and you have ${(r.plan_credits || 0) + (r.extra_credits || 0)}. Top up or upgrade your plan.`, code: "no_credits", needed: cost }, 402);
            hooks.charge = { uid: who.id, ref };
          } else if (u.pathname === "/start") {
            const a = await dbRpc(env, "billing_refresh", { uid: who.id });
            if (a.plan_credits + a.extra_credits < START_NEEDS) return json(env, { error: `A competitor analysis uses ${START_NEEDS} credits and you have ${a.plan_credits + a.extra_credits}. Top up or upgrade your plan.`, code: "no_credits", needed: START_NEEDS }, 402);
          }
        } catch (e) { return json(env, { error: String((e && e.message) || e).slice(0, 240) }, 502); }
      }
    }
    const apify = (path) => `https://api.apify.com/v2/${path}${path.includes("?") ? "&" : "?"}token=${env.APIFY_TOKEN}`;
    try {
      // 1. start a crawl
      if (u.pathname === "/start" && req.method === "POST") {
        const b = await req.json();
        const id = String(b.page_id || "").replace(/\D/g, "");
        if (!id) return json(env, { error: "page_id required" }, 400);
        const country = String(b.country || "ALL").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "ALL";
        const okDate = (d) => (/^\d{4}-\d\d-\d\d$/.test(d || "") ? d : "");
        const src = spySource(env);
        if (!src) return json(env, { error: "No Ad Library source is set up on the server. Use the AdDoctor helper to read the page in your own browser instead.", code: "no_source" }, 503);
        if (src !== "apify") return json(env, { run: hexEnc({ id, country, from: okDate(b.from), to: okDate(b.to), src }), paged: src === "sc", max: adCap(env) });
        const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${id}`;
        const input = { startUrls: [{ url }], resultsLimit: Math.min(Number(env.MAX_ADS) || 200, 800) };
        if (/^\d{4}-\d\d-\d\d$/.test(b.from || "")) input.onlyAdsNewerThan = b.from;
        if (/^\d{4}-\d\d-\d\d$/.test(b.to || "")) input.onlyAdsOlderThan = b.to;
        const r = await fetch(apify(`acts/${ACTOR}/runs`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        const j = await r.json();
        if (!r.ok || !j.data) return json(env, { error: (j.error && j.error.message) || "Could not start the crawl" }, 502);
        return json(env, { run: j.data.id });
      }
      // 1b. read the next few pages of a ScrapeCreators run; the page calls this until "cursor" comes back empty
      if (u.pathname === "/page" && req.method === "POST") {
        const b = await req.json();
        const run = String(b.run || "").replace(/[^A-Za-z0-9]/g, "");
        const q = run.startsWith("meta") ? hexDec(run) : {};
        if (q.src !== "sc" || !env.SCRAPECREATORS_KEY) return json(env, { error: "This run can't be read in pages" }, 400);
        const room = adCap(env) - Math.max(0, Number(b.have) || 0);
        if (room <= 0) return json(env, { ads: [], cursor: "" });
        const { items, cursor } = await scAds(env, q, String(b.cursor || "").slice(0, 20000), 6, room);
        return json(env, { ads: items.map(slimAd).filter((a) => a.ad_archive_id), cursor: items.length >= room ? "" : cursor });
      }
      // 2. poll progress
      if (u.pathname === "/status") {
        const run = (u.searchParams.get("run") || "").replace(/[^A-Za-z0-9]/g, "");
        if (run.startsWith("meta")) return json(env, { status: "SUCCEEDED", found: 0 });
        const j = await (await fetch(apify(`actor-runs/${run}`))).json();
        if (!j.data) return json(env, { error: "Unknown run" }, 404);
        let found = 0;
        try { const ds = await (await fetch(apify(`datasets/${j.data.defaultDatasetId}`))).json(); found = (ds.data && ds.data.itemCount) || 0; } catch (e) {}
        return json(env, { status: j.data.status, found });
      }
      // 3. read the ads and write the analysis
      if (u.pathname === "/analyze" && req.method === "POST") {
        const b = await req.json();
        const run = String(b.run || "").replace(/[^A-Za-z0-9]/g, "");
        let ads, raw = 0, official = false;
        const dedupe = (items) => { const seen = new Set(); return items.map(normalize).filter((a) => (a.headline || a.body) && a.libId && !seen.has(a.libId) && seen.add(a.libId)); };
        if (Array.isArray(b.ads)) {
          // read in the visitor's own browser by the AdDoctor helper and posted here
          raw = b.ads.length;
          ads = dedupe(b.ads.slice(0, 1200).filter((x) => x && typeof x === "object")).slice(0, 1000);
        } else if (run.startsWith("meta")) {
          const q = hexDec(run);
          official = q.src !== "sc";
          if (official) ads = await metaAds(env, q);
          else { const { items } = await scAds(env, q); raw = items.length; ads = dedupe(items); }
        } else {
          const rj = await (await fetch(apify(`actor-runs/${run}`))).json();
          if (!rj.data) return json(env, { error: "Unknown run" }, 404);
          const items = await (await fetch(apify(`datasets/${rj.data.defaultDatasetId}/items?clean=true&limit=5000`))).json();
          if (!Array.isArray(items)) return json(env, { error: "Could not read the crawl results" }, 502);
          raw = items.length;
          ads = dedupe(items);
        }
        if (!ads.length) return json(env, { error: "No ads found for that advertiser and period.", raw }, 404);
        const counts = {};
        ads.filter((a) => !/ with /i.test(a.advertiser)).forEach((a) => { counts[a.advertiser] = (counts[a.advertiser] || 0) + 1; });
        const brand = String(b.brand || "").trim() || (Object.entries(counts).sort((x, y) => y[1] - x[1])[0] || [""])[0];
        let slide = [], insights = [], report = [], creatives = [], aiError = "";
        const { images, vision } = official ? await readCreatives(ads) : await readAdImages(env, ads);
        ads.forEach((a) => { delete a.snap; delete a.imgs; });   // the preview link carries the access token, so it never leaves the Worker
        const okDay = (d) => (/^\d{4}-\d\d-\d\d$/.test(d || "") ? d : "");
        const starts = ads.map((a) => a.startMs).filter(Boolean);
        const from = okDay(b.from) || (starts.length ? new Date(Math.min(...starts)).toISOString().slice(0, 10) : "");
        const to = okDay(b.to) || new Date().toISOString().slice(0, 10);
        try { ({ slide, insights, report, creatives } = await writeSlide(env, ads, brand, from, to, images)); } catch (e) { aiError = String(e.message || e).slice(0, 200); }
        return json(env, { count: ads.length, brand, ads, slide, insights, report, creatives, aiError, vision, from, to });
      }
      // 4. one creative broken down (hook, problem, solution, proof, offer, awareness stage)
      if (u.pathname === "/creative" && req.method === "POST") return json(env, await creativeBreakdown(env, await req.json()));
      // a saved ad keeps its picture: Meta's image links expire, so the page asks for the bytes once and keeps a small copy
      if (u.pathname === "/thumb" && req.method === "POST") {
        const b = await req.json();
        let host = "";
        try { host = new URL(String(b.img || "")).hostname; } catch (e) { /* handled below */ }
        if (!AD_IMG_HOST.test(host)) throw bad("That creative image can't be read");
        const ref = await loadRef({ url: b.img }, AD_IMG_HOST);
        return json(env, { mime: ref.mime, data: ref.data });
      }
      // 5. find an advertiser by name, and 6. ask a question about the ads already read
      if (u.pathname === "/brands" && req.method === "POST") return json(env, await brandSearch(env, await req.json()));
      if (u.pathname === "/spy/find" && req.method === "POST") return json(env, await platformFind(env, await req.json()));
      if (u.pathname === "/spy/read" && req.method === "POST") return json(env, await platformRead(env, await req.json()));
      if (u.pathname === "/organic" && req.method === "POST") return json(env, await organicPosts(env, await req.json()));
      if (u.pathname === "/ask" && req.method === "POST") return json(env, await askAds(env, await req.json()));
      if (u.pathname === "/rivals" && req.method === "POST") return json(env, await findRivals(env, await req.json()));
      if (u.pathname === "/library" && req.method === "POST") return json(env, await winningAds(env, await req.json()));
      // what this server can do, so the page can offer the right way to read the Ad Library
      if (u.pathname === "/caps") return json(env, { source: spySource(env), posted: true, vision: true, features: ["creative", "ask", "rivals", ...(env.SCRAPECREATORS_KEY ? ["brands", "organic", "library", "spymore"] : [])] });
      // ---- Social Pack ----
      if (u.pathname.startsWith("/pack/") && req.method === "POST") {
        const b = await req.json();
        if (u.pathname === "/pack/store") return json(env, await packStore(env, b));
        if (u.pathname === "/pack/brief") return json(env, { brief: await packBrief(env, b) });
        if (u.pathname === "/pack/posts") return json(env, { posts: await packPosts(env, b) });
        if (u.pathname === "/pack/image") return json(env, await packImage(env, b, who));
        if (u.pathname === "/pack/review") return json(env, await packReview(env, b));
      }
      // ---- an ad from a template and a product photo ----
      if (u.pathname.startsWith("/make/") && req.method === "POST") {
        const b = await req.json();
        if (u.pathname === "/make/ad") {
          const out = await makeAd(env, b);
          if (!b.base) out.grant = await signGrant(env, who ? who.id : "anon");
          else if (hooks.freeLeft !== undefined) out.freeLeft = hooks.freeLeft;
          return json(env, out);
        }
        if (u.pathname === "/make/plan") return json(env, await planScratch(env, b));
        if (u.pathname === "/make/review") return json(env, await makeReview(env, b));
        if (u.pathname === "/make/improve") {
          const out = await makeImprove(env, b);
          if (hooks.freeLeft !== undefined) out.freeLeft = hooks.freeLeft;
          return json(env, out);
        }
      }
      return json(env, { error: "not found" }, 404);
    } catch (e) {
      const st = e && [401, 403, 422, 429, 502].includes(e.status) ? e.status : 500;
      return json(env, e && e.code ? { error: String(e.message).slice(0, 240), code: e.code } : { error: String(e.message || e).slice(0, 240) }, st);
    }
}

export default {
  async fetch(req, rawEnv) {
    const hooks = {};
    const res = await handle(req, rawEnv, hooks);
    // A charged action that did not succeed costs nothing: give the credits back (safe to repeat).
    if (hooks.charge && res.status >= 400) {
      try { await dbRpc(rawEnv, "billing_refund", { uid: hooks.charge.uid, ref_id: hooks.charge.ref }); } catch (e) { console.log("refund failed", hooks.charge.ref); }
    }
    return res;
  },
};
