// AdDoctor backend (Cloudflare Worker).
// Flow: page -> /start (Apify crawls the Ad Library) -> /status (poll) -> /analyze (normalize + Claude writes the slide)
//
// Environment variables (Cloudflare > Workers > Settings > Variables):
//   APIFY_TOKEN      secret   your Apify API token
//   ANTHROPIC_KEY    secret   your Anthropic API key
//   ALLOW_ORIGIN     text     your site, e.g. https://app.addoctor.com  (use * only while testing)
//   APP_KEY          secret   optional: if set, the page must send it as header X-App-Key
//   MAX_ADS          text     optional cap per analysis, default 800 (Apify bills per ad)
//   MODEL            text     optional, default claude-sonnet-5-5
//   GEMINI_KEY       secret   Google AI Studio API key (Social Pack images)
//   IMAGE_MODEL      text     optional, standard image model, default gemini-3.1-flash-image
//   IMAGE_MODEL_PREMIUM text  optional, premium image model, default gemini-3-pro-image

const ACTOR = "apify~facebook-ads-scraper";

const SLIDE_RULES = `Rules for "slide": write like this example, which is only about tone and length and must not be copied: "Collaborations with multiple well-known influencers like A and B throughout the year." / "They seem to primarily focus on promoting their skincare products with videos while also maintaining a presence with static images." / "In early January we notice a -30% offer and early in the summer a -50% on selected products." / "The brand's ad campaigns indicate that it prioritizes X and Y as their hero product lines." Cover, where the material supports it: influencer collaborations (an advertiser shown as "X with Brand"), video vs static mix, which product they focus on most, promotions and sales with the month they ran, hero product lines, and any sign-up or lead ads. Be unsure in tone. Use words like "seem to", "appear to", "looks to", "we notice", "indicate that". Never state anything as fact that the ads cannot prove, and never claim spend or results. Write in English, even if the ads are not.`;

const json = (env, body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*", "Access-Control-Allow-Headers": "Content-Type, X-App-Key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
  });

const toMs = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v;     // seconds or ms
  const t = Date.parse(String(v).replace(" UTC", "Z").replace(" ", "T"));   // "2026-09-15 07:00:00 UTC"
  return isNaN(t) ? null : t;
};
const pick = (...vals) => vals.find((v) => v != null && v !== "");
const clean = (v) => { const t = String(v == null ? "" : v).trim(); return /\{\{.*\}\}/.test(t) ? "" : t; };   // drop "{{product.name}}" placeholders

// Turn one Apify item into the shape the page uses. Names confirmed from a real run:
// pageInfo.page.name, snapshot.title, snapshot.displayFormat, isActive, startDateFormatted, endDateFormatted, publisherPlatform.
// Others (ad id, body text) are read from several likely places.
function normalize(it) {
  const snap = it.snapshot || {};
  const cards = snap.cards || [];
  const card = cards.find((c) => clean(c.body) || clean(c.title)) || cards[0] || {};
  const bodyRaw = snap.body && typeof snap.body === "object" ? snap.body.text : snap.body;
  const body = clean(pick(clean(bodyRaw), clean(card.body), clean(it.adText), ""));
  const title = clean(pick(clean(snap.title), clean(card.title), clean(it.title), ""));
  const df = String(pick(snap.displayFormat, snap.display_format, it.displayFormat, "") || "").toUpperCase();
  const hasVideo = (snap.videos || []).length > 0 || df === "VIDEO" || cards.some((c) => c.videoHdUrl || c.videoSdUrl || c.video_hd_url);
  const isCarousel = df === "CAROUSEL" || cards.length > 1;
  const format = hasVideo ? "Video" : isCarousel ? "Carousel" : "Static";   // DCO = catalog ads; treated as static unless a video is present
  const advertiser = String(pick(it.pageInfo && it.pageInfo.page && it.pageInfo.page.name, it.pageName, it.page_name, snap.pageName, snap.page_name, "") || "");
  const startMs = toMs(pick(it.startDateFormatted, it.startDate, it.start_date));
  const endMs = toMs(pick(it.endDateFormatted, it.endDate, it.end_date));
  const active = pick(it.isActive, it.is_active);
  const days = startMs ? Math.max(0, Math.round((((active === true || !endMs) ? Date.now() : endMs) - startMs) / 86400000)) : null;
  const cm = advertiser.match(/^(.{2,60}?)\s+with\s+(.{2,40})$/i);
  const creator = cm && cm[1].trim().toLowerCase() !== cm[2].trim().toLowerCase() ? cm[1].trim() : "";
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const headline = wf((title || lines[0] || "").slice(0, 110));
  const rest = wf((title ? lines : lines.slice(1)).join(" ").slice(0, 400));
  return {
    libId: String(pick(it.adArchiveID, it.adArchiveId, it.ad_archive_id, it.adId, it.id, "")),
    advertiser, headline, body: rest, cta: clean(pick(snap.ctaText, snap.cta_text, card.ctaText, "")),
    format, startMs, endMs: active === true ? null : (endMs || null), days, creator,
  };
}

