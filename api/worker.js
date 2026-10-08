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
    startMs, endMs, days, creator: partner && partner.toLowerCase() !== advertiser.toLowerCase() ? partner : "",
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
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "Anthropic error " + r.status);
  const text = ((j.content || []).find((b) => b.type === "text") || {}).text || "";
  const out = parseJson(text);
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
  "lifestyle": "The product being used or worn in a real, natural setting. No text on the image.",
  "quick-tip": "A photo with ONE short usage or styling tip written large on the image.",
  "detail": "A close-up detail shot that shows quality, texture or craft. No text on the image.",
  "myth-truth": "A 'Myth:' line on the image that the product disproves. Short and punchy.",
  "flat-lay": "A styled flat lay or arrangement of the product from above. No text on the image.",
  "benefit-callout": "A photo with ONE short benefit headline written on the image.",
  "checklist": "A photo with a title and 3 very short checklist items written on the image.",
  "brand-quote": "A calm, branded statement about the brand's values written on the image.",
  "behind-the-scenes": "A behind-the-scenes or making-of moment that builds trust. No text on the image.",
};

const stripFence = (t) => String(t || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
const parseJson = (text) => { const m = stripFence(text).match(/[\[{][\s\S]*[\]}]/); return JSON.parse(m ? m[0] : text); };
const clip = (v, n) => wf(String(v == null ? "" : v)).slice(0, n);

async function askClaude(env, content, maxTokens = 2000, again = false) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "Anthropic error " + r.status);
  const text = ((j.content || []).find((b) => b.type === "text") || {}).text || "";
  try { return parseJson(text); } catch (e) {
    // Usually a double quote inside a string. Ask once for the same answer as valid JSON.
    if (again) throw new Error("The analysis came back in a form that could not be read. Try again.");
    return askClaude(env, [...(typeof content === "string" ? [{ type: "text", text: content }] : content), { type: "text", text: "Return valid JSON only. Inside strings use single quotes, never double quotes." }], maxTokens, true);
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
    const j = JSON.parse(await getText(m ? `${origin}/products/${m[1]}.js` : `${origin}/products.json?limit=12`, 900000));
    const items = j.products ? j.products : j.title ? [j] : [];
    if (items.length) {
      out.source = "shopify";
      out.name = clip(items[0].vendor || u.hostname.replace(/^www\./, ""), 80);
      out.text = items.slice(0, 8).map((p) => `${p.title}${p.type || p.product_type ? " (" + (p.type || p.product_type) + ")" : ""}: ${plain(p.description || p.body_html).slice(0, 220)}`).join("\n");
      items.slice(0, 12).forEach((p) => {
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
async function loadRef(r) {
  if (r && r.data) {
    const d = String(r.data); const m = d.match(/^data:([^;,]+)/);
    const data = d.replace(/^data:[^,]+,/, "");
    if (data.length > 4500000) throw new Error("A photo is too large");
    return { mime: (m && m[1]) || r.mime || "image/jpeg", data };
  }
  const u = safeUrl(r && r.url);
  const resp = await fetch(u.href, { headers: UA, redirect: "follow" });
  if (!resp.ok) throw new Error("Could not load a product photo (" + resp.status + ")");
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

Return ONLY JSON: {"posts":[{"title":"2-5 words","imagePrompt":"a detailed photography prompt: subject, setting, camera angle, light, props, composition. Real photography. Do NOT describe any text here.","overlayText":"the exact words to print on the image, or empty string if none. Use \\n for line breaks.","caption":"the caption without hashtags","hashtags":["#a","#b","#c"]}]}
${PACK_RULES}`;
  const o = await askClaude(env, prompt, 4000);
  const list = Array.isArray(o.posts) ? o.posts : [];
  return idx.map((i, n) => {
    const p = list[n] || {};
    const type = MIX[i % MIX.length];
    const hasText = !/^(product-hero|lifestyle|detail|flat-lay|behind-the-scenes)$/.test(type);
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
    : "No text, letters, logos or watermarks anywhere in the image.";
  const fix = b.fix ? ` Important change to apply: ${clip(b.fix, 500)}` : "";
  return `Create a photorealistic 4:5 portrait Instagram feed photo. ${style}${clip(b.prompt, 900)} ${text}${fix}`;
}

const FIDELITY = (n) => `The ${n > 1 ? n + " attached photos show" : "attached photo shows"} the REAL product${n > 1 ? " from different angles or in different colors" : ""}. They are the only source of truth for its design. Reproduce the product exactly: same shape, fabric, color, fit, logo, artwork and text, in the same position and size as in the photos. Do NOT add, invent, move, duplicate, restyle or crop any print, graphic, logo, text, patch, label, stitching or embroidery that is not visible in the photos. Any area of the product that the photos do not show (for example a back, a sleeve or a pocket) must stay plain and unprinted unless the photos show otherwise. Only the scene, the model, the light and the props are new. `;

const inline = (x) => ({ inlineData: { mimeType: x.mime, data: x.data } });

async function packImage(env, b) {
  // Raw prompts skip the brief and go straight to the image model, so only the owner may use them.
  if (b.raw && env.ALLOW_RAW !== "1") { const e = new Error("This feature is only for the site owner."); e.status = 403; throw e; }
  const refs = await loadRefs(b.refs, 4);
  return geminiImage(env, [...refs.map(inline), { text: (refs.length ? FIDELITY(refs.length) : "") + imagePromptText(b, b.brief) }], b.quality);
}

// One 4:5 image from the image model. "parts" are the reference images and the instruction, in order.
async function geminiImage(env, parts, quality) {
  if (!env.GEMINI_KEY) throw new Error("GEMINI_KEY is not set on the server");
  const model = quality === "premium" ? (env.IMAGE_MODEL_PREMIUM || "gemini-3-pro-image") : (env.IMAGE_MODEL || "gemini-3.1-flash-image");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
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
const PRODUCT_TRUTH = (n) => `The ${n > 1 ? "other " + n + " images show" : "other image shows"} the REAL product${n > 1 ? " from different angles or in different colours" : ""}. ${n > 1 ? "They are" : "It is"} the only source of truth for the product: reproduce it exactly, with the same shape, material, colour, logo, artwork and text, in the same position and size. Do not add, invent, move, restyle or remove any print, logo, label or detail. A side of the product that the ${n > 1 ? "photos do" : "photo does"} not show stays plain.`;

async function makeAd(env, b) {
  const refs = await loadRefs((Array.isArray(b.refs) ? b.refs : []).map((d) => ({ data: d })), 3);
  if (!refs.length) throw new Error("Add a photo of your product first");
  const headline = clip(b.headline, 90).trim(), sub = clip(b.sub, 120).trim();
  const text = headline
    ? `Print this headline on the image, spelled exactly as written, in bold clean typography with strong contrast and generous margins: "${headline}".${sub ? ` Under it, smaller, exactly: "${sub}".` : ""} Write nothing else anywhere, apart from what is on the product itself.`
    : "No headline, caption, watermark or added logo anywhere. The only lettering allowed is what is on the product itself.";
  if (b.base) {
    const fix = clip(b.fix, 500).trim();
    if (!fix) throw new Error("Say what to change");
    const base = await loadRef({ data: b.base });
    return geminiImage(env, [inline(base), ...refs.map(inline), { text: `The FIRST image is an advert that already exists. Change it as described and keep everything else exactly as it is: same model, same framing, same light, same text unless told otherwise.\nChange: ${fix}\n${PRODUCT_TRUTH(refs.length)} The product in the advert must stay identical to it. Any text on the image must be spelled exactly and stay sharp.` }], b.quality);
  }
  if (!b.template) throw new Error("template required");
  const style = await loadRef({ data: b.template });
  const about = clip(b.about, 400).trim(), note = clip(b.note, 300).trim();
  return geminiImage(env, [inline(style), ...refs.map(inline), { text: `Create a photorealistic 4:5 portrait advert for Facebook and Instagram.
The FIRST image is a style reference only, an existing advert. Match its composition, camera angle, framing, setting, lighting, colour mood and the place where its text sits. Do not copy its product, its wording, or any logo or brand name in it.${about ? `\nWhat the reference shows: ${about}` : ""}
${PRODUCT_TRUTH(refs.length)}
Put the real product where the reference has its product: worn by the model if it is clothing, footwear or an accessory, otherwise held or standing in the scene, at a similar size in the frame. The whole product must be in frame and clearly visible. Anything else the model wears is plain and neutral (black, grey or white) and never matches the product's colour, so only the real product stands out. People must look real, with natural hands and faces. Natural or cool light, never an orange glow.${note ? `\nAbout the product: ${note}` : ""}
${text}` }], b.quality);
}

async function makeReview(env, b) {
  const data = String(b.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!data || data.length > 3000000) throw new Error("image missing or too large");
  const refs = await loadRefs((Array.isArray(b.refs) ? b.refs : []).map((d) => ({ data: d })), 2).catch(() => []);
  const headline = clip(b.headline, 90).trim();
  const prompt = `You are an elite direct-response creative strategist scoring one static Meta ad (Facebook and Instagram feed, 4:5) before any money is spent on it. Be specific, practical and honest. No filler.
Headline that was supposed to be printed on the image: ${headline ? '"' + headline + '"' : "none (the image should have no added text)"}
Judge: (1) does it stop the scroll in the first second, (2) is it clear at a glance what is being sold, (3) text on the image: spelled exactly as intended, legible on a phone, with contrast and margins, (4) does it look like a real photograph, with natural hands, faces and light, (5) one clear idea.${refs.length ? " (6) PRODUCT FIDELITY: compare the product in the ad with the reference photos of the real product. Flag ANY difference in shape, colour, print, logo or text. If you find one, make it the FIRST item in fixes, lower the score by at least 20, and write regen so the image model corrects it." : ""}
Return ONLY JSON: {"score":0-100,"verdict":"one plain sentence","strengths":["max 2 short items"],"fixes":["max 3 concrete changes, each starting with a verb"],"regen":"one paragraph telling an image model what to change in the image to apply the visual fixes, or empty string if the image needs no change"}
Inside the JSON strings use single quotes when you quote words, never double quotes.
Never invent facts about the product, and never suggest adding prices, discounts or claims that are not on the image.`;
  const blocks = refs.length
    ? [{ type: "text", text: "Reference photos of the REAL product:" }, ...refs.map((x) => ({ type: "image", source: { type: "base64", media_type: x.mime, data: x.data } })), { type: "text", text: "The ad to judge:" }]
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
// Counters live in Cloudflare's edge cache, which is per data centre, so the numbers are approximate:
// good enough to stop a script hammering the API, not an exact meter.
const SUPABASE_URL = "https://ivzyyeokjcmsucldawja.supabase.co";   // same project as src/auth.js; SUPABASE_URL overrides it

// Deletes the signed-in caller's own account. The caller's token says who they are; the service role key does the delete.
async function deleteAccount(env, req) {
  if (!env.SUPABASE_SERVICE_ROLE) return json(env, { error: "Deleting accounts is not set up on this server yet.", code: "not_configured" }, 501);
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer \S+/.test(auth)) return json(env, { error: "Sign in to delete your account.", code: "signin_required" }, 401);
  const base = String(env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, "");
  const admin = { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE };
  const who = await fetch(base + "/auth/v1/user", { headers: { apikey: env.SUPABASE_SERVICE_ROLE, Authorization: auth } });
  if (who.status === 401 || who.status === 403) return json(env, { error: "Your sign-in has expired. Sign in again.", code: "signin_required" }, 401);
  const user = who.ok ? await who.json().catch(() => null) : null;
  if (!user || !user.id) return json(env, { error: "Could not check your sign-in. Try again." }, 502);
  const del = await fetch(base + "/auth/v1/admin/users/" + encodeURIComponent(user.id), { method: "DELETE", headers: admin });
  if (!del.ok) return json(env, { error: "Could not delete the account. Try again." }, 502);
  return json(env, { ok: true });
}

const PAID = /^\/(start|page|analyze|pack\/|make\/)/;

async function bump(key, ttl) {
  if (typeof caches === "undefined") return 0;
  const url = "https://limits.addoctor.internal/" + key;
  const hit = await caches.default.match(url);
  const n = (hit ? parseInt(await hit.text(), 10) || 0 : 0) + 1;
  await caches.default.put(url, new Response(String(n), { headers: { "Cache-Control": `max-age=${ttl}` } }));
  return n;
}

// Used when ALLOW_ORIGIN is not set: the live site and local dev servers. Set ALLOW_ORIGIN in Cloudflare to change it.
const DEFAULT_ORIGINS = "https://nisado999.github.io,http://localhost:5173,http://localhost:4173";

function allowedOrigin(req, env) {
  const list = String(env.ALLOW_ORIGIN || DEFAULT_ORIGINS).split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (list.includes("*")) return "*";
  const origin = (req.headers.get("Origin") || "").replace(/\/+$/, "");
  return list.includes(origin) ? origin : null;
}

export default {
  async fetch(req, rawEnv) {
    const origin = allowedOrigin(req, rawEnv);
    // json() reads ALLOW_ORIGIN for the CORS header; give it the one origin that matched.
    const env = Object.assign(Object.create(rawEnv), { ALLOW_ORIGIN: origin || String(rawEnv.ALLOW_ORIGIN || "").split(",")[0].trim() });
    if (req.method === "OPTIONS") return json(env, {});
    if (!origin) return json(env, { error: "This site is not allowed to use the AdDoctor API." }, 403);
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) return json(env, { error: "unauthorized" }, 401);
    const u = new URL(req.url);
    if (PAID.test(u.pathname)) {
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const now = Date.now();
      const perHour = Number(env.RATE_PER_HOUR) || 60, perDay = Number(env.DAILY_CAP) || 300;
      if ((await bump(`ip/${ip}/${Math.floor(now / 3600000)}`, 3600)) > perHour) return json(env, { error: "Too many requests from this connection. Try again in an hour." }, 429);
      if ((await bump(`day/${Math.floor(now / 86400000)}`, 86400)) > perDay) return json(env, { error: "AdDoctor has reached its daily limit. Try again tomorrow." }, 429);
    }
    if (u.pathname === "/account/delete" && req.method === "POST") {
      try { return await deleteAccount(env, req); } catch (e) { return json(env, { error: "Could not delete the account. Try again." }, 502); }
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
      // what this server can do, so the page can offer the right way to read the Ad Library
      if (u.pathname === "/caps") return json(env, { source: spySource(env), posted: true, vision: true });
      // ---- Social Pack ----
      if (u.pathname.startsWith("/pack/") && req.method === "POST") {
        const b = await req.json();
        if (u.pathname === "/pack/store") return json(env, await packStore(env, b));
        if (u.pathname === "/pack/brief") return json(env, { brief: await packBrief(env, b) });
        if (u.pathname === "/pack/posts") return json(env, { posts: await packPosts(env, b) });
        if (u.pathname === "/pack/image") return json(env, await packImage(env, b));
        if (u.pathname === "/pack/review") return json(env, await packReview(env, b));
      }
      // ---- an ad from a template and a product photo ----
      if (u.pathname.startsWith("/make/") && req.method === "POST") {
        const b = await req.json();
        if (u.pathname === "/make/ad") return json(env, await makeAd(env, b));
        if (u.pathname === "/make/review") return json(env, await makeReview(env, b));
      }
      return json(env, { error: "not found" }, 404);
    } catch (e) {
      return json(env, { error: String(e.message || e).slice(0, 240) }, e && [403, 422, 429, 502].includes(e.status) ? e.status : 500);
    }
  },
};
