/* Builds the Inspiration library: a permanent set of the best ads out there, saved as public/library/ads.json plus a
   small picture for each in public/library/img/.

   How an ad gets in: for each category we search Meta's Ad Library by the keywords shoppers use (serum, dog harness,
   necklace...), most-seen ads first, English only. An ad is kept when it is still running after a month or more: a store
   only keeps paying for an ad that works. A few ads per store are kept, so small shops sit next to big ones.

   Why files and not a live lookup: Meta's picture links stop working after a few days and every live read costs credits.
   Saved here once, the library loads instantly, never breaks and costs nothing per visit.

   Run it yourself (it spends ScrapeCreators credits, about 1 per page, roughly 20 per category):
     $env:SCRAPECREATORS_KEY="your key"; npm run library
   or put SCRAPECREATORS_KEY=... in .env. Options:
     --niche skincare,pets   only these categories           --per-niche 120   ads kept per category
     --min-days 30           how long an ad must have run     --country US      where the ads must run (ALL for anywhere)
     --refresh               read categories again that are already saved
   It saves after every category, so a stopped run carries on where it left off. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SPY_ANGLES } from "../src/angles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "library");
const imgDir = path.join(outDir, "img");
const dataFile = path.join(outDir, "ads.json");

/* ---- the categories, and what shoppers search for in each ---- */
const NICHES = {
  skincare: { label: "Skincare", queries: ["face serum", "moisturizer", "acne treatment", "sunscreen", "anti aging cream", "face cleanser", "skin care routine"] },
  beauty: { label: "Makeup & hair", queries: ["lipstick", "mascara", "hair growth", "hair care", "eyelash", "makeup", "hair removal"] },
  fashion: { label: "Fashion", queries: ["dress", "womens clothing", "mens shirt", "jacket", "jeans", "swimwear", "hoodie"] },
  activewear: { label: "Activewear & shoes", queries: ["leggings", "sneakers", "gym wear", "yoga pants", "running shoes", "sports bra", "walking shoes"] },
  health: { label: "Health & supplements", queries: ["protein powder", "vitamins", "collagen", "weight loss", "sleep supplement", "posture corrector", "gut health"] },
  food: { label: "Food & drink", queries: ["coffee", "snacks", "protein bar", "tea", "hot sauce", "energy drink", "meal delivery"] },
  home: { label: "Home & living", queries: ["mattress", "bedding", "kitchen gadget", "home organizer", "led lights", "air purifier", "blanket"] },
  pets: { label: "Pets", queries: ["dog harness", "dog bed", "cat toy", "dog food", "dog treats", "pet grooming", "pet camera"] },
  tech: { label: "Tech & gadgets", queries: ["phone case", "wireless earbuds", "smart watch", "portable charger", "car accessories", "security camera", "mini projector"] },
  jewelry: { label: "Jewelry & accessories", queries: ["necklace", "ring", "bracelet", "earrings", "watch", "handbag", "sunglasses"] },
};
// Marketplaces and giants: their ads are not what a store owner can copy.
const SKIP_ADVERTISER = /\b(amazon|temu|shein|walmart|target|ebay|aliexpress|alibaba|etsy|costco|wish|tiktok shop|shopee|lazada|google|meta)\b/i;

/* ---- options ---- */
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i < 0 ? fallback : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
const only = String(opt("niche", "")).split(",").map((s) => s.trim()).filter(Boolean);
const PER_NICHE = Number(opt("per-niche", 120)) || 120;
const MIN_DAYS = Number(opt("min-days", 30)) || 30;
const COUNTRY = String(opt("country", "US")).toUpperCase().slice(0, 3);
const REFRESH = opt("refresh", false) === true;
const PAGES = 3;          // pages read per search word
const PER_ADVERTISER = 4; // ads kept per store in one category

