import { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { copyText, SPY_API, SPY_KEY } from "./shared.js";
import { spyBookmarklet, spyFromLib, SPY_FB_ORIGIN } from "./spyHelper.js";

/* ============================ Competitor Spy ============================ */

const SPY_ANGLES = [
  { id: "offer", label: "Discount / offer", tpl: "price-receipt", re: /(\d{1,2}\s?%\s?off|\$\d+\s?off|save\s\$?\d+|\bsale\b|\bbogo\b|buy\s(?:one|two|\d)\b[^.]*\bget\b|free shipping|\bbundle\b|\bcode\s+[A-Z0-9]{3,}|discount)/gi },
  { id: "urgency", label: "Urgency / scarcity", tpl: "offer-lookbook", re: /(ends\s+(?:tonight|today|soon|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|last chance|limited time|final hours|today only|while (?:supplies|stock)s? last|selling out|hurry|don't miss|only \d+ left)/gi },
  { id: "proof", label: "Social proof", tpl: "review-stack", re: /(\d[\d,]*\+?\s(?:five-star\s)?(?:reviews|customers|people|happy)|★|5-star|five-star|\brated\b|dermatolog|clinically|\bdoctor|testimonial|"[^"]{10,}"|“[^”]{10,}”|trusted by|best[- ]?seller|#1\b)/gi },
  { id: "problem", label: "Problem → solution", tpl: "mirror-pas", re: /(tired of|sick of|struggl|still (?:dealing|using|paying)|no more\b|stop (?:\w+ing)|breakout|flare|redness|red, |frustrat|finally|if you(?:'re| are)|ever (?:feel|wonder))/gi },
  { id: "mechanism", label: "Product mechanism", tpl: "ingredient-dissection", re: /(ingredient|formula|niacinamide|ceramide|hyaluronic|peptide|\bspf\s?\d+|no white cast|mineral|hall-effect|lightweight|absorbs|engineered|patent|technology|made with|infused)/gi },
  { id: "compare", label: "Comparison", tpl: "us-vs-them", re: /(\svs\.?\s|versus|unlike|compared to|better than|other brands|the difference|switch(?:ed)? from|instead of)/gi },
  { id: "founder", label: "Founder / brand story", tpl: "founder-note", re: /(founder|i built|i started|our story|why we (?:made|built|started)|we started|after years)/gi },
  { id: "ugc", label: "UGC / honest review", tpl: "tweet-reaction", re: /(honest review|i tried|i tested|30 days|unboxing|\bhaul\b|my routine|get ready with me|grwm|results after|here's what happened)/gi },
  { id: "new", label: "New launch", tpl: "hero-product", re: /(\bnew(?:ly)?\b|just launched|introducing|now (?:in|available)|\blaunch)/gi },
];
const SPY_ANGLE = Object.fromEntries(SPY_ANGLES.map((a) => [a.id, a]));

const SPY_PROMOS = [
  { id: "pct", re: /(\d{1,2})\s?%\s?off|save\s(\d{1,2})\s?%|(?:up to|έως)\s*-?\s*(\d{1,2})\s?%|(?:^|[\s(])-\s?(\d{2})\s?%/i, fmt: (m) => `${m[1] || m[2] || m[3] || m[4]}% off`, name: "Percent-off discount" },
  { id: "amt", re: /\$(\d+)\s?off/i, fmt: (m) => `$${m[1]} off`, name: "Dollar-off discount" },
  { id: "bogo", re: /buy\s(?:one|two|\d)\b[^.!]*\bget\b[^.!]*|\bbogo\b/i, fmt: (m) => m[0].trim().slice(0, 32), name: "Buy-more-get-more" },
  { id: "ship", re: /free (?:shipping|delivery)(?:\s+(?:on orders?\s+)?(?:over|above)\s+[$€£]?\d+\s?€?)?/i, fmt: (m) => m[0].trim(), name: "Free shipping" },
  { id: "bundle", re: /\bbundle\b|starter (?:kit|routine)/i, fmt: () => "Bundle pricing", name: "Bundle offer" },
  { id: "code", re: /\bcode\s+([A-Z0-9]{3,})/, fmt: (m) => `code ${m[1]}`, name: "Promo code" },
  { id: "event", re: /(black friday|cyber monday|spring sale|summer sale|winter sale|flash sale|memorial day|labor day|holiday sale|back[- ]to[- ]school|mother'?s day|valentine'?s|\bsale\b)/i, fmt: (m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), name: "Sale event" },
  { id: "urgent", re: /(ends\s+(?:tonight|today|soon|\w+day)|last chance|limited time|final hours|today only|while (?:supplies|stock)s? last)/i, fmt: (m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), name: "Deadline / urgency" },
  { id: "gift", re: /free (?:gift|sample|trial)|gift with purchase|free [a-z ]{3,28} (?:with|on) (?:orders?|purchases?)|gift (?:on|with) orders?/i, fmt: (m) => m[0], name: "Free gift / sample" },
  { id: "gift", re: /δώρο/i, fmt: () => "gift with purchase", name: "Gift (Greek)" },
  { id: "sub", re: /subscribe (?:&|and) save/i, fmt: () => "Subscribe & save", name: "Subscription discount" },
];

const SPY_PRODUCT_RE = /((?:[A-Z][A-Za-z0-9'’&-]*\s){0,3}(?:Serum|Cream|Cleanser|Moisturizer|Sunscreen|SPF(?:\s?\d+)?|Bundle|Kit|Routine|Mask|Oil|Toner|Gummies|Powder|Protein|Shoes|Sneakers|Jacket|Dress|Hoodie|Leggings|Controller|Headphones|Earbuds|Watch|Bottle|Mattress|Pillow|Collection|Set|Pack))\b/;
const SPY_STRIP = /^(New|The|Our|Your|Shop|Get|Try|Meet|Introducing|Buy|Spring|Summer|Winter|Save|Love|Why|This|These|Free|Last|Final)\s+/;

function spyClassify(ad) {
  const head = ad.headline || "";
  const all = `${head}\n${ad.body || ""}`;
  let best = null, bestScore = 0;
  SPY_ANGLES.forEach((a) => {
    const sc = (all.match(a.re) || []).length + (head.match(a.re) || []).length;
    if (sc > bestScore) { best = a.id; bestScore = sc; }
  });
  return best || "mechanism";
}
function spyPromos(text) {
  const out = [];
  SPY_PROMOS.forEach((p) => {
    const m = text.match(p.re);
    if (m) out.push({ id: p.id, label: p.fmt(m) });
  });
  return out;
}
function spyProduct(text) {
  const m = text.match(SPY_PRODUCT_RE);
  if (!m) return "";
  let s = m[1].replace(/\s+/g, " ").trim();
  let prev;
  do { prev = s; s = s.replace(SPY_STRIP, ""); } while (s !== prev);
  return s;
}
function spyTag(ad, i) {
  const text = `${ad.headline || ""}\n${ad.body || ""}`;
  const heur = spyPromos(text);
  const ai = (ad.aiPromos || []).filter((l) => !heur.some((h) => h.label.toLowerCase() === String(l).toLowerCase())).map((l) => ({ id: "ai", label: String(l) }));
  return {
    ...ad,
    id: ad.id || `ad${i}`,
    angle: SPY_ANGLE[ad.angle] ? ad.angle : spyClassify(ad),
    product: (ad.product && String(ad.product).trim()) || spyProduct(text) || "",
    promos: [...heur, ...ai],
    format: ad.format || "Static",
    days: Number.isFinite(ad.days) ? ad.days : null,
    creator: ad.creator ? String(ad.creator).trim() : "",
    startMs: ad.startMs || (Number.isFinite(ad.days) ? Date.now() - ad.days * 86400000 : null),
  };
}

/* ------------------------------ sample data ------------------------------ */

const SPY_SAMPLE = {
  brand: "Lumen Skin Co.",
  ads: [
    { headline: "12,000 five-star reviews can't be wrong", body: "Dermatologist-tested Barrier Repair Serum. Visibly calmer skin in 14 days. ★★★★★ “My redness is gone.” — Priya M.", cta: "Shop Now", format: "Static", days: 62, product: "Barrier Repair Serum" },
    { headline: "Red, tight skin after every cleanser?", body: "Your barrier is asking for help. Barrier Repair Serum rebuilds it with ceramides, so skin stops stinging.", cta: "Learn More", format: "Video", days: 48, product: "Barrier Repair Serum" },
    { headline: "I tried it for 30 days. Here's my honest review.", body: "Day 1 vs day 30 of the Barrier Repair Serum. No filters, no edits, just my real routine.", cta: "Shop Now", format: "Video", days: 41, product: "Barrier Repair Serum", creator: "Maria K." },
    { headline: "No white cast. No greasy feel. Just SPF.", body: "Daily Mineral SPF 50 is lightweight, mineral and invisible on every skin tone.", cta: "Shop Now", format: "Static", days: 35, product: "Daily Mineral SPF 50" },
    { headline: "Why your SPF pills at noon (and ours doesn't)", body: "Most sunscreens sit on top of skin. Daily Mineral SPF 50 sets in 60 seconds. See the difference.", cta: "Learn More", format: "Video", days: 22, product: "Daily Mineral SPF 50", creator: "Nina P." },
    { headline: "Our founder built this after years of reactive skin", body: "I started Lumen because nothing calmed my skin. The Gentle Cream Cleanser is the first thing I got right.", cta: "Learn More", format: "Static", days: 14, product: "Gentle Cream Cleanser" },
    { headline: "Spring Sale: 25% off Barrier Repair Serum", body: "Use code CALM25 at checkout. Ends Sunday, so don't miss it.", cta: "Shop Now", format: "Static", days: 9, product: "Barrier Repair Serum" },
    { headline: "Bundle & save 30% on the Starter Routine", body: "Cleanser + Serum + SPF in one kit. Free shipping over $40.", cta: "Shop Now", format: "Carousel", days: 9, product: "Starter Routine Bundle" },
    { headline: "Buy 2, get 1 free on the Starter Routine", body: "Last chance. The Starter Routine Bundle deal ends tonight.", cta: "Shop Now", format: "Static", days: 6, product: "Starter Routine Bundle" },
    { headline: "Free shipping on every order this week", body: "Try the Gentle Cream Cleanser risk-free. Free shipping, no minimum.", cta: "Shop Now", format: "Static", days: 3, product: "Gentle Cream Cleanser" },
    { headline: "New: Daily Mineral SPF 50 now in Tinted", body: "Introducing Tinted. Same lightweight mineral formula with a sheer, even finish.", cta: "Shop Now", format: "Static", days: 2, product: "Daily Mineral SPF 50" },
  ],
};

/* ------------------------------ text parsing ------------------------------ */

const SPY_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const SPY_NOISE = /^(sponsored|active|inactive|see ad details|see summary details|platforms?:?.*|library id:?.*|open dropdown|this ad has multiple versions|\d+ ads use this creative and text)$/i;
const SPY_CTA = /^(shop now|learn more|sign up|get offer|order now|buy now|book now|get started|subscribe|download|install now|apply now|contact us|see menu|watch more)$/i;

function spyDates(text) {
  const D = (s) => { const d = new Date(String(s).replace(/\./g, "")); return isNaN(d) ? null : d.getTime(); };
  const r = text.match(/([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})\s*[-–]\s*([A-Z][a-z]{2,8}\.? \d{1,2}, \d{4})/);
  if (r) { const a = D(r[1]), b = D(r[2]); if (a && b && b >= a) return { startMs: a, endMs: b, days: Math.round((b - a) / 86400000) }; }
  const a = spyDaysFrom(text);
  if (a === null) return { startMs: null, endMs: null, days: null };
  return { startMs: Date.now() - a * 86400000, endMs: null, days: a };
}
function spyDaysFrom(text) {
  const m = text.match(/started running on\s+(?:(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})|([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}))/i);
  if (!m) return null;
  const day = +(m[1] || m[5]);
  const mon = SPY_MONTHS[(m[2] || m[4]).toLowerCase()];
  const yr = +(m[3] || m[6]);
  if (mon === undefined) return null;
  const d = Math.floor((Date.now() - new Date(yr, mon, day).getTime()) / 86400000);
  return d >= 0 ? d : null;
}
function spyParse(raw) {
  const chunks = raw
    .replace(/\r/g, "")
    .split(/\n\s*(?:-{3,}|={3,})\s*\n|\n(?=\s*Library ID)|\n{2,}(?=\s*(?:Sponsored|Active)\s*\n)/i)
    .flatMap((c) => (/(?:^|\n)\s*(?:Library ID|Started running)/i.test(c) || /\n\s*\n/.test(c.trim()) === false ? [c] : c.split(/\n{2,}/)))
    .map((c) => c.trim())
    .filter((c) => c.length > 14);
  return chunks.map((c) => {
    const dt = spyDates(c);
    const days = dt.days;
    const rawAll = c.split("\n").map((l) => l.trim()).filter(Boolean);
    const sp = rawAll.findIndex((l) => /^sponsored$/i.test(l));
    const lines = rawAll.filter((l, i) => !SPY_NOISE.test(l) && !/^started running on/i.test(l) && !(sp > 0 && i === sp - 1));
    let cta = "";
    if (lines.length > 1 && SPY_CTA.test(lines[lines.length - 1])) cta = lines.pop();
    const format = /\b(video|reel|0:\d\d)\b/i.test(c) ? "Video" : /\bcarousel\b|\bslides?\b/i.test(c) ? "Carousel" : "Static";
    const first = lines[0] || "";
    const short = first.length <= 110;
    const raw = c.split("\n").map((l) => l.trim()).filter(Boolean);
    const si = raw.findIndex((l) => /^sponsored$/i.test(l));
    const advLine = si > 0 ? raw[si - 1] : "";
    const cm = advLine.match(/^(.{2,60}?)\s+with\s+.{2,40}$/i);
    return { headline: short ? first : first.slice(0, 100) + "…", body: short ? lines.slice(1).join(" ") : lines.join(" "), cta, format, days, startMs: dt.startMs, creator: cm ? cm[1] : "" };
  });
}

/* ------------------------------ summarizing ------------------------------ */

function spyShare(n, total) { return total ? Math.round((n / total) * 100) : 0; }
function spyCount(arr) {
  const m = new Map();
  arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const spyPlural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function spySummarize(ads, brand) {
  const n = ads.length;
  const name = brand || "They";
  const angleCounts = spyCount(ads.map((a) => a.angle));
  const prodCounts = spyCount(ads.filter((a) => a.product).map((a) => a.product));
  const promoAds = ads.filter((a) => a.promos.length);
  const known = ads.filter((a) => a.days !== null);
  const fresh = known.filter((a) => a.days <= 14);
  const winners = known.filter((a) => a.days >= 30).sort((a, b) => b.days - a.days);
  const fmt = spyCount(ads.map((a) => a.format));
  const promoTypes = spyCount(promoAds.flatMap((a) => [...new Set(a.promos.map((p) => p.label.toLowerCase()))]));

  const S = [];

  // main focus
  const [a1, a1n] = angleCounts[0] || ["", 0];
  const main = [];
  if (a1) {
    main.push(`**${SPY_ANGLE[a1].label}** seems to be the lead angle: ${a1n} of ${n} ads (${spyShare(a1n, n)}%).`);
    if (angleCounts[1]) main.push(`Second angle: **${SPY_ANGLE[angleCounts[1][0]].label}** in ${spyPlural(angleCounts[1][1], "ad")}.`);
    const longProof = winners.filter((w) => w.angle === a1).length;
    if (winners.length && longProof) main.push(winners.length === 1 ? "Their only 30+ day ad uses this angle, so it looks like it may be what works for them." : `${longProof} of their ${winners.length} ads that ran 30+ days use this angle, so it looks like it may be what works for them.`);
    else if (winners.length) main.push(`Their longest-running ads lean on **${SPY_ANGLE[winners[0].angle].label}**, not the lead angle.`);
  }
  S.push({ key: "main", title: "Main focus", icon: "Target", tone: "blue", bullets: main, bars: angleCounts.map(([k, c]) => ({ label: SPY_ANGLE[k].label, n: c, pct: spyShare(c, n) })) });

  // products
  const prods = [];
  if (prodCounts.length) {
    const [p1, p1n] = prodCounts[0];
    prods.push(`**${p1}** gets the most ad volume: ${p1n} of ${n} ads (${spyShare(p1n, n)}%).`);
    if (prodCounts[1]) prods.push(`Next: **${prodCounts[1][0]}** (${spyPlural(prodCounts[1][1], "ad")})${prodCounts[2] ? `, then **${prodCounts[2][0]}** (${prodCounts[2][1]})` : ""}.`);
    const hero = ads.filter((a) => a.product === p1);
    const heroAngles = spyCount(hero.map((a) => SPY_ANGLE[a.angle].label)).slice(0, 3).map(([l]) => l).join(", ");
    prods.push(`They test the hero product with several angles (${heroAngles}).`);
    const promoProd = spyCount(promoAds.filter((a) => a.product).map((a) => a.product))[0];
    if (promoProd) prods.push(`Discounts are aimed mostly at **${promoProd[0]}** (${spyPlural(promoProd[1], "promo ad")}).`);
  } else {
    prods.push("No specific product names were detected. Add product names to the ad text, or use AI analysis, for a product breakdown.");
  }
  S.push({ key: "prod", title: "Products they push", icon: "Layers", tone: "emerald", bullets: prods, bars: prodCounts.map(([k, c]) => ({ label: k, n: c, pct: spyShare(c, n) })) });

  // promos
  const pr = [];
  if (promoAds.length) {
    pr.push(`**${spyShare(promoAds.length, n)}%** of ads (${promoAds.length} of ${n}) carry a promotion.`);
    pr.push(`Offers spotted: ${promoTypes.slice(0, 6).map(([l, c]) => `**${l}**${c > 1 ? ` ×${c}` : ""}`).join(", ")}.`);
    const live = promoAds.filter((a) => a.days !== null && a.days <= 21).sort((a, b) => a.days - b.days);
    if (live.length) pr.push(`Likely live now: ${live.slice(0, 3).map((a) => `“${a.promos[0].label}” on ${a.product || "the brand"} (started ${spyPlural(a.days, "day")} ago)`).join("; ")}.`);
    const sale = promoAds.some((a) => a.promos.some((p) => ["event", "urgent", "code"].includes(p.id)));
    pr.push(sale ? "They seem to be running a time-boxed sale with deadlines or codes." : "Offers look evergreen, with no deadline language, so they may be always on.");
  } else {
    pr.push("We do not notice any promotions, discounts or sales. Their messaging seems to sell on value, not price.");
  }
  S.push({ key: "promo", title: "Promotions & sales", icon: "Tag", tone: "amber", bullets: pr });

  // pace
  const pace = [];
  pace.push(`${spyPlural(n, "ad")} analyzed across **${fmt.map(([f, c]) => `${c} ${f.toLowerCase()}`).join(", ")}**.`);
  if (known.length) {
    pace.push(`**${fresh.length}** launched in the last 14 days (${spyShare(fresh.length, known.length)}% of ads with a start date).`);
    pace.push(fresh.length / known.length >= 0.4 ? "That looks like a fast testing cadence, with new creative appearing to go out every week." : "Most ads are older, so they do not seem to refresh creative quickly.");
  } else {
    pace.push("No start dates found, so launch pace could not be measured. Paste the “Started running on” lines from the Ad Library.");
  }
  pace.push(`They use **${angleCounts.length}** different angles, ${angleCounts.length >= 5 ? "a broad creative test." : "a narrow set. Little variety means their message is settled or under-tested."}`);
  S.push({ key: "pace", title: "Testing pace & formats", icon: "Clock", tone: "slate", bullets: pace });

  // winners
  const win = [];
  if (winners.length) {
    winners.slice(0, 3).forEach((w) => win.push(`**${spyPlural(w.days, "day")}** live: “${w.headline}” (${SPY_ANGLE[w.angle].label}, ${w.format.toLowerCase()}).`));
    win.push("Signal, not proof: an ad that stays live this long may well be profitable, but the library does not show spend or results.");
  } else if (known.length) {
    win.push("No ad has run 30+ days yet, so there are no clear winners to copy.");
  } else {
    win.push("Start dates are needed to spot long-running ads.");
  }
  S.push({ key: "win", title: "Likely winners", icon: "Trophy", tone: "emerald", bullets: win });

  // gaps
  const used = new Set(ads.map((a) => a.angle));
  const gapDefs = { proof: "social proof / reviews", ugc: "UGC-style honest reviews", compare: "comparison vs. alternatives", founder: "a founder story", problem: "problem-first hooks", mechanism: "product mechanism / ingredients" };
  const gaps = Object.keys(gapDefs).filter((k) => !used.has(k)).slice(0, 3).map((k) => `We do not notice any **${gapDefs[k]}** ads, which may be open ground.`);
  if (!gaps.length) gaps.push("They appear to cover every major angle. Win on execution: a sharper hook, better offer clarity or cleaner creative.");
  if (fmt.length === 1) gaps.push(`All their ads are **${fmt[0][0].toLowerCase()}**. Test ${fmt[0][0] === "Video" ? "static" : "video"} to stand out.`);
  S.push({ key: "gap", title: "Gaps you can exploit", icon: "Gap", tone: "rose", bullets: gaps });

  const promoPart = promoAds.length ? `${spyShare(promoAds.length, n)}% of its ads seem to carry a promotion` : "it does not seem to run promotions";
  const verdict = `${name === "They" ? "This advertiser" : name} seems to lead with ${a1 ? SPY_ANGLE[a1].label.toLowerCase() : "product messaging"}${prodCounts[0] ? `, appears to push ${prodCounts[0][0]} hardest` : ""}, and ${promoPart}.`;
  return { sections: S, verdict, n };
}

function spyReportText(brand, verdict, sections, insights) {
  const strip = (s) => s.replace(/\*\*/g, "");
  const parts = [`COMPETITOR REPORT: ${brand || "Advertiser"}`, verdict, ""];
  sections.forEach((s) => { parts.push(s.title.toUpperCase()); s.bullets.forEach((b) => parts.push("• " + strip(b))); parts.push(""); });
  if (insights && insights.length) { parts.push("STRATEGIST READ (AI)"); insights.forEach((b) => parts.push("• " + b)); }
  return parts.join("\n").trim();
}


/* ------------------------ slide-style report (hedged) ------------------------ */

const SPY_MONTH = (ad) => new Date(ad.startMs || Date.now() - (ad.days || 0) * 86400000).toLocaleString("en", { month: "long" });

function spySlide(ads, brand, platform) {
  const n = ads.length;
  const B = brand || "The brand";
  const out = [];
  const creators = [...new Set(ads.filter((a) => a.creator).map((a) => a.creator))];
  if (creators.length) {
    out.push(`Collaborations with ${creators.length > 1 ? "multiple influencers like" : "an influencer like"} ${creators.slice(0, 2).join(" and ")} seem to appear ${creators.length > 2 ? `(${creators.length} creators in total) ` : ""}throughout the period.`);
  }
  const vid = ads.filter((a) => a.format === "Video").length;
  const stat = n - vid;
  const prodCounts = spyCount(ads.filter((a) => a.product).map((a) => a.product));
  const lead = vid >= stat ? "videos" : "static images";
  const other = vid >= stat ? "static images" : "videos";
  out.push(`They seem to primarily focus on ${prodCounts[0] ? `promoting ${prodCounts[0][0]}` : "their products"} with ${lead}${vid && stat ? ` while also maintaining a presence with ${other}` : ""}.`);

  const byMonth = new Map();
  ads.filter((a) => a.startMs).sort((x, y) => x.startMs - y.startMs).forEach((a) => {
    a.promos.filter((p) => ["pct", "amt", "bogo", "code"].includes(p.id)).forEach((p) => {
      const m = SPY_MONTH(a);
      const arr = byMonth.get(m) || [];
      if (!arr.includes(p.label)) arr.push(p.label);
      byMonth.set(m, arr);
    });
  });
  const offers = [...byMonth.entries()];
  if (offers.length) out.push(offers.slice(0, 3).map(([m, ls], i) => `${i === 0 ? "In" : "in"} ${m} we notice ${ls.slice(0, 2).map((l) => `a ${l}`).join(" and ")} offer`).join(", ") + ".");
  const gifts = [...new Set(ads.flatMap((a) => a.promos.filter((p) => p.id === "gift" || p.id === "ship" || p.id === "bundle").map((p) => p.label)))];
  if (gifts.length) out.push(`We also notice value-add offers such as ${gifts.slice(0, 3).join(", ").toLowerCase()}, which appear to be used instead of (or alongside) straight discounts.`);
  if (!offers.length && !gifts.length) out.push("We do not notice any clear discounts or sales, so the messaging seems to lean on product value.");

  if (prodCounts.length > 1) out.push(`${B}'s ad campaigns indicate that the brand prioritizes ${prodCounts[0][0]} and ${prodCounts[1][0]} as their hero product lines.`);
  const angleCounts = spyCount(ads.map((a) => a.angle));
  if (angleCounts[0]) out.push(`The main angle looks to be ${SPY_ANGLE[angleCounts[0][0]].label.toLowerCase()}${angleCounts[1] ? `, followed by ${SPY_ANGLE[angleCounts[1][0]].label.toLowerCase()}` : ""}.`);
  const win = ads.filter((a) => a.days !== null && a.days >= 30).sort((a, b) => b.days - a.days)[0];
  if (win) out.push(`Ads about ${win.product || "one product"} appear to have been live the longest (${win.days}+ days), which may suggest they are working.`);
  return out.slice(0, 7);
}

const SPY_COUNTRIES = { GR: "Greece", US: "United States", GB: "United Kingdom", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain", NL: "Netherlands", CY: "Cyprus", PT: "Portugal", IE: "Ireland", BE: "Belgium", ALL: "All countries" };

function spyParseLib(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  let id = "", country = "", name = "";
  const m = t.match(/view_all_page_id=(\d{5,})/);
  if (m) id = m[1];
  else if (/^\d{5,}$/.test(t)) id = t;
  const c = t.match(/[?&]country=([A-Za-z]{2,3})/);
  if (c) country = c[1].toUpperCase();
  const d1 = t.match(/start_date(?:\[|%5B)min(?:\]|%5D)=(\d{4}-\d\d-\d\d)/i), d2 = t.match(/start_date(?:\[|%5B)max(?:\]|%5D)=(\d{4}-\d\d-\d\d)/i);
  const q = t.match(/[?&]q=([^&]+)/);
  if (q) { try { name = decodeURIComponent(q[1].replace(/\+/g, " ")); } catch (e) {} }
  if (!id) return { error: q ? "That link is a keyword search, which mixes in resellers. Open the advertiser's own page in the Ad Library (pick them from the dropdown) and paste that link." : "Couldn't find an advertiser in that link. Open the Ad Library, pick the advertiser from the dropdown, and paste the link from the address bar." };
  return { id, country, name, from: d1 ? d1[1] : "", to: d2 ? d2[1] : "" };
}

function spyWindows(from, to, country, id, days = 14) {
  const out = [];
  const iso = (d) => d.toISOString().slice(0, 10);
  let a = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  if (isNaN(a) || isNaN(end) || a > end) return out;
  while (a <= end && out.length < 40) {
    let b = new Date(a.getTime() + (days - 1) * 86400000);
    if (b > end) b = end;
    out.push({ a: iso(a), b: iso(b), url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country || "ALL"}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${id}&start_date[min]=${iso(a)}&start_date[max]=${iso(b)}&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc` });
    a = new Date(b.getTime() + 86400000);
  }
  return out;
}

function spyBrief(lib, from, to, brand, wins) {
  return `Analyze a competitor's Meta ads for AdDoctor.

Advertiser: ${brand || "(name)"}  ·  Meta page ID: ${lib.id}  ·  Country: ${SPY_COUNTRIES[lib.country] || lib.country || "All"}  ·  Period: ${from} to ${to}

1. Open each link below in the Meta Ad Library. The status is "All ads", so ended ads are included. Scroll to the bottom of each one to load every ad. The Library loads only about 20-30 ads per page, which is why the period is split.
2. For every ad record: Library ID, start and end dates, advertiser name (a name like "X with ${brand || "Brand"}" is an influencer collaboration), ad text, and whether it is video or static. Remove duplicates by Library ID.
3. Write the analysis as a slide titled "${brand || "Brand"} - Meta Ads". Use short bullets in this style: collaborations with influencers, main focus and product, video vs static mix, promotions with the month they ran, hero product lines.
4. Never sound certain. Use "seems to", "appears to", "looks to", "we notice", "indicate that". Do not invent numbers. The Library shows no spend or results.
5. End with: Sources: Meta Ad Library, ${new Date().toLocaleString("en", { month: "long", year: "numeric" })}.

Links:
${wins.map((w) => `${w.a} to ${w.b}: ${w.url}`).join("\n")}`;
}


/* --------------------- crawling the Ad Library (desktop app) --------------------- */

const SPY_LIB_NOISE = /^(active|inactive|sponsored|platforms?:?|see ad details|see summary details|menu|eu transparency|open dropdown|this ad has multiple versions|shop now|learn more|sign up|get offer|order now|book now|apply now|download|install now|subscribe|contact us|watch more|see more|see details|send message|get quote|call now|listen now|play game|use app|like|comment|share)$/i;
const SPY_LIB_CTA = /^(shop now|learn more|sign up|get offer|order now|buy now|book now|apply now|download|install now|subscribe|contact us|watch more|send message|get quote|call now)$/i;

function spyParseLibraryText(raw) {
  let t = String(raw || "");
  const first = t.search(/Library ID:/);
  if (first < 0) return [];
  t = t.slice(first);
  const foot = t.search(/\n\s*System status\b/);
  if (foot > 0) t = t.slice(0, foot);
  return t.split(/Library ID:\s*/).slice(1).map((p) => {
    const libId = (p.match(/^\d+/) || [""])[0];
    const lines = p.split("\n").map((l) => l.replace(/\u200b|\u200c|\u200d|\ufeff/g, "").trim()).filter(Boolean);
    const si = lines.findIndex((l) => /^sponsored$/i.test(l));
    const adv = si > 0 ? lines[si - 1] : "";
    const dt = spyDates(p);
    const video = /\b\d:\d\d \/ \d:\d\d\b/.test(p);
    const cta = [...lines].reverse().find((l) => SPY_LIB_CTA.test(l)) || "";
    const body = (si >= 0 ? lines.slice(si + 1) : lines.slice(1)).filter((l) => !SPY_LIB_NOISE.test(l) && !/^\d:\d\d(\s\/\s\d:\d\d)?$/.test(l) && !/^[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,}$/.test(l) && !/^started running on/i.test(l) && !/^\d+ ads use this creative/i.test(l) && !/^[A-Z][a-z]{2} \d{1,2}, \d{4}\s*-/.test(l));
    const cm = adv.match(/^(.{2,60}?)\s+with\s+(.{2,40})$/i);
    const creator = cm && cm[1].trim().toLowerCase() !== cm[2].trim().toLowerCase() ? cm[1].trim() : "";
    const first1 = body[0] || "";
    return { libId, advertiser: adv, headline: first1.length > 110 ? first1.slice(0, 107) + "…" : first1, body: (first1.length > 110 ? body : body.slice(1)).join(" ").slice(0, 400), cta, format: video ? "Video" : "Static", days: dt.days, startMs: dt.startMs, endMs: dt.endMs, creator };
  }).filter((a) => a.libId && (a.headline || a.body));
}

function spyCrawlText(r) {
  if (!r) return "";
  if (typeof r.payload === "string") return r.payload;
  const b = (r.content || []).find((x) => x && x.type === "text");
  return b ? b.text : "";
}

const SPY_SLIDE_RULES = `Rules for "slide": write like this example, which is only about tone and length and must not be copied: "Collaborations with multiple well-known influencers like A and B throughout the year." / "They seem to primarily focus on promoting their skincare products with videos while also maintaining a presence with static images." / "In early January we notice a -30% offer and early in the summer a -50% on selected products." / "The brand's ad campaigns indicate that it prioritizes X and Y as their hero product lines." Cover, where the material supports it: influencer collaborations (an advertiser shown as "X with Brand"), video vs static mix, which product they focus on most, promotions and sales with the month they ran, hero product lines, and any sign-up or lead ads. Be unsure in tone. Use words like "seem to", "appear to", "looks to", "we notice", "indicate that". Never state anything as fact that the ads cannot prove, and never claim spend or results. Write in English, even if the ads are not.`;

const spyWf = (x) => String(x).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
function spyCompact(ads, cap = 13000) {
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
    if (out.length + line.length < cap) out += spyWf(line);
  });
  return out;
}

function spyPlatformTitle(brand, platforms) {
  const order = ["Google", "Meta", "TikTok"].filter((p) => platforms.includes(p));
  const list = order.length > 1 ? order.slice(0, -1).join(", ") + " & " + order[order.length - 1] : order[0] || "Meta";
  return `${brand ? brand + " - " : ""}${list} Ads`;
}

function SpySlide({ brand, reports, onRebuild }) {
  const platforms = ["Google", "Meta", "TikTok"].filter((p) => reports[p]);
  const all = platforms.flatMap((p) => reports[p].ads).slice(0, 6);
  const srcNames = platforms.map((p) => ({ Meta: "Meta Ad Library", Google: "Google Ads Transparency Center", TikTok: "TikTok ad library" }[p]));
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" id="spy-slide">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-blue-600 sm:text-[28px]">{spyPlatformTitle(brand, platforms)}</h2>
          {platforms.map((p) => (
            <div key={p} className="mt-6">
              <h3 className="text-lg font-bold text-slate-900">{p}</h3>
              <ul className="mt-2 space-y-1.5">
                {reports[p].slide.map((b, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-800"><span className="select-none">•</span><span>{b}</span></li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-8 text-[11px] italic text-slate-400">Sources: {srcNames.join(", ")}, {new Date().toLocaleString("en", { month: "long", year: "numeric" })}. Ad libraries show what is running, not spend or results.</p>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Ads behind these bullets</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {all.map((a) => (
              <div key={a.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{a.format}</span>
                  {a.creator && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Creator: {a.creator}</span>}
                  {a.days !== null && <span className="text-slate-400">{a.days}d</span>}
                </div>
                <p className="mt-2 line-clamp-3 text-[13px] font-semibold leading-snug text-slate-900">{a.headline}</p>
                {a.promos[0] && <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><Icon.Tag className="h-3 w-3" />{a.promos[0].label}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- UI --------------------------------- */

const SPY_TONE = {
  blue: { chip: "bg-blue-50 text-blue-700 ring-blue-100", bar: "bg-blue-500" },
  emerald: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-100", bar: "bg-emerald-500" },
  amber: { chip: "bg-amber-50 text-amber-700 ring-amber-100", bar: "bg-amber-500" },
  slate: { chip: "bg-slate-100 text-slate-600 ring-slate-200", bar: "bg-slate-500" },
  rose: { chip: "bg-rose-50 text-rose-700 ring-rose-100", bar: "bg-rose-500" },
};
const SPY_REPORT_TONE = ["amber", "emerald", "blue", "rose", "slate"];
const SPY_ICON = { Target: Icon.Target, Layers: Icon.Layout, Tag: Icon.Tag, Clock: Icon.Clock, Trophy: Icon.Trophy, Gap: Icon.Gap };

function Rich({ text }) {
  return String(text).split("**").map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-slate-900">{p}</strong> : <span key={i}>{p}</span>));
}

function SpySection({ s }) {
  const tone = SPY_TONE[s.tone];
  const I = SPY_ICON[s.icon] || Icon.Target;
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={s.title}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${tone.chip}`}><I className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
      </div>
      <ul className="mt-3.5 space-y-2.5">
        {s.bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-slate-600">
            <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.bar}`} />
            <span><Rich text={b} /></span>
          </li>
        ))}
      </ul>
      {s.bars && s.bars.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {s.bars.slice(0, 5).map((b) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate font-medium text-slate-700">{b.label}</span>
                <span className="shrink-0 tabular-nums text-slate-400">{b.n} · {b.pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${b.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SpyAdCard({ ad, onRebuild }) {
  const winner = ad.days !== null && ad.days >= 30;
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {ad.img && <img src={ad.img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="mb-3 aspect-[4/3] w-full rounded-xl bg-slate-100 object-cover" />}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{ad.format}</span>
        {ad.days !== null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${winner ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-white text-slate-500 ring-slate-200"}`}>
            {winner && <Icon.Trophy className="h-3 w-3" />}{ad.days}d live
          </span>
        )}
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">{SPY_ANGLE[ad.angle].label}</span>
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-snug text-slate-900">{ad.headline}</p>
      {ad.body && <p className="mt-1.5 line-clamp-4 text-[13px] leading-relaxed text-slate-500">{ad.body}</p>}
      {ad.promos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ad.promos.slice(0, 4).map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100"><Icon.Tag className="h-3 w-3" />{p.label}</span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="min-w-0 truncate text-xs text-slate-400">{ad.product || "No product detected"}{ad.cta ? ` · ${ad.cta}` : ""}</span>
        <button onClick={() => onRebuild(SPY_ANGLE[ad.angle].tpl)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
          <Icon.Wand className="h-3.5 w-3.5" /> Rebuild
        </button>
      </div>
    </article>
  );
}

const SPY_AI_ERR = {
  not_granted: "Claude access was declined for this page. Use Quick scan instead.",
  rate_limited: "Too many requests right now. Wait a moment, or use Quick scan.",
  images_unavailable: "Screenshots can't be read in this view. Paste the ad text instead.",
  image_rejected: "One screenshot couldn't be read. Use a PNG or JPG under the size limit.",
};


function spyUrl(id, country, a, b, mt) {
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country || "ALL"}&is_targeted_country=false&media_type=${mt || "all"}&search_type=page&view_all_page_id=${id}&start_date[min]=${a}&start_date[max]=${new Date(Date.parse(b + "T00:00:00Z") + 86400000).toISOString().slice(0, 10)}&sort_data[mode]=relevancy_monthly_grouped&sort_data[direction]=desc`;
}
function spyHalves(a, b) {
  const A = Date.parse(a + "T00:00:00Z"), B = Date.parse(b + "T00:00:00Z");
  const days = Math.round((B - A) / 86400000);
  if (days < 1) return null;
  const mid = new Date(A + Math.floor(days / 2) * 86400000).toISOString().slice(0, 10);
  const next = new Date(A + (Math.floor(days / 2) + 1) * 86400000).toISOString().slice(0, 10);
  return [[a, mid], [next, b]];
}

const spySeen = (out) => (out.vision && out.vision.images ? ` and looked at ${spyPlural(out.vision.images, "creative")}` : "");

function SpyView({ onRebuild, notify }) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const [brand, setBrand] = useState("");
  const [ai, setAi] = useState({ ready: false, sample: null });
  const [sort, setSort] = useState("days");
  const [detail, setDetail] = useState(false);
  const [libRaw, setLibRaw] = useState("");
  const [country, setCountry] = useState("");
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 6, 1)));
  const [to, setTo] = useState(iso(now));
  const [opts, setOpts] = useState(false);
  const [crawl, setCrawl] = useState({ phase: "idle", i: 0, n: 0, found: 0, msg: "" });
  const [browser, setBrowser] = useState({ ready: false, mcp: null });
  const [state, setState] = useState(null);
  const [helper, setHelper] = useState(false);
  const helperLink = useRef(null);
  const crawlCtl = useRef(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const c = window.claude;
        const s = c && c.use ? await c.use("sample") : null;
        if (!dead) setAi({ ready: true, sample: s || null });
      } catch (e) { if (!dead) setAi({ ready: true, sample: null }); }
    })();
    (async () => {
      try {
        const c = window.claude;
        const m = c && c.use ? await c.use("mcp") : null;
        let ok = false;
        if (m && m.listTools) { try { const l = await m.listTools(); ok = !!(l && l.servers && l.servers.some((x) => x.server === "host:claude_browser")); } catch (e) {} }
        if (!dead) setBrowser({ ready: true, mcp: ok ? m : null });
      } catch (e) { if (!dead) setBrowser({ ready: true, mcp: null }); }
    })();
    return () => { dead = true; };
  }, []);

  const lib = useMemo(() => (libRaw.trim() ? spyParseLib(libRaw) : null), [libRaw]);
  const libOk = lib && !lib.error;
  useEffect(() => { if (libOk) { setCountry(lib.country || ""); if (lib.name) setBrand(lib.name); if (lib.from) setFrom(lib.from); if (lib.to) setTo(lib.to); } }, [lib]);

  const finish = (source, ads, slide, insights, b, more) => {
    const tagged = ads.map(spyTag);
    const sum = spySummarize(tagged, b);
    setState({ brand: b || "", source, active: "Meta", reports: { Meta: { ads: tagged, slide: slide && slide.length ? slide : spySlide(tagged, b, "Meta"), insights: insights || [], report: (more && more.report) || [], creatives: (more && more.creatives) || [], ...sum } } });
    setSort("days");
    setTimeout(() => { const el = document.getElementById("spy-results"); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
  };

  const runApi = async () => {
    const ctrl = new AbortController();
    crawlCtl.current = ctrl;
    const cty = country || lib.country || "ALL";
    const sleep = (ms) => new Promise((r) => setTimeout(r, window.__spyFast ? 5 : ms));
    const post = async (path, body) => {
      const r = await fetch(SPY_API + path, { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) }, body: JSON.stringify(body) });
      let j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw { code: "api", message: j.error || "Server error " + r.status };
      return j;
    };
    try {
      setCrawl({ phase: "running", i: 0, n: 1, found: 0, msg: "Finding every ad from this advertiser…" });
      const { run, paged, max } = await post("/start", { page_id: lib.id, country: cty, from, to });
      let status = "RUNNING", found = 0, tick = 0;
      // A long advertiser is read a few pages at a time, then every ad is sent for the analysis in one go.
      let all = null;
      if (paged) {
        all = [];
        let cursor = "";
        for (let k = 0; k < 40; k++) {
          if (ctrl.signal.aborted) throw { code: "cancelled" };
          let pg;
          try { pg = await post("/page", { run, cursor, have: all.length }); }
          catch (e) { if (all.length && e && e.code === "api") break; throw e; }   // e.g. out of credits part-way: analyse what was read
          all = all.concat(pg.ads || []);
          cursor = pg.cursor || "";
          setCrawl({ phase: "running", i: Math.min(18, Math.round((all.length / (max || 200)) * 18)), n: 20, found: all.length, plain: true, msg: "Reading the Ad Library" });
          if (!cursor) break;
        }
        if (!all.length) throw { code: "api", message: "No ads found for that advertiser and period." };
        status = "SUCCEEDED"; found = all.length;
      }
      while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        await sleep(3500);
        if (ctrl.signal.aborted) throw { code: "cancelled" };
        const r = await fetch(`${SPY_API}/status?run=${encodeURIComponent(run)}`, { signal: ctrl.signal, headers: SPY_KEY ? { "X-App-Key": SPY_KEY } : {} });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw { code: "api", message: j.error || "Server error " + r.status };
        status = j.status; found = j.found || 0; tick++;
        setCrawl({ phase: "running", i: Math.min(tick, 18), n: 20, found, msg: "Reading the Ad Library" });
      }
      if (status !== "SUCCEEDED") throw { code: "api", message: "The Ad Library read didn't finish (" + status.toLowerCase() + "). Try again." };
      setCrawl({ phase: "running", i: 19, n: 20, found, plain: !!all, msg: all ? "Looking at the creatives and writing the analysis…" : "Writing the analysis…" });
      const out = await post("/analyze", all ? { ads: all, brand: brand.trim(), from, to } : { run, brand: brand.trim(), from, to });
      const name = brand.trim() || out.brand || "";
      if (!brand.trim() && name) setBrand(name);
      finish(out.slide && out.slide.length ? "crawl-ai" : "crawl", out.ads || [], out.slide, out.insights, name, out);
      setCrawl({ phase: "done", i: 20, n: 20, found: out.count || 0, msg: `Done. Read ${out.count || 0} distinct ads${spySeen(out)}.${out.aiError ? " Claude could not write the analysis (" + out.aiError + "), so the bullets come from keyword rules." : ""}` });
    } catch (e) {
      const c = e && e.code;
      if (c === "api") setHelper(true);   // the server could not read the Ad Library, so offer the free way
      setCrawl({ phase: "error", i: 0, n: 0, found: 0, msg: c === "cancelled" ? "Stopped." : c === "api" ? e.message + " You can still read this advertiser for free with the AdDoctor button below." : "Couldn't reach the AdDoctor server. Check your connection and try again." });
    } finally { crawlCtl.current = null; }
  };

  // Ads read in the visitor's own browser by the AdDoctor bookmark arrive here from the Ad Library tab.
  const runPosted = async (data) => {
    const raw = data.ads.filter((x) => x && typeof x === "object").slice(0, 800);
    if (!raw.length || crawlCtl.current) return;
    const ctrl = new AbortController();
    crawlCtl.current = ctrl;
    const pl = spyParseLib(String(data.url || ""));
    if (pl && !pl.error) setLibRaw(String(data.url));
    setState(null);
    setCrawl({ phase: "running", i: 12, n: 20, found: raw.length, plain: true, msg: "Looking at the creatives and writing the analysis…" });
    const local = (why) => {
      const seen = new Set();
      const ads = raw.map(spyFromLib).filter((a) => (a.headline || a.body) && a.libId && !seen.has(a.libId) && seen.add(a.libId));
      const name = (spyCount(ads.filter((a) => !/ with /i.test(a.advertiser)).map((a) => a.advertiser))[0] || [""])[0];
      setBrand(name);
      finish("crawl", ads, null, [], name);
      setCrawl({ phase: "done", i: 20, n: 20, found: ads.length, msg: `Read ${ads.length} distinct ads. ${why} The bullets below come from keyword rules, without the image analysis.` });
    };
    try {
      if (!SPY_API) return local("This copy of AdDoctor has no server set up.");
      const r = await fetch(SPY_API + "/analyze", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) }, body: JSON.stringify({ ads: raw }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(out.ads)) return local(r.status === 429 ? (out.error || "The server is busy.") : "The AdDoctor server has not been updated to read these yet.");
      const name = out.brand || "";
      setBrand(name);
      if (out.from) setFrom(out.from);
      if (out.to) setTo(out.to);
      finish(out.slide && out.slide.length ? "crawl-ai" : "crawl", out.ads, out.slide, out.insights, name, out);
      setCrawl({ phase: "done", i: 20, n: 20, found: out.count || 0, msg: `Done. Read ${out.count || 0} distinct ads${spySeen(out)}.${out.aiError ? " Claude could not write the analysis (" + out.aiError + "), so the bullets come from keyword rules." : ""}` });
    } catch (e) {
      if (ctrl.signal.aborted) setCrawl({ phase: "error", i: 0, n: 0, found: 0, msg: "Stopped." });
      else local("The AdDoctor server could not be reached.");
    } finally { crawlCtl.current = null; }
  };
  const postedRef = useRef(runPosted);
  postedRef.current = runPosted;
  useEffect(() => {
    const onMsg = (ev) => {
      if (!SPY_FB_ORIGIN.test(ev.origin) || !ev.data || ev.data.type !== "addoctor-ads" || !Array.isArray(ev.data.ads)) return;
      postedRef.current(ev.data);
    };
    window.addEventListener("message", onMsg);
    // The ads arrive as this tab's window name. Failing that, tell the Ad Library tab that opened this one that
    // AdDoctor is ready, and it sends them as a message.
    let named = null;
    try { if (window.name.indexOf("addoctor:") === 0) { named = JSON.parse(window.name.slice(9)); window.name = "addoctor-done"; } } catch (e) { /* not ours */ }
    if (named && Array.isArray(named.ads)) postedRef.current(named);
    else if (window.name !== "addoctor-done") try { if (window.opener) window.opener.postMessage({ type: "addoctor-ready" }, "*"); } catch (e) { /* no opener */ }   // a reload must not ask for the ads again
    return () => window.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => {
    if (helperLink.current) helperLink.current.setAttribute("href", spyBookmarklet(location.origin + location.pathname + "#spy"));
  });

  const runCrawl = async () => {
    if (!libOk) return;
    if (SPY_API) return runApi();
    if (!browser.mcp) {
      setHelper(true);
      setCrawl({ phase: "error", i: 0, n: 0, found: 0, msg: "This copy of AdDoctor can't read the Ad Library by itself. Use the AdDoctor button below to read it in your own browser." });
      return;
    }
    const mcp = browser.mcp;
    const ctrl = new AbortController();
    crawlCtl.current = ctrl;
    const cty = country || lib.country || "ALL";
    const call = (tool, input) => mcp.callTool("host:claude_browser", tool, input, { signal: ctrl.signal, cache: false });
    const sleep = (ms) => new Promise((r) => setTimeout(r, window.__spyFast ? 5 : ms));
    const pageText = async () => spyCrawlText(await call("get_page_text", { max_chars: 200000 }));
    const count = (t) => (t.match(/Library ID:/g) || []).length;
    const navigate = async (url) => {
      try { await call("navigate", { url }); }
      catch (e) {
        if (e && e.code === "tool_error" && /allow|access/i.test(String(e.message || ""))) {
          await call("request_access", { url: "https://facebook.com", scope: "site" });
          await call("navigate", { url });
        } else throw e;
      }
    };
    // Scrolling can fail right after a page opens (the pane may not be ready or in front).
    // Wait, retry, then try the keyboard. Never abort the crawl over a scroll.
    const scrollDown = async () => {
      const tries = [
        () => call("computer", { action: "scroll", coordinate: [400, 300], scroll_direction: "down", scroll_amount: 10 }),
        async () => { await sleep(2500); return call("computer", { action: "scroll", coordinate: [400, 300], scroll_direction: "down", scroll_amount: 10 }); },
        () => call("computer", { action: "key", text: "End" }),
      ];
      for (const t of tries) {
        if (ctrl.signal.aborted) throw { code: "cancelled" };
        try { await t(); return true; }
        catch (e) { if (e && (e.code === "cancelled" || e.code === "not_in_manifest" || e.code === "server_not_connected")) throw e; await sleep(1200); }
      }
      return false;
    };
    const loadUrl = async (url) => {
      await navigate(url);
      await sleep(4500);
      let last = -1, same = 0, text = "";
      for (let k = 0; k < 14 && same < 2; k++) {
        if (ctrl.signal.aborted) throw { code: "cancelled" };
        text = await pageText();
        const n = count(text);
        if (n === last) same++; else { same = 0; last = n; }
        if (same >= 2) break;
        if (!(await scrollDown())) break;
        await sleep(2200);
      }
      const m = text.match(/~?(\d[\d,]*)\+?\s+results?/);
      return { text, loaded: Math.max(last, 0), total: m ? +m[1].replace(/,/g, "") : 0 };
    };
    const byId = new Map();
    const take = (text) => spyParseLibraryText(text).forEach((a) => { if (!byId.has(a.libId)) byId.set(a.libId, a); });
    const capped = (r) => (r.total ? r.loaded < r.total * 0.7 : r.loaded >= 20);
    const wins = spyWindows(from, to, cty, lib.id);
    let reads = 0, guard = 0;
    const status = (i, msg) => setCrawl({ phase: "running", i, n: wins.length, found: byId.size, msg });
    // Meta loads only ~20-30 ads per page. Read a slice; if it looks cut off, split it by
    // format (video / static), then by date, until each slice is read completely.
    const readSlice = async (i, a, b, mt, depth) => {
      if (++guard > 400) return;
      status(i, `Reading ${a} to ${b}${mt === "video" ? " · videos" : mt === "image_and_meme" ? " · static" : ""}`);
      const r = await loadUrl(spyUrl(lib.id, cty, a, b, mt));
      reads++;
      take(r.text);
      if (!capped(r)) return;
      if (mt === "all") {
        await readSlice(i, a, b, "video", depth);
        await readSlice(i, a, b, "image_and_meme", depth);
        return;
      }
      const h = depth < 4 ? spyHalves(a, b) : null;
      if (h) for (const [x, y] of h) await readSlice(i, x, y, mt, depth + 1);
    };
    try {
      for (let i = 0; i < wins.length; i++) {
        if (ctrl.signal.aborted) throw { code: "cancelled" };
        await readSlice(i + 1, wins[i].a, wins[i].b, "all", 0);
      }
      const ads = [...byId.values()];
      if (!ads.length) { setCrawl({ phase: "error", i: 0, n: 0, found: 0, msg: "No ads came back for that page and period. Check the link and the dates." }); return; }
      const advs = spyCount(ads.filter((a) => !/ with /i.test(a.advertiser)).map((a) => a.advertiser));
      const name = brand.trim() || (advs[0] && advs[0][0]) || "";
      if (!brand.trim() && name) setBrand(name);
      let slide = null, insights = [];
      if (ai.sample) {
        setCrawl({ phase: "running", i: wins.length, n: wins.length, found: ads.length, msg: "Writing the analysis…" });
        try {
          const prompt = `You are a direct-response paid media analyst summarizing a competitor's Meta ads for an agency slide. Today is ${new Date().toISOString().slice(0, 10)}. Advertiser: ${name || "unknown"}. Period: ${from} to ${to}. Total distinct ads read: ${ads.length}.
Each line below is a group of near-identical ads: x<count> | format | start to end (or "running") | advertiser or creator | ad text.
Return ONLY JSON: {"slide":[5 to 7 short bullets in the style of an agency competitor slide],"insights":[3 to 5 short bullets a media buyer can act on]}
${SPY_SLIDE_RULES}

ADS:
${spyCompact(ads)}`;
          const out = await ai.sample.json(prompt, { signal: ctrl.signal, modelTier: "default" });
          slide = (Array.isArray(out && out.slide) ? out.slide : []).map(String).slice(0, 8);
          insights = (Array.isArray(out && out.insights) ? out.insights : []).map(String).slice(0, 6);
        } catch (e) { if (e && e.code === "cancelled") throw e; }
      }
      finish(slide && slide.length ? "crawl-ai" : "crawl", ads, slide, insights, name);
      setCrawl({ phase: "done", i: wins.length, n: wins.length, found: ads.length, msg: `Done. Read ${ads.length} distinct ads across ${reads} page loads.` });
    } catch (e) {
      const c = e && e.code;
      const msg = c === "cancelled" ? (byId.size ? `Stopped. ${byId.size} ads read so far.` : "Stopped.")
        : c === "not_in_manifest" ? "Browser access was declined for this page, so nothing was read."
        : c === "server_not_connected" ? "The Claude desktop app's browser isn't reachable. Open this page in the desktop app and try again."
        : c === "tool_error" ? `The browser reported a problem: ${String(e.message || "").slice(0, 160)}`
        : "The crawl stopped unexpectedly. Try again.";
      setCrawl({ phase: "error", i: 0, n: 0, found: byId.size, msg });
      if (byId.size && c === "cancelled") finish("crawl", [...byId.values()], null, [], brand.trim());
    } finally {
      crawlCtl.current = null;
    }
  };

  const res = state ? state.reports[state.active] : null;
  const sorted = useMemo(() => {
    if (!res) return [];
    const a = [...res.ads];
    if (sort === "days") a.sort((x, y) => (y.days ?? -1) - (x.days ?? -1));
    else if (sort === "angle") a.sort((x, y) => x.angle.localeCompare(y.angle));
    else if (sort === "promo") a.sort((x, y) => y.promos.length - x.promos.length);
    return a;
  }, [res, sort]);

  const copy = async (txt, msg) => {
    const ok = await copyText(txt);
    notify(ok === false ? "Couldn't copy. Select the text manually." : msg);
  };
  const reportText = () => {
    const out = [spyPlatformTitle(state.brand, ["Meta"]), "", "Meta"];
    state.reports.Meta.slide.forEach((b) => out.push("• " + b));
    state.reports.Meta.report.forEach((s) => { out.push("", s.title); s.bullets.forEach((b) => out.push("• " + b)); });
    out.push("", `Sources: Meta Ad Library, ${new Date().toLocaleString("en", { month: "long", year: "numeric" })}`);
    return out.join("\n");
  };
  const srcLabel = state && state.source === "crawl-ai" ? "Read from the Meta Ad Library" : "Read from the Meta Ad Library · keyword wording";
  const inp = "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10";
  const running = crawl.phase === "running";
  const noDesktop = browser.ready && !browser.mcp && !SPY_API;

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Paste a competitor's Ad Library link</h2>
        <p className="mt-1 text-sm text-slate-500">Open the <a href="https://www.facebook.com/ads/library/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">Meta Ad Library</a>, pick the advertiser from the dropdown and copy the address bar. AdDoctor finds every ad from that page and writes the analysis.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input id="spy-lib" value={libRaw} onChange={(e) => setLibRaw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && libOk && !running) runCrawl(); }} placeholder="https://www.facebook.com/ads/library/?…view_all_page_id=…" aria-label="Ad Library link" className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10" />
          {running ? (
            <button onClick={() => crawlCtl.current && crawlCtl.current.abort()} className="h-12 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 hover:border-slate-300">Stop</button>
          ) : (
            <button id="spy-analyze" onClick={runCrawl} disabled={!libOk} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 disabled:cursor-not-allowed disabled:opacity-50"><Icon.Sparkle className="h-4 w-4" />Analyze</button>
          )}
        </div>
        {lib && lib.error && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{lib.error}</p>}
        {libOk && !running && crawl.phase === "idle" && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Icon.Check className="h-3.5 w-3.5" />Advertiser found{(country || lib.country) ? " in " + (SPY_COUNTRIES[country || lib.country] || country || lib.country) : ""}, {from} to {to}. Press Analyze.</p>}

        {crawl.phase !== "idle" && (
          <div className="mt-4" id="spy-progress" role="status">
            {running && (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.round((crawl.i / Math.max(crawl.n, 1)) * 100)}%` }} /></div>
                <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-900">{crawl.found} ads found</span>{crawl.plain ? "" : ` · period ${crawl.i} of ${crawl.n}`} · {crawl.msg}</p>
                <p className="mt-0.5 text-xs text-slate-400">This can take a few minutes. Keep this page open.</p>
              </>
            )}
            {crawl.phase === "done" && <p className="text-sm font-medium text-emerald-700">{crawl.msg} Your analysis is below.</p>}
            {crawl.phase === "error" && <p role="alert" className="text-sm font-medium text-rose-600">{crawl.msg}</p>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3">
          <button id="spy-opts" onClick={() => setOpts((v) => !v)} aria-expanded={opts} className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
            Change dates <Icon.Chevron className={`h-4 w-4 transition ${opts ? "rotate-180" : ""}`} />
          </button>
          <button id="spy-helper-toggle" onClick={() => setHelper((v) => !v)} aria-expanded={helper || noDesktop} className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
            Read it in your own browser (free) <Icon.Chevron className={`h-4 w-4 transition ${helper || noDesktop ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div>
          {(helper || noDesktop) && (
            <div id="spy-helper" className="mt-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-[13px] leading-relaxed text-slate-600">The AdDoctor button reads an advertiser's ads straight from the Ad Library page you have open, images included, and sends them here for the analysis. Set it up once:</p>
              <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-700">
                <li className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">1.</span> Drag this to your bookmarks bar:
                  <a ref={helperLink} id="spy-bookmark" draggable onClick={(e) => { e.preventDefault(); notify("Drag the button to your bookmarks bar (Ctrl+Shift+B shows the bar)."); }} className="inline-flex cursor-grab items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-600/25"><Icon.Sparkle className="h-3.5 w-3.5" />AdDoctor</a>
                </li>
                <li><span className="font-semibold text-slate-900">2.</span> Open the advertiser in the <a href={libOk ? spyUrl(lib.id, country || lib.country, from, to) : "https://www.facebook.com/ads/library/"} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">Meta Ad Library</a>{libOk ? " (this link opens the one you pasted)" : ""}.</li>
                <li><span className="font-semibold text-slate-900">3.</span> Click the AdDoctor bookmark on that page. It scrolls through the ads, then opens your analysis here.</li>
              </ol>
            </div>
          )}
          {opts && (
            <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs font-semibold text-slate-700">From</span><input id="spy-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></label>
              <label className="block"><span className="text-xs font-semibold text-slate-700">To</span><input id="spy-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
            </div>
          )}
        </div>
      </section>

      {res && (
      <div id="spy-results" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-700 ring-1 ring-blue-100">{srcLabel} · {spyPlural(res.n, "ad")}</p>
          <button id="spy-copy" onClick={() => copy(reportText(), "Slide text copied")} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
            <Icon.Copy className="h-3.5 w-3.5" /> Copy slide text
          </button>
        </div>

        <SpySlide brand={state.brand} reports={state.reports} onRebuild={onRebuild} />

        {res.insights.length > 0 && (
          <section className="mt-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm" aria-label="What to do about it">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white"><Icon.Sparkle className="h-4 w-4" /></span>
              <h3 className="text-sm font-semibold text-slate-900">What this may mean for you <span className="font-normal text-slate-400">· from Claude</span></h3>
            </div>
            <ul className="mt-3.5 grid gap-x-8 gap-y-2.5 lg:grid-cols-2">
              {res.insights.map((b, i) => (
                <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-slate-600"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /><span>{b}</span></li>
              ))}
            </ul>
          </section>
        )}

        {res.report.length > 0 && (
          <div className="mt-8" id="spy-report">
            <h3 className="text-base font-semibold text-slate-900">Everything we noticed</h3>
            <p className="text-xs text-slate-500">Written by Claude from the ad text, dates and creatives. Ad libraries show what is running, not spend or results.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {res.report.map((s, i) => <SpySection key={i} s={{ title: s.title, bullets: s.bullets, tone: SPY_REPORT_TONE[i % SPY_REPORT_TONE.length], icon: "Target" }} />)}
            </div>
          </div>
        )}

        {res.creatives.length > 0 && (
          <div className="mt-8" id="spy-creatives">
            <h3 className="text-base font-semibold text-slate-900">Creatives Claude looked at</h3>
            <p className="text-xs text-slate-500">The images used by the most ads and the longest-running ones, with what Claude saw in each.</p>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {res.creatives.map((c, i) => (
                <figure key={i} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {c.img && <img src={c.img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="aspect-square w-full bg-slate-100 object-cover" />}
                  <figcaption className="p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{c.format} · {spyPlural(c.n, "ad")}</span>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{c.sees}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <button id="spy-detail" onClick={() => setDetail((d) => !d)} aria-expanded={detail} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600 hover:text-blue-700">
            Detailed breakdown <Icon.Chevron className={`h-4 w-4 transition ${detail ? "rotate-180" : ""}`} />
          </button>
          {detail && (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {res.sections.map((s) => <SpySection key={s.key} s={s} />)}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Ads analyzed</h3>
            <p className="text-xs text-slate-500">Each ad is tagged with its angle, product and promotions. Rebuild opens the closest template in the Studio.</p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1" role="group" aria-label="Sort ads">
            {[["days", "Longest live"], ["promo", "Promotions"], ["angle", "Angle"]].map(([id, l]) => (
              <button key={id} onClick={() => setSort(id)} aria-pressed={sort === id} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${sort === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((a) => <SpyAdCard key={a.id} ad={a} onRebuild={onRebuild} />)}
        </div>
      </div>
      )}
    </div>
  );
}

export { SPY_ANGLES, SPY_ANGLE, SPY_PROMOS, SPY_PRODUCT_RE, SPY_STRIP, spyClassify, spyPromos, spyProduct, spyTag, SPY_SAMPLE, SPY_MONTHS, SPY_NOISE, SPY_CTA, spyDates, spyDaysFrom, spyParse, spyShare, spyCount, spyPlural, spySummarize, spyReportText, SPY_MONTH, spySlide, SPY_COUNTRIES, spyParseLib, spyWindows, spyBrief, SPY_LIB_NOISE, SPY_LIB_CTA, spyParseLibraryText, spyCrawlText, SPY_SLIDE_RULES, spyWf, spyCompact, spyPlatformTitle, SpySlide, SPY_TONE, SPY_ICON, Rich, SpySection, SpyAdCard, SPY_AI_ERR, spyUrl, spyHalves, SpyView };