// Slicing text can cut an emoji in half (a lone surrogate), which makes the request invalid JSON. Remove any such halves.
const wf = (t) => String(t).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");

function compact(ads, cap = 13000) {
  const groups = new Map();
  ads.forEach((a) => {
    const k = (a.headline + " " + a.body).toLowerCase().replace(/\s+/g, " ").slice(0, 70);
    const g = groups.get(k) || { n: 0, a, starts: [], ends: [], fm: new Set() };
    g.n++; g.fm.add(a.format); if (a.startMs) g.starts.push(a.startMs); if (a.endMs) g.ends.push(a.endMs);
    groups.set(k, g);
  });
  const d = (ms) => new Date(ms).toISOString().slice(0, 10);
  let out = "";
  [...groups.values()].sort((x, y) => Math.min(...(x.starts.length ? x.starts : [0])) - Math.min(...(y.starts.length ? y.starts : [0]))).forEach((g) => {
    const st = g.starts.length ? d(Math.min(...g.starts)) : "?";
    const en = g.ends.length && g.ends.length === g.n ? d(Math.max(...g.ends)) : "running";
    const line = `x${g.n} | ${[...g.fm].join("/")} | ${st} to ${en} | ${g.a.creator ? "creator " + g.a.creator : g.a.advertiser} | ${(g.a.headline + " " + g.a.body).slice(0, 170)}\n`;
    if (out.length + line.length < cap) out += wf(line);
  });
  return out;
}