function loadKey() {
  if (process.env.SCRAPECREATORS_KEY) return process.env.SCRAPECREATORS_KEY.trim();
  try {
    const m = fs.readFileSync(path.join(root, ".env"), "utf8").match(/^\s*SCRAPECREATORS_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  } catch (e) { /* no .env */ }
  return "";
}
const KEY = loadKey();
if (!KEY) { console.error("No ScrapeCreators key. Set SCRAPECREATORS_KEY (in your shell or in .env) and run again."); process.exit(1); }

/* ---- ScrapeCreators ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let credits = 0;
async function sc(pathName, params) {
  for (let attempt = 0; ; attempt++) {
    credits++;
    const r = await fetch("https://api.scrapecreators.com" + pathName + "?" + new URLSearchParams(params), { headers: { "x-api-key": KEY } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success !== false) return j;
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) { await sleep(1500 * (attempt + 1)); continue; }
    throw new Error(`${r.status} ${String(j.message || j.error || "").slice(0, 100)}`);
  }
}

// Most-seen active English ads for one search word.
async function searchAds(query) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < PAGES; page++) {
    const p = { query, status: "ACTIVE", language: "EN", country: COUNTRY };   // no sort_by: the default order is most-seen first
    if (cursor) p.cursor = cursor;
    const j = await sc("/v1/facebook/adLibrary/search/ads", p);
    const items = Array.isArray(j.searchResults) ? j.searchResults : Array.isArray(j.results) ? j.results : Array.isArray(j.ads) ? j.ads : [];
    out.push(...items);
    cursor = String(j.cursor || "");
    if (!cursor || !items.length) break;
  }
  return out;
}

/* ---- one Ad Library record -> one library entry ---- */
const FB_IMG = /^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|cdninstagram\.com)\//i;
const clean = (v) => { const t = String(v == null ? "" : v).trim(); return /\{\{.*\}\}/.test(t) ? "" : t; };
const toMs = (v) => { if (v == null || v === "") return null; if (typeof v === "number") return v < 1e11 ? v * 1000 : v; const t = Date.parse(String(v).replace(" UTC", "Z").replace(" ", "T")); return Number.isNaN(t) ? null : t; };
const ENGLISH_WORD = /^(the|and|you|your|for|with|our|to|is|are|of|in|it|this|that|get|my|we|on|from|at|by|be|can|all|more)$/i;
const OTHER_WORD = /^(el|la|los|las|de|del|que|y|para|con|por|una?|es|en|se|su|le|les|des|une|pour|et|est|dans|der|die|das|und|ist|nicht|mit|für|il|di|che|per|non|não|você|uma|os|as|do|da|em|hola|ahora|compra|mismo|bonjour|gratuit|livraison|envío|gratis)$/i;
// English only: no other alphabets, and not Spanish, French, German, Italian or Portuguese by their common words.
const english = (t) => {
  const letters = t.match(/\p{L}/gu) || [];
  if (letters.length && letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length <= 0.92) return false;
  const words = t.toLowerCase().match(/[\p{L}']+/gu) || [];
  const eng = words.filter((w) => ENGLISH_WORD.test(w)).length, other = words.filter((w) => OTHER_WORD.test(w)).length;
  return !(other >= 2 || (other >= 1 && eng === 0));
};
const angleRes = SPY_ANGLES.map((a) => ({ id: a.id, re: new RegExp(a.re.source, a.re.flags.replace("g", "")) }));

function toEntry(it, niche) {
  const snap = it.snapshot || {};
  const brand = String(it.page_name || snap.page_name || "").trim().slice(0, 80);
  if (!brand || SKIP_ADVERTISER.test(brand) || / with /i.test(brand)) return null;
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const card = cards.find((c) => clean(c.body) || clean(c.title)) || cards[0] || {};
  const bodyRaw = snap.body && typeof snap.body === "object" ? snap.body.text : snap.body;
  const body = clean(clean(bodyRaw) || clean(card.body));
  const title = clean(clean(snap.title) || clean(card.title));
  const df = String(snap.display_format || "").toUpperCase();
  const dynamic = df === "DCO" || df === "DPA";
  if (df === "DPA") return null;   // a product catalog: no single creative to learn from
  const video = (snap.videos || []).length > 0 || df === "VIDEO" || (dynamic ? !!cards[0] && !!(cards[0].video_hd_url || cards[0].video_sd_url) : cards.some((c) => c.video_hd_url || c.video_sd_url));
  const carousel = df === "CAROUSEL" || (!df && cards.length > 1);
  const urls = [];
  (snap.images || []).forEach((i) => urls.push(i.resized_image_url, i.original_image_url));
  (snap.videos || []).forEach((v) => urls.push(v.video_preview_image_url));
  cards.forEach((c) => urls.push(c.resized_image_url, c.original_image_url, c.video_preview_image_url));
  const img = urls.find((u) => typeof u === "string" && FB_IMG.test(u));
  const startMs = toMs(it.start_date);
  const id = String(it.ad_archive_id || "").replace(/\D/g, "");
  if (!id || !img || !startMs) return null;
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const headline = (title || lines[0] || "").slice(0, 110);
  const rest = (title ? lines : lines.slice(1)).join(" ").slice(0, 400);
  const text = headline + " " + rest;
  if (!(headline || rest) || !english(text)) return null;
  const active = it.is_active === true || !it.end_date;
  const days = Math.max(0, Math.round(((active ? Date.now() : toMs(it.end_date) || Date.now()) - startMs) / 86400000));
  return {
    id, brand, niche, headline, body: rest, cta: clean(snap.cta_text || card.cta_text).slice(0, 40),
    format: video ? "Video" : carousel ? "Carousel" : "Static", days, active,
    tags: angleRes.filter((a) => a.re.test(text)).map((a) => a.id), _img: img,
  };
}

async function savePicture(url, id) {
  const file = path.join(imgDir, id + ".jpg");
  if (fs.existsSync(file)) { const m = await sharp(file).metadata(); return { w: m.width, h: m.height }; }
  const r = await fetch(url);
  if (!r.ok) throw new Error("picture " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const out = await sharp(buf).resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  fs.writeFileSync(file, out.data);
  return { w: out.info.width, h: out.info.height };
}

/* ---- the file ---- */
fs.mkdirSync(imgDir, { recursive: true });
let lib = { updated: "", minDays: MIN_DAYS, niches: [], ads: [], done: {} };
try { const old = JSON.parse(fs.readFileSync(dataFile, "utf8")); if (old && Array.isArray(old.ads)) lib = { ...lib, ...old, done: old.done || {} }; } catch (e) { /* first run */ }
const write = () => {
  lib.updated = new Date().toISOString();
  lib.minDays = MIN_DAYS;
  lib.niches = Object.entries(NICHES).map(([id, n]) => ({ id, label: n.label, count: lib.ads.filter((a) => a.niche === id).length })).filter((n) => n.count);
  fs.writeFileSync(dataFile, JSON.stringify(lib));
};

async function doNiche(niche, def) {
  if (lib.done[niche] !== undefined && !REFRESH) { console.log(`  already saved (${lib.done[niche]} ads), skipping. Use --refresh to read it again.`); return; }
  const lists = [];
  for (const query of def.queries) {
    try {
      const items = await searchAds(query);
      const ads = items.map((it) => toEntry(it, niche)).filter(Boolean);
      lists.push(ads);
      console.log(`  "${query}": ${items.length} ads read, ${ads.length} usable`);
    } catch (e) { console.log(`  "${query}": failed (${e.message})`); lists.push([]); }
  }
  // One from each search word in turn, so no single word fills the category.
  const merged = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) lists.forEach((l) => { if (i < l.length) merged.push(l[i]); });
  const textCount = new Map(), seenId = new Set(), seenImg = new Set(), perStore = new Map();
  const picks = merged.filter((a) => {
    const k = (a.headline + a.body).toLowerCase().replace(/\s+/g, " ").slice(0, 80);
    const s = a.brand.toLowerCase();
    if (a.days < MIN_DAYS || seenId.has(a.id) || seenImg.has(a._img) || (textCount.get(k) || 0) >= 2 || (perStore.get(s) || 0) >= PER_ADVERTISER) return false;
    seenId.add(a.id); seenImg.add(a._img); textCount.set(k, (textCount.get(k) || 0) + 1); perStore.set(s, (perStore.get(s) || 0) + 1);
    return true;
  }).slice(0, PER_NICHE);
  lib.ads = lib.ads.filter((a) => a.niche !== niche);
  let kept = 0;
  for (const a of picks) {
    try { const d = await savePicture(a._img, a.id); delete a._img; lib.ads.push({ ...a, img: "img/" + a.id + ".jpg", w: d.w, h: d.h }); kept++; } catch (e) { /* skipped: picture could not be saved */ }
  }
  lib.done[niche] = kept;
  console.log(`  -> ${kept} ads kept from ${perStore.size} stores`);
  write();
}

const chosen = Object.entries(NICHES).filter(([id]) => !only.length || only.includes(id));
const words = chosen.reduce((n, [, v]) => n + v.queries.length, 0);
console.log(`Building the library: ${chosen.length} categories, ${words} search words, ads running ${MIN_DAYS}+ days in ${COUNTRY}, up to ${PER_NICHE} per category (about ${words * PAGES} credits).`);
for (const [niche, def] of chosen) { console.log(`\n${def.label}`); await doNiche(niche, def); }
write();
console.log(`\nDone. ${lib.ads.length} ads in the library. About ${credits} ScrapeCreators credits used.`);