async function writeSlide(env, ads, brand, from, to) {
  const prompt = `You are a direct-response paid media analyst summarizing a competitor's Meta ads for an agency slide. Today is ${new Date().toISOString().slice(0, 10)}. Advertiser: ${brand || "unknown"}. Period: ${from || "?"} to ${to || "?"}. Total distinct ads read: ${ads.length}.
Each line below is a group of near-identical ads: x<count> | format | start to end (or "running") | advertiser or creator | ad text.
Return ONLY JSON: {"slide":[5 to 7 short bullets in the style of an agency competitor slide],"insights":[3 to 5 short bullets a media buyer can act on]}
${SLIDE_RULES}

ADS:
${compact(ads)}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: 1500, messages: [{ role: "user", content: wf(prompt) }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "Anthropic error " + r.status);
  const text = ((j.content || []).find((b) => b.type === "text") || {}).text || "";
  const m = text.match(/\{[\s\S]*\}/);
  const out = JSON.parse(m ? m[0] : text);
  return { slide: (out.slide || []).map(String).slice(0, 8), insights: (out.insights || []).map(String).slice(0, 6) };
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

async function askClaude(env, content, maxTokens = 2000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "Anthropic error " + r.status);
  const text = ((j.content || []).find((b) => b.type === "text") || {}).text || "";
  return parseJson(text);
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

async function packImage(env, b) {
  if (!env.GEMINI_KEY) throw new Error("GEMINI_KEY is not set on the server");
  const refs = await loadRefs(b.refs, 4);
  const model = b.quality === "premium" ? (env.IMAGE_MODEL_PREMIUM || "gemini-3-pro-image") : (env.IMAGE_MODEL || "gemini-3.1-flash-image");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [...refs.map((x) => ({ inlineData: { mimeType: x.mime, data: x.data } })), { text: (refs.length ? FIDELITY(refs.length) : "") + imagePromptText(b, b.brief) }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5" } },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || "Image model error " + r.status); e.status = r.status; throw e; }
  const parts = ((j.candidates || [])[0] || {}).content ? (j.candidates[0].content.parts || []) : [];
  const img = parts.map((p) => p.inlineData || p.inline_data).find((d) => d && d.data);
  if (!img) {
    const why = (j.candidates && j.candidates[0] && j.candidates[0].finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || "no image returned";
    const e = new Error("The image model returned no image (" + why + ")"); e.status = 422; throw e;
  }
  return { mime: img.mimeType || img.mime_type || "image/png", data: img.data, model };
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

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return json(env, {});
    if (env.APP_KEY && req.headers.get("X-App-Key") !== env.APP_KEY) return json(env, { error: "unauthorized" }, 401);
    const u = new URL(req.url);
    const apify = (path) => `https://api.apify.com/v2/${path}${path.includes("?") ? "&" : "?"}token=${env.APIFY_TOKEN}`;
    try {
      // 1. start a crawl
      if (u.pathname === "/start" && req.method === "POST") {
        const b = await req.json();
        const id = String(b.page_id || "").replace(/\D/g, "");
        if (!id) return json(env, { error: "page_id required" }, 400);
        const country = String(b.country || "ALL").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "ALL";
        const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${id}`;
        const input = { startUrls: [{ url }], resultsLimit: Number(env.MAX_ADS) || 800 };
        if (/^\d{4}-\d\d-\d\d$/.test(b.from || "")) input.onlyAdsNewerThan = b.from;
        if (/^\d{4}-\d\d-\d\d$/.test(b.to || "")) input.onlyAdsOlderThan = b.to;
        const r = await fetch(apify(`acts/${ACTOR}/runs`), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        const j = await r.json();
        if (!r.ok || !j.data) return json(env, { error: (j.error && j.error.message) || "Could not start the crawl" }, 502);
        return json(env, { run: j.data.id });
      }
      // 2. poll progress
      if (u.pathname === "/status") {
        const run = (u.searchParams.get("run") || "").replace(/[^A-Za-z0-9]/g, "");
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
        const rj = await (await fetch(apify(`actor-runs/${run}`))).json();
        if (!rj.data) return json(env, { error: "Unknown run" }, 404);
        const items = await (await fetch(apify(`datasets/${rj.data.defaultDatasetId}/items?clean=true&limit=5000`))).json();
        if (!Array.isArray(items)) return json(env, { error: "Could not read the crawl results" }, 502);
        const seen = new Set();
        const ads = items.map(normalize).filter((a) => (a.headline || a.body) && a.libId && !seen.has(a.libId) && seen.add(a.libId));
        if (!ads.length) return json(env, { error: "No ads found for that advertiser and period.", raw: items.length }, 404);
        const counts = {};
        ads.filter((a) => !/ with /i.test(a.advertiser)).forEach((a) => { counts[a.advertiser] = (counts[a.advertiser] || 0) + 1; });
        const brand = String(b.brand || "").trim() || (Object.entries(counts).sort((x, y) => y[1] - x[1])[0] || [""])[0];
        let slide = [], insights = [], aiError = "";
        try { ({ slide, insights } = await writeSlide(env, ads, brand, b.from, b.to)); } catch (e) { aiError = String(e.message || e).slice(0, 200); }
        return json(env, { count: ads.length, brand, ads, slide, insights, aiError });
      }
      // ---- Social Pack ----
      if (u.pathname.startsWith("/pack/") && req.method === "POST") {
        const b = await req.json();
        if (u.pathname === "/pack/store") return json(env, await packStore(env, b));
        if (u.pathname === "/pack/brief") return json(env, { brief: await packBrief(env, b) });
        if (u.pathname === "/pack/posts") return json(env, { posts: await packPosts(env, b) });
        if (u.pathname === "/pack/image") return json(env, await packImage(env, b));
        if (u.pathname === "/pack/review") return json(env, await packReview(env, b));
      }
      return json(env, { error: "not found" }, 404);
    } catch (e) {
      return json(env, { error: String(e.message || e).slice(0, 240) }, e && (e.status === 429 || e.status === 422) ? e.status : 500);
    }
  },
};
