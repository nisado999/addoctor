import { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { rrect } from "./asset";
import { copyText } from "./shared.js";
import { detectCategory } from "./analysis.js";
import { TEMPLATE_IMGS } from "./templateImgs.js";

/* ======================= Creative Synthesizer =======================
   A canvas ad renderer. The same drawing code paints the live preview,
   the variation thumbnails and the full-size PNG export, so what you see
   is what you download. All coordinates live in a 1080-wide design space. */

const VW = 1080;
const F_HEAD = '"Archivo", "Inter Tight", system-ui, sans-serif';
const F_BODY = '"Inter Tight", system-ui, sans-serif';
const F_HAND = '"Caveat", "Segoe Script", cursive';

const KIND_LAYOUT = {
  myth: "myth", stat: "hero", offer: "hero", restock: "hero", neon: "hero",
  split: "split", review: "review", reviews: "review", compare: "compare",
  checklist: "list", steps: "list", timeline: "list", quote: "quote",
  marker: "marker", receipt: "receipt", tweet: "tweet", ingredients: "ingr", stoplight: "stoplight",
  dm: "dm", press: "press", newspaper: "press", beforeafter: "ba", chart: "chart",
};

function mkTheme(from, to, hl, light) {
  return light
    ? { from, to, hl, ink: "#0f172a", muted: "rgba(15,23,42,.62)", panel: "rgba(15,23,42,.05)", line: "rgba(15,23,42,.18)", onHl: "#ffffff", light: true }
    : { from, to, hl, ink: "#ffffff", muted: "rgba(255,255,255,.72)", panel: "rgba(255,255,255,.09)", line: "rgba(255,255,255,.22)", onHl: "#0f172a", light: false };
}
const PALETTES = [
  mkTheme("#0f172a", "#1e3a8a", "#7dd3fc"),
  mkTheme("#042f2e", "#115e59", "#5eead4"),
  mkTheme("#2e1065", "#0f172a", "#e9d5ff"),
  mkTheme("#431407", "#1c1917", "#fdba74"),
  mkTheme("#022c22", "#064e3b", "#6ee7b7"),
  mkTheme("#ffffff", "#e2e8f0", "#2563eb", true),
];
function templateTheme(t) {
  const hex = t.art.bg.match(/#[0-9a-f]{6}/gi) || ["#0f172a", "#1e293b"];
  return mkTheme(hex[0], hex[hex.length - 1], t.art.hl);
}

const FRAMES = [
  { id: "direct", label: "Direct", fn: (d) => d },
  { id: "finally", label: "Finally", fn: (d) => "Finally: " + d },
  { id: "brand", label: "Brand-led", fn: (d, b) => (b ? b + ": " + d : "Meet the fix: " + d) },
  { id: "curious", label: "Curiosity", fn: (d, b) => (b ? "Why " + b + "? " + d : "Here is the difference: " + d) },
  { id: "bold", label: "Bold", fn: (d) => "Stop settling. " + d },
  { id: "meet", label: "Introduce", fn: (d, b) => (b ? "Meet " + b + ". " + d : "Meet the upgrade. " + d) },
  { id: "diff", label: "Difference", fn: (d, b) => (b ? "The " + b + " difference: " + d : "The difference: " + d) },
  { id: "proof", label: "Proof", fn: (d) => d + ". See for yourself." },
];
/* The four variation presets change the layout structure and the default hook angle.
   Whatever you type in the Main Headline is always used verbatim. */
const VARIANT_DEFS = [
  { layout: "vHero", label: "Hero + Proof Stack", angle: "Proof-led" },
  { layout: "vCompare", label: "Split Comparison", angle: "Contrast" },
  { layout: "vQuote", label: "Social Proof", angle: "Authority" },
  { layout: "vNodes", label: "Feature Callouts", angle: "Spec-led" },
];
const BASE_VARIANT = { seed: 0, layout: null, label: "Template layout", angle: "Original" };
function makeVariants(seed) {
  return VARIANT_DEFS.map((d) => ({ ...d, seed }));
}
const DEF_HEAD = {
  hero: ["Stop settling for less."],
  split: ["See the difference."],
  compare: ["The better choice, side by side."],
  list: ["Everything you need. Nothing you don't."],
  vHero: ["Stop settling for less.", "The upgrade you have waited for.", "Made for people who expect more.", "Quality you can feel."],
  vCompare: ["There is a better way.", "Not all brands are equal.", "Compare, then decide.", "The smarter switch."],
  vQuote: ["Finally, one that actually delivers.", "I wish I had switched sooner.", "Worth every penny.", "Better than I expected."],
  vNodes: ["Built to be better.", "Designed with intent.", "Details that matter.", "Made to last."],
};
const DEF_SUB = "Designed to outperform the rest.";
const DEF_REVIEWS = ["Finally, one that actually delivers.", "Better than the one I paid double for.", "Would buy again in a heartbeat."];

const clean = (s) => (s || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
function parseItems(s, max) {
  return (s || "").split(/[;,|•·+]/).map((x) => clean(x)).filter(Boolean).slice(0, max).map((x) => (x.length > 60 ? x.slice(0, 58).trim() + "…" : x));
}
function markupWords(str, upper) {
  const out = [];
  String(str).split("*").forEach((seg, i) => seg.split(/\s+/).filter(Boolean).forEach((w) => out.push({ w: upper ? w.toUpperCase() : w, hl: i % 2 === 1 })));
  return out;
}
function autoWords(str, upper) {
  const ws = String(str).split(/\s+/).filter(Boolean);
  const k = ws.length <= 3 ? 1 : 2;
  return ws.map((w, i) => ({ w: upper ? w.toUpperCase() : w, hl: i >= ws.length - k || /[\d%]/.test(w) }));
}

/* Layouts whose default headline or content is specific to the sample template.
   The download waits until you supply your own so sample claims never ship. */
const HEADLINE_REQUIRED = { receipt: 1, stoplight: 1, press: 1, ba: 1, chart: 1, review: 1, vQuote: 1 };
const DETAILS_REQUIRED = { myth: 1, quote: 1, review: 1, compare: 1, list: 1, marker: 1, receipt: 1, tweet: 1, ingr: 1, stoplight: 1, dm: 1, press: 1, ba: 1, chart: 1, vHero: 1 };
const okText = (s) => clean(s).length >= 5;

function parseReceipt(str) {
  const rows = String(str || "").split(/[;|]/).map((x) => x.trim()).filter(Boolean).slice(0, 4).map((x) => {
    const m = x.match(/^(.*?)\s*(\S*\d\S*)\s*(?:>|→|->|to)\s*(\S*\d\S*)$/);
    return m ? { label: clean(m[1]) || "Item", old: m[2], now: m[3] } : { label: clean(x), old: "", now: "" };
  });
  return rows;
}
function moneyNum(x) { const m = String(x).replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
function receiptTotals(rows) {
  if (!rows.length || rows.some((r) => !r.old || !r.now)) return null;
  const o = rows.map((r) => moneyNum(r.old)), n = rows.map((r) => moneyNum(r.now));
  if (o.some(isNaN) || n.some(isNaN)) return null;
  const sym = (rows[0].old.match(/^[^\d]*/) || [""])[0];
  const fmt = (v) => sym + (Math.round(v * 100) % 100 ? v.toFixed(2) : String(Math.round(v)));
  return [fmt(o.reduce((a, b) => a + b, 0)), fmt(n.reduce((a, b) => a + b, 0))];
}

function buildConfig(t, inputs, v) {
  const brand = inputs.brand.trim();
  const a = t.art;
  const baseLayout = KIND_LAYOUT[a.kind] || "hero";
  const layout = v && v.layout ? v.layout : baseLayout;
  const variant = !!(v && v.layout);
  const seed = (v && v.seed) || 0;
  let theme = templateTheme(t);

  /* Each input feeds exactly one place. Text under 5 characters falls back to the default copy. */
  const headOk = okText(inputs.headline), subOk = okText(inputs.subtitle), detOk = okText(inputs.hook);
  const details = detOk ? (inputs.hook || "").trim() : "";
  const cat = detectCategory(brand + " " + details);
  const noun = { skin: "serums", supp: "supplements", apparel: "brands", tech: "gadgets", food: "options", local: "providers", generic: "options" }[cat];

  let sampleItems = [];
  if (a.kind === "beforeafter") sampleItems = [a.before.metric, a.after.metric];
  else if (a.kind === "chart") sampleItems = [a.start[1] + " " + a.metric, a.end[1] + " " + a.metric];
  else if (a.rows) sampleItems = a.rows.map((r) => r[0]);
  else if (a.items) sampleItems = a.items.map((x) => (Array.isArray(x) ? x[0] : x));
  else if (a.points) sampleItems = a.points.map((p) => p[2]);
  const maxItems = { list: 4, ingr: 4, stoplight: 4, vNodes: 2, vCompare: 3, ba: 2, chart: 2, split: 3 }[layout] || 3;
  let items = detOk ? parseItems(details, maxItems) : (layout === "split" ? [] : sampleItems.slice(0, maxItems));
  if (layout === "vNodes" && !detOk) items = ["Premium materials", "Built to last"];
  if (layout === "vCompare" && !detOk) items = ["Premium quality", "Transparent pricing", "Proven design"];

  const sampleRevs = layout === "review" && a.items ? a.items.map((x) => x[0]) : layout === "review" ? [a.quote] : DEF_REVIEWS;
  const typedRevs = detOk ? details.split(/[|;]/).map((x) => clean(x)).filter(Boolean).slice(0, 3) : [];
  /* Review template keeps its 3 cards: what you type replaces them in order. Variations show only what you typed. */
  const reviews = !detOk ? sampleRevs.slice(0, 3) : layout === "review" ? sampleRevs.slice(0, 3).map((q, i) => typedRevs[i] || q) : typedRevs;

  const tplHead = markupWords(a.hook, true);
  const generic = ["hero", "split", "compare", "list", "vHero", "vCompare", "vNodes"].includes(layout);
  const defHeadText = generic ? DEF_HEAD[layout][seed % DEF_HEAD[layout].length] : "";
  let headWords = headOk ? autoWords(clean(inputs.headline), true) : generic ? autoWords(defHeadText, true) : tplHead;
  const quoteText = layout === "vQuote" ? (headOk ? clean(inputs.headline) : DEF_HEAD.vQuote[seed % 4]) : layout === "press" ? (detOk ? details : a.quote) : "";
  if (layout === "vQuote") headWords = [];

  const photo = !["split", "quote", "marker", "ba"].includes(layout);
  if (photo) theme = mkTheme(theme.light ? "#0f172a" : theme.from, theme.light ? "#1e3a8a" : theme.to, theme.light ? "#93c5fd" : theme.hl);
  if (layout === "marker") { theme = mkTheme("#fffdf0", "#fef3c7", "#facc15", true); theme.onHl = "#111827"; theme.ink = "#111827"; }
  if (variant && a.light) theme = mkTheme("#0f172a", "#1e3a8a", "#facc15");
  if (variant) theme = { ...theme, hl: theme.hl };

  const rows = layout === "receipt" ? (detOk ? parseReceipt(details) : a.rows.map((r) => ({ label: r[0], old: r[1], now: r[2] }))) : [];
  const badgeText = clean(inputs.badge);
  const primary = layout === "myth" ? (detOk ? details : a.fact) : layout === "quote" ? (detOk ? details : a.text) : "";
  return {
    t, layout, kind: a.kind, theme, brand, primary, headWords, items, reviews,
    img: inputs.img ? inputs.img.canvas : null, pos: inputs.pos || POS0, logo: inputs.logo ? inputs.logo.canvas : null, frame: null,
    noun, badge: layout === "press" ? "" : badgeText, pub: layout === "press" ? badgeText : "",
    sub: clean(inputs.sub), subtitle: subOk ? clean(inputs.subtitle) : DEF_SUB, pills: parseItems(inputs.pills, 6),
    pillLabel: layout === "hero" && a.kind === "restock" ? "Pick your size" : "", tall: t.type === "video", hasDetails: detOk,
    quoteText, rows, totals: layout === "receipt" ? receiptTotals(rows) : null,
    text: detOk ? details : a.text || "", note: detOk ? details : a.note || "", sent: detOk ? details : a.sent || "", recv: a.recv || "Wait, where did you get that??",
    oldWay: parseItems(inputs.oldway, 3), ba: { before: items[0] || "", after: items[1] || "" },
  };
}

/* ---- drawing primitives ---- */
function txt(ctx, s, x, y, o) {
  ctx.font = `${o.weight || 600} ${o.size}px ${o.family || F_BODY}`;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align || "left";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = (o.ls || 0) + "px";
  ctx.fillText(s, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
function wrapWords(ctx, words, maxW) {
  const lines = [[]];
  const sp = ctx.measureText(" ").width;
  let w = 0;
  words.forEach((wd) => {
    const ww = ctx.measureText(wd.w).width;
    const cur = lines[lines.length - 1];
    if (!cur.length) { cur.push(wd); w = ww; }
    else if (w + sp + ww > maxW) { lines.push([wd]); w = ww; }
    else { cur.push(wd); w += sp + ww; }
  });
  return lines;
}
function fitWords(ctx, words, o) {
  const lh = o.lh || 1.04;
  const fits = (lines) => { const sp = ctx.measureText(" ").width; return lines.every((l) => l.reduce((t, wd) => t + ctx.measureText(wd.w).width, 0) + sp * (l.length - 1) <= o.maxW + 1); };
  const ok = (lines, size) => lines.length <= (o.maxLines || 99) && (!o.maxH || lines.length * size * lh <= o.maxH) && fits(lines);
  let lines, size;
  for (size = o.max; size >= o.min; size -= 2) {
    ctx.font = `${o.weight} ${size}px ${o.family}`;
    lines = wrapWords(ctx, words, o.maxW);
    if (ok(lines, size)) return { size, lines, lh };
  }
  size = o.min;
  ctx.font = `${o.weight} ${size}px ${o.family}`;
  lines = wrapWords(ctx, words, o.maxW);
  const cap = Math.max(1, Math.min(o.maxLines || 99, o.maxH ? Math.floor(o.maxH / (size * lh)) : 99));
  if (lines.length > cap) { lines = lines.slice(0, cap); lines[cap - 1] = lines[cap - 1].concat([{ w: "…" }]); }
  return { size, lines, lh };
}
function drawLines(ctx, f, x, y, o) {
  ctx.font = `${o.weight} ${f.size}px ${o.family}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const sp = ctx.measureText(" ").width;
  f.lines.forEach((line, i) => {
    const lw = line.reduce((s, wd) => s + ctx.measureText(wd.w).width, 0) + sp * (line.length - 1);
    let cx = o.align === "center" ? x - lw / 2 : x;
    const by = y + i * f.size * f.lh + f.size * 0.84;
    line.forEach((wd) => {
      ctx.fillStyle = wd.hl && o.hl ? o.hl : o.color;
      ctx.fillText(wd.w, cx, by);
      cx += ctx.measureText(wd.w).width + sp;
    });
  });
  return y + f.lines.length * f.size * f.lh;
}
function plainWords(s) { return String(s).split(/\s+/).filter(Boolean).map((w) => ({ w })); }

const POS0 = { x: 0, y: 0, s: 1 };
/* The photo is drawn slightly larger than the frame at 100%, so it can be moved left, right, up and down without exposing an empty edge. */
const OVERSCAN = 1.3;
/* Source window for a cover-fit photo. pos.x / pos.y are pan offsets in frame
   widths / heights; pos.s is zoom (1 to 2). Pan is clamped so the photo always
   fills the frame. */
function coverWin(src, w, h, pos) {
  const p = pos || POS0;
  const sr = src.width / src.height, dr = w / h;
  let sw, sh;
  if (sr > dr) { sh = src.height; sw = sh * dr; } else { sw = src.width; sh = sw / dr; }
  sw /= p.s * OVERSCAN; sh /= p.s * OVERSCAN;
  const mx = (src.width - sw) / 2 / sw, my = (src.height - sh) / 2 / sh;
  const x = Math.max(-mx, Math.min(mx, p.x)), y = Math.max(-my, Math.min(my, p.y));
  return { sw, sh, sx: (src.width - sw) / 2 - x * sw, sy: (src.height - sh) / 2 - y * sh, x, y, mx, my };
}
function drawCover(ctx, src, x, y, w, h, r, pos, c) {
  if (c) c.frame = { x, y, w, h };
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  ctx.clip();
  const k = coverWin(src, w, h, pos);
  ctx.drawImage(src, k.sx, k.sy, k.sw, k.sh, x, y, w, h);
  ctx.restore();
}
function drawSlot(ctx, c, x, y, w, h, r) {
  const th = c.theme;
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = th.panel;
  ctx.fill();
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = th.line;
  rrect(ctx, x + 2, y + 2, w - 4, h - 4, r);
  ctx.stroke();
  ctx.setLineDash([]);
  const cx = x + w / 2, cy = y + h / 2 - 22;
  ctx.strokeStyle = th.muted;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  rrect(ctx, cx - 62, cy - 48, 124, 96, 18);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - 24, cy - 12, 12, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 54, cy + 40); ctx.lineTo(cx - 10, cy + 6); ctx.lineTo(cx + 14, cy + 28); ctx.lineTo(cx + 30, cy + 14); ctx.lineTo(cx + 58, cy + 40); ctx.stroke();
  txt(ctx, "Your product photo", cx, cy + 108, { size: 34, weight: 600, color: th.muted, align: "center" });
  ctx.restore();
}
function badgeIcon(ctx, cx, cy, r, color, kind) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = r * 0.24;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "check") { ctx.moveTo(cx - r * 0.42, cy + r * 0.02); ctx.lineTo(cx - r * 0.1, cy + r * 0.36); ctx.lineTo(cx + r * 0.46, cy - r * 0.32); }
  else { ctx.moveTo(cx - r * 0.34, cy - r * 0.34); ctx.lineTo(cx + r * 0.34, cy + r * 0.34); ctx.moveTo(cx + r * 0.34, cy - r * 0.34); ctx.lineTo(cx - r * 0.34, cy + r * 0.34); }
  ctx.stroke();
  ctx.restore();
}
function drawStars(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  for (let s = 0; s < 5; s++) {
    const cx = x + s * (r * 2.3) + r;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(ang) * rad, y + r + Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }
}
/* Top-left brand header: [logo or initial pill] + brand name. One mark only. */
function drawBrand(ctx, c) {
  if (!c.brand && !c.logo) return;
  const th = c.theme, y = 92, h = 72;
  let x = 84;
  if (c.logo) {
    const k = Math.min((h - 16) / c.logo.height, 260 / c.logo.width);
    const w = c.logo.width * k, lh = c.logo.height * k;
    ctx.fillStyle = "rgba(255,255,255,.94)"; rrect(ctx, x, y, w + 24, h, 18); ctx.fill();
    ctx.drawImage(c.logo, x + 12, y + (h - lh) / 2, w, lh);
    x += w + 24 + 22;
  } else {
    ctx.fillStyle = th.hl; rrect(ctx, x, y, h, h, 22); ctx.fill();
    txt(ctx, c.brand.trim().charAt(0).toUpperCase(), x + h / 2, y + h / 2 + 13, { size: 40, weight: 900, family: F_HEAD, color: th.onHl, align: "center" });
    x += h + 22;
  }
  if (c.brand) txt(ctx, c.brand.toUpperCase().slice(0, 24), x, y + h / 2 + 11, { size: 32, weight: 800, family: F_HEAD, color: th.ink, ls: 4 });
}
function drawBackground(ctx, c, H) {
  const th = c.theme;
  const g = ctx.createLinearGradient(0, 0, VW * 0.6, H);
  g.addColorStop(0, th.from); g.addColorStop(1, th.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, H);
  const r = ctx.createRadialGradient(VW * 0.85, H * 0.12, 20, VW * 0.85, H * 0.12, VW * 0.8);
  r.addColorStop(0, th.light ? "rgba(37,99,235,.10)" : "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, VW, H);
}

/* ---- layouts ----
   No painted buttons: Meta penalizes non-functional UI on static images, so the
   creative carries a headline, proof and overlay badges only. */
const P = 84;
const BOT = 120;
const HEAD = { weight: 900, family: F_HEAD };
const PHOTO_LAYOUTS = { hero: 1 };

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/* Photo fills the creative and melts into the theme gradient with a vignette. */
function photoBg(ctx, c, H) {
  if (c.img) drawCover(ctx, c.img, 0, 0, VW, H, 0, c.pos, c);
  else drawSlot(ctx, c, P, Math.round(H * 0.3), VW - 2 * P, Math.round(H * 0.4), 48);
  /* Scrim: black/85 at the top, black/30 through the middle, black/90 at the bottom.
     Keeps white type and badges legible on any product photo. */
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,.85)"); g.addColorStop(0.5, "rgba(0,0,0,.30)"); g.addColorStop(1, "rgba(0,0,0,.90)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, H);
  const v = ctx.createRadialGradient(VW / 2, H / 2, VW * 0.55, VW / 2, H / 2, H * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = v; ctx.fillRect(0, 0, VW, H);
}
/* Headline: extra-bold, uppercase, tight tracking, soft drop shadow. Optional condensed width. */
function headline(ctx, c, y, o) {
  const th = c.theme, k = o.cond || 1, wt = o.weight || 900;
  ctx.save();
  if ("letterSpacing" in ctx) ctx.letterSpacing = (o.ls == null ? -1 : o.ls) + "px";
  const f = fitWords(ctx, c.headWords, { weight: wt, family: F_HEAD, maxW: (o.maxW || VW - 2 * P) / k, maxLines: o.maxLines || 3, maxH: o.maxH ? o.maxH / k : undefined, max: (o.max || 104), min: o.min || 50, lh: o.lh || 1.02 });
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  ctx.scale(k, 1);
  let bottom = drawLines(ctx, f, (o.x == null ? P : o.x) / k, y, { weight: wt, family: F_HEAD, color: th.ink, hl: th.hl });
  ctx.restore();
  if (o.sub !== false && c.subtitle) bottom = drawSubtitle(ctx, c, bottom + 14, o);
  return bottom;
}
/* Secondary accent line in the theme color. Returns the y below it. */
function drawSubtitle(ctx, c, y, o) {
  ctx.save();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  const f = fitWords(ctx, plainWords(c.subtitle.toUpperCase()), { weight: 800, family: F_HEAD, maxW: (o && o.maxW) || VW - 2 * P, maxLines: 2, max: 36, min: 24, lh: 1.2 });
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  const b = drawLines(ctx, f, (o && o.x) == null ? P : o.x, y, { weight: 800, family: F_HEAD, color: c.theme.hl });
  ctx.restore();
  return b;
}
/* Tilted badge pill plus a quiet sub-badge line. Returns the y below them. */
function drawBadges(ctx, c, x, y, maxW) {
  const th = c.theme;
  let cy = y;
  if (c.badge) {
    ctx.font = `900 46px ${F_HEAD}`;
    const label = c.badge.toUpperCase();
    const w = Math.min(maxW || 800, ctx.measureText(label).width + 88);
    ctx.save();
    ctx.translate(x + w / 2, cy + 50); ctx.rotate(-0.045);
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = th.hl; rrect(ctx, -w / 2, -50, w, 100, 50); ctx.fill();
    ctx.shadowColor = "transparent";
    txt(ctx, label, 0, 16, { size: 46, weight: 900, family: F_HEAD, color: th.onHl, align: "center", ls: 2 });
    ctx.restore();
    cy += 128;
  }
  if (c.sub) {
    ctx.font = `700 34px ${F_BODY}`;
    const w = Math.min(maxW || 800, ctx.measureText(c.sub).width + 64);
    ctx.fillStyle = "rgba(2,6,23,.55)"; rrect(ctx, x, cy, w, 68, 34); ctx.fill();
    ctx.strokeStyle = rgba(th.hl, 0.7); ctx.lineWidth = 3; rrect(ctx, x, cy, w, 68, 34); ctx.stroke();
    txt(ctx, c.sub, x + 32, cy + 46, { size: 34, weight: 700, color: "#ffffff" });
    cy += 92;
  }
  return cy;
}
/* Option pills (sizes, perks). Draws upward from bottomY. */
function drawPillsRow(ctx, c, bottomY) {
  if (!c.pills.length) return bottomY;
  const th = c.theme, gap = 16, h = 84;
  ctx.font = `700 38px ${F_BODY}`;
  const rows = [[]]; let rw = 0;
  c.pills.forEach((t2) => {
    const w = Math.max(96, ctx.measureText(t2).width + 60);
    if (rw && rw + gap + w > VW - 2 * P) { rows.push([]); rw = 0; }
    rows[rows.length - 1].push({ t: t2, w }); rw += (rw ? gap : 0) + w;
  });
  let y = bottomY - rows.length * (h + gap) + gap;
  rows.forEach((row) => {
    let x = P;
    row.forEach((k) => {
      ctx.fillStyle = "rgba(255,255,255,.14)"; rrect(ctx, x, y, k.w, h, 42); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 3; rrect(ctx, x, y, k.w, h, 42); ctx.stroke();
      txt(ctx, k.t, x + k.w / 2, y + 57, { size: 38, weight: 700, color: "#ffffff", align: "center" });
      x += k.w + gap;
    });
    y += h + gap;
  });
  const top = bottomY - rows.length * (h + gap) + gap;
  if (c.pillLabel) { txt(ctx, c.pillLabel.toUpperCase(), P, top - 26, { size: 28, weight: 800, family: F_HEAD, color: "rgba(255,255,255,.78)", ls: 5 }); return top - 70; }
  return top - 24;
}

function layoutHero(ctx, c, H) {
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 210, { maxLines: c.tall ? 4 : 3, max: c.tall ? 116 : 104, min: 56 });
  drawBadges(ctx, c, P, hb + 34, 760);
  drawPillsRow(ctx, c, H - BOT);
}

function layoutSplit(ctx, c, H) {
  const th = c.theme, ix = 560;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(ix + 120, 0); ctx.lineTo(VW, 0); ctx.lineTo(VW, H); ctx.lineTo(ix - 40, H); ctx.closePath(); ctx.clip();
  if (c.img) drawCover(ctx, c.img, ix - 40, 0, VW - ix + 40, H, 0, c.pos, c);
  else { ctx.fillStyle = th.panel; ctx.fillRect(ix - 40, 0, VW - ix + 40, H); drawSlot(ctx, c, ix + 60, H / 2 - 170, VW - ix - 110, 340, 30); }
  ctx.restore();
  ctx.save(); ctx.strokeStyle = th.hl; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(ix + 120, 0); ctx.lineTo(ix - 40, H); ctx.stroke(); ctx.restore();
  const maxW = 370;
  const itemsH = c.items.length > 0 ? c.items.length * 96 : 0;
  const badgeH = (c.badge ? 128 : 0) + (c.sub ? 92 : 0);
  let y = headline(ctx, c, 210, { maxW, maxH: H - 210 - BOT - itemsH - badgeH - 120, max: 80, min: 40, maxLines: 5 }) + 30;
  y = drawBadges(ctx, c, P, y, maxW + 60);
  if (itemsH) {
    c.items.forEach((it) => {
      badgeIcon(ctx, P + 24, y + 30, 24, "#10b981", "check");
      const lines = fitWords(ctx, plainWords(it), { weight: 600, family: F_BODY, maxW: maxW - 70, maxLines: 2, max: 34, min: 26, lh: 1.15 });
      drawLines(ctx, lines, P + 66, y + 6, { weight: 600, family: F_BODY, color: th.ink });
      y += 96;
    });
  }
}

function layoutMyth(ctx, c, H) {
  const W = VW - 2 * P, th = c.theme;
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 200, { maxLines: 2, max: 124, min: 70 });
  drawBadges(ctx, c, P, hb + 30, 760);
  const factText = (c.brand && c.hasDetails ? c.brand + ": " : "") + c.primary;
  const mkP = (text, max) => fitWords(ctx, plainWords(text), { weight: 700, family: F_BODY, maxW: W - 170, maxLines: 3, max, min: 28, lh: 1.15 });
  const mf = mkP("All " + c.noun + " are the same", 44), ff = mkP(factText, 46);
  const hOf = (f) => Math.max(150, 70 + f.lines.length * f.size * f.lh + 34);
  const mh = hOf(mf), fh = hOf(ff);
  let y = H - BOT - mh - fh - 22;
  const panel = (label, f, h, fill, stroke, kind) => {
    ctx.fillStyle = "rgba(2,6,23,.66)"; rrect(ctx, P, y, W, h, 36); ctx.fill();
    ctx.fillStyle = fill; rrect(ctx, P, y, W, h, 36); ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 3; rrect(ctx, P, y, W, h, 36); ctx.stroke();
    badgeIcon(ctx, P + 62, y + h / 2, 32, kind === "check" ? "#10b981" : "#f43f5e", kind);
    txt(ctx, label, P + 118, y + 50, { size: 26, weight: 800, family: F_HEAD, color: th.muted, ls: 5 });
    drawLines(ctx, f, P + 118, y + 64, { weight: 700, family: F_BODY, color: "#ffffff" });
    y += h + 22;
  };
  panel("MYTH", mf, mh, "rgba(244,63,94,.2)", "rgba(251,113,133,.55)", "cross");
  panel("FACT", ff, fh, "rgba(16,185,129,.22)", "rgba(52,211,153,.6)", "check");
}

function layoutReview(ctx, c, H) {
  const W = VW - 2 * P;
  photoBg(ctx, c, H);
  const art = c.t.art;
  const quotes = c.reviews.slice(0, 3);
  const bw = W - 60, gap = 22, padX = 44;
  const cards = quotes.map((qt) => {
    const q = fitWords(ctx, plainWords("“" + qt + "”"), { weight: 700, family: F_BODY, maxW: bw - padX * 2, maxLines: 3, max: c.tall ? 46 : 40, min: 26, lh: 1.22 });
    return { q, h: 36 + 48 + 22 + q.lines.length * q.size * q.lh + 34 };
  });
  const total = cards.reduce((s2, k) => s2 + k.h, 0) + gap * (cards.length - 1);
  let y = H - BOT - total;
  const stackTop = y - (cards.length === 1 ? 60 : 0);
  const badgeH = (c.badge ? 128 : 0) + (c.sub ? 92 : 0);
  const hb = headline(ctx, c, 210, { maxLines: 3, maxH: stackTop - 210 - badgeH - 40 - 60, max: c.tall ? 112 : 96, min: 44 });
  drawBadges(ctx, c, P, hb + 30, 760);
  if (cards.length === 1) {
    [2, 1].forEach((k) => { ctx.save(); ctx.globalAlpha = 0.16 * (3 - k); ctx.fillStyle = "#ffffff"; rrect(ctx, P + 30 + k * 18, y - k * 26, bw - k * 36, cards[0].h, 36); ctx.fill(); ctx.restore(); });
  }
  cards.forEach((k, i) => {
    const x = P + (i % 2 === 0 ? 0 : 60);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 44; ctx.shadowOffsetY = 16;
    ctx.fillStyle = "#ffffff"; rrect(ctx, x, y, bw, k.h, 36); ctx.fill(); ctx.restore();
    drawStars(ctx, x + padX, y + 34, 21, "#f59e0b");
    drawLines(ctx, k.q, x + padX, y + 34 + 42 + 22, { weight: 700, family: F_BODY, color: "#0f172a" });
    y += k.h + gap;
  });
}

function layoutCompare(ctx, c, H) {
  const th = c.theme, W = VW - 2 * P;
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 200, { maxLines: c.tall ? 3 : 2, max: 100, min: 54 });
  drawBadges(ctx, c, P, hb + 30, 760);
  const rows = c.items.length ? c.items : ["Your key difference"];
  const rowH = c.tall ? 96 : 76, headH = 64;
  const tableH = headH + rows.length * rowH + 30;
  const tTop = H - BOT - tableH;
  ctx.fillStyle = "rgba(2,6,23,.68)"; rrect(ctx, P, tTop, W, tableH, 36); ctx.fill();
  ctx.strokeStyle = th.line; ctx.lineWidth = 3; rrect(ctx, P, tTop, W, tableH, 36); ctx.stroke();
  const c1 = P + 560 + 40, c2 = P + 560 + 40 + 180;
  txt(ctx, (c.brand && c.brand.length <= 9 ? c.brand.toUpperCase() : "US"), c1, tTop + 44, { size: 26, weight: 800, family: F_HEAD, color: th.hl, ls: 3, align: "center" });
  txt(ctx, "OTHERS", c2, tTop + 44, { size: 26, weight: 800, family: F_HEAD, color: th.muted, ls: 3, align: "center" });
  rows.forEach((r, i) => {
    const cy = tTop + headH + i * rowH + rowH / 2;
    if (i) { ctx.strokeStyle = th.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P + 32, cy - rowH / 2); ctx.lineTo(P + W - 32, cy - rowH / 2); ctx.stroke(); }
    const lf = fitWords(ctx, plainWords(r), { weight: 700, family: F_BODY, maxW: 470, maxLines: 2, max: 36, min: 24, lh: 1.12 });
    drawLines(ctx, lf, P + 40, cy - (lf.lines.length * lf.size * lf.lh) / 2, { weight: 700, family: F_BODY, color: "#ffffff" });
    badgeIcon(ctx, c1, cy, 26, "#10b981", "check");
    badgeIcon(ctx, c2, cy, 26, "#f43f5e", "cross");
  });
}

function layoutList(ctx, c, H) {
  const th = c.theme, W = VW - 2 * P;
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 210, { maxLines: 3, max: 100, min: 54 });
  drawBadges(ctx, c, P, hb + 30, 760);
  const items = c.items.length ? c.items : ["Add your benefits, separated by commas"];
  const rowH = 112, pad = 26;
  const panelH = items.length * rowH + pad * 2;
  const top = H - BOT - panelH;
  ctx.fillStyle = "rgba(2,6,23,.66)"; rrect(ctx, P, top, W, panelH, 36); ctx.fill();
  ctx.strokeStyle = th.line; ctx.lineWidth = 3; rrect(ctx, P, top, W, panelH, 36); ctx.stroke();
  items.forEach((it, i) => {
    const cy = top + pad + i * rowH + rowH / 2;
    badgeIcon(ctx, P + 68, cy, 26, "#10b981", "check");
    const lf = fitWords(ctx, plainWords(it), { weight: 700, family: F_BODY, maxW: W - 170, maxLines: 2, maxH: rowH - 12, max: 42, min: 26, lh: 1.14 });
    drawLines(ctx, lf, P + 120, cy - (lf.lines.length * lf.size * lf.lh) / 2, { weight: 700, family: F_BODY, color: "#ffffff" });
  });
}

function layoutQuote(ctx, c, H) {
  const th = c.theme, W = VW - 2 * P;
  let bottom = headline(ctx, c, 200, { maxLines: 2, max: 96, min: 58 });
  bottom = drawBadges(ctx, c, P, bottom + 24, 760) - 30;
  const pTop = bottom + 60, pH = Math.round(H * 0.34), pW = W - 40;
  ctx.save();
  ctx.translate(P + 20 + pW / 2, pTop + pH / 2); ctx.rotate(-0.028);
  ctx.shadowColor = "rgba(0,0,0,.38)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#fffdf7"; rrect(ctx, -pW / 2, -pH / 2, pW, pH, 16); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = th.light ? "rgba(37,99,235,.35)" : "rgba(110,231,183,.75)"; ctx.fillRect(-90, -pH / 2 - 26, 180, 52);
  const nf = fitWords(ctx, plainWords(c.primary), { weight: 600, family: F_HAND, maxW: pW - 110, maxH: pH - 150, max: 84, min: 46, lh: 1.08 });
  drawLines(ctx, nf, -pW / 2 + 55, -pH / 2 + 60, { weight: 600, family: F_HAND, color: "#1e293b" });
  if (c.brand) txt(ctx, "— " + c.brand, -pW / 2 + 55, pH / 2 - 40, { size: 58, weight: 600, family: F_HAND, color: "#047857" });
  ctx.restore();
  const s = Math.min(c.tall ? 400 : 330, H - BOT - (pTop + pH) + 40);
  ctx.save();
  ctx.translate(VW - P - s / 2 - 10, pTop + pH + s / 2 - 60); ctx.rotate(0.06);
  ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#ffffff"; rrect(ctx, -s / 2 - 20, -s / 2 - 20, s + 40, s + 66, 10); ctx.fill();
  ctx.shadowColor = "transparent";
  if (c.img) { drawCover(ctx, c.img, -s / 2, -s / 2, s, s, 4, c.pos); c.frame = { x: VW - P - s - 10, y: pTop + pH - 60, w: s, h: s }; }
  else { ctx.fillStyle = "#e2e8f0"; ctx.fillRect(-s / 2, -s / 2, s, s); txt(ctx, "Your product photo", 0, 10, { size: 30, weight: 600, color: "#64748b", align: "center" }); }
  ctx.restore();
}


/* ============================ New layouts ============================ */
function topShade(ctx, c, H, endY, a0) {
  const g = ctx.createLinearGradient(0, 0, 0, endY);
  g.addColorStop(0, rgba(c.theme.from, a0 || 0.92)); g.addColorStop(1, rgba(c.theme.from, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, endY);
}
function darkPanel(ctx, c, x, y, w, h, r, a0) {
  ctx.fillStyle = `rgba(2,6,23,${a0 || 0.68})`; rrect(ctx, x, y, w, h, r); ctx.fill();
  ctx.strokeStyle = c.theme.line; ctx.lineWidth = 3; rrect(ctx, x, y, w, h, r); ctx.stroke();
}
function fitOne(ctx, str, o) { return fitWords(ctx, plainWords(str), o); }

/* Pointer pills that float around the product. slots: {side, y, tx, ty} */
function drawCallouts(ctx, c, items, slots, numbered) {
  const th = c.theme;
  items.slice(0, slots.length).forEach((it, i) => {
    const sl = slots[i];
    const f = fitOne(ctx, it, { weight: 700, family: F_BODY, maxW: 390, maxLines: 2, max: 38, min: 26, lh: 1.1 });
    ctx.font = `700 ${f.size}px ${F_BODY}`;
    const tw = Math.max(...f.lines.map((l) => l.reduce((t2, wd) => t2 + ctx.measureText(wd.w).width, 0) + ctx.measureText(" ").width * (l.length - 1)));
    const lead = numbered ? 78 : 50;
    const w = Math.min(500, tw + lead + 40), h = Math.max(96, f.lines.length * f.size * f.lh + 44);
    const x = sl.side === "L" ? P : VW - P - w, y = sl.y;
    const ex = sl.side === "L" ? x + w : x, ey = y + h / 2;
    ctx.save();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sl.tx, sl.ty); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = th.hl; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(sl.tx, sl.ty, 17, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    ctx.fillStyle = "#ffffff"; rrect(ctx, x, y, w, h, h / 2 > 60 ? 48 : h / 2); ctx.fill();
    ctx.restore();
    if (numbered) {
      ctx.fillStyle = th.hl; ctx.beginPath(); ctx.arc(x + 44, y + h / 2, 26, 0, 7); ctx.fill();
      txt(ctx, String(i + 1), x + 44, y + h / 2 + 12, { size: 34, weight: 900, family: F_HEAD, color: th.onHl, align: "center" });
    } else { ctx.fillStyle = "#2563eb"; ctx.beginPath(); ctx.arc(x + 32, y + h / 2, 11, 0, 7); ctx.fill(); }
    drawLines(ctx, f, x + lead, y + (h - f.lines.length * f.size * f.lh) / 2, { weight: 700, family: F_BODY, color: "#0f172a" });
  });
}
const NODE_SLOTS = (H) => [
  { side: "L", y: H * 0.36, tx: VW * 0.44, ty: H * 0.43 },
  { side: "R", y: H * 0.5, tx: VW * 0.58, ty: H * 0.55 },
  { side: "L", y: H * 0.64, tx: VW * 0.45, ty: H * 0.68 },
  { side: "R", y: H * 0.74, tx: VW * 0.6, ty: H * 0.72 },
];

/* Frosted glass: blurred copy of the photo clipped to the shape, then a tint and hairline border. */
function glass(ctx, c, x, y, w, h, r, tint, blur, border) {
  ctx.save();
  rrect(ctx, x, y, w, h, r); ctx.clip();
  if (c.img && "filter" in ctx) {
    const k = ctx.getTransform().a;
    ctx.filter = `blur(${Math.round(blur * k)}px)`;
    const src = c.img, win = coverWin(src, VW, c.tall ? 1920 : 1350, c.pos);
    ctx.drawImage(src, win.sx, win.sy, win.sw, win.sh, -40, -40, VW + 80, (c.tall ? 1920 : 1350) + 80);
    ctx.filter = "none";
  }
  ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = border || "rgba(255,255,255,.14)"; ctx.lineWidth = 2.5; rrect(ctx, x, y, w, h, r); ctx.stroke();
}
function verifiedPill(ctx, x, y, label, size) {
  ctx.font = `800 ${size}px ${F_HEAD}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  const w = ctx.measureText(label).width + size * 2.3;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.fillStyle = "rgba(16,185,129,.2)"; rrect(ctx, x, y, w, size * 1.9, size * 0.95); ctx.fill();
  ctx.strokeStyle = "rgba(52,211,153,.7)"; ctx.lineWidth = 2; rrect(ctx, x, y, w, size * 1.9, size * 0.95); ctx.stroke();
  badgeIcon(ctx, x + size * 0.95, y + size * 0.95, size * 0.55, "#10b981", "check");
  txt(ctx, label, x + size * 1.75, y + size * 1.3, { size, weight: 800, family: F_HEAD, color: "#6ee7b7", ls: 2 });
  return w;
}

/* Variation 1: Hero + Proof Stack
   brand pill and condensed 2-line headline on top, product in the middle, two review cards below */
function layoutVHero(ctx, c, H) {
  const W = VW - 2 * P;
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 2, max: c.tall ? 128 : 112, min: 60, cond: 0.86 });
  const revs = c.reviews.slice(0, 2);
  const padX = 38, gap = 20, bottom = 72;
  const cards = revs.map((q) => {
    const f = fitOne(ctx, "“" + q + "”", { weight: 800, family: F_BODY, maxW: W - padX * 2, maxLines: 2, max: 42, min: 28, lh: 1.2 });
    return { f, h: 30 + 44 + 18 + f.lines.length * f.size * f.lh + 30 };
  });
  const total = cards.reduce((t, k) => t + k.h, 0) + gap * (cards.length - 1);
  let y = H - bottom - total;
  cards.forEach((k) => {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = "rgba(15,23,42,.92)"; rrect(ctx, P, y, W, k.h, 34); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2.5; rrect(ctx, P, y, W, k.h, 34); ctx.stroke();
    drawStars(ctx, P + padX, y + 30, 21, "#fbbf24");
    verifiedPill(ctx, P + W - padX - 268, y + 22, "VERIFIED BUYER", 21);
    drawLines(ctx, k.f, P + padX, y + 30 + 44 + 16, { weight: 800, family: F_BODY, color: "#ffffff" });
    y += k.h + gap;
  });
}

/* Variation 2: Split Comparison
   top 55%: hook and product; bottom 45%: frosted comparison card */
function layoutVCompare(ctx, c, H) {
  const W = VW - 2 * P, yS = Math.round(H * 0.55);
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 3, maxH: yS - 200 - 40, max: 100, min: 48 });
  const n = Math.max(1, Math.min(3, c.items.length));
  const news = c.items.slice(0, n);
  const defOld = ["Generic quality", "Hidden extras", "Guesswork"];
  const olds = [0, 1, 2].slice(0, n).map((i) => c.oldWay[i] || defOld[i]);
  const cy0 = yS + 4, ch = H - 64 - cy0;
  glass(ctx, c, P, cy0, W, ch, 34, "rgba(15,23,42,.9)", 18, "rgba(255,255,255,.12)");
  const pad = 34, colW = (W - pad * 2 - 30) / 2, xL = P + pad, xR = P + pad + colW + 30;
  ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(P + W / 2, cy0 + 30); ctx.lineTo(P + W / 2, cy0 + ch - 30); ctx.stroke();
  badgeIcon(ctx, xL + 20, cy0 + 56, 20, "#ef4444", "cross");
  txt(ctx, "OTHER BRANDS", xL + 52, cy0 + 66, { size: 28, weight: 900, family: F_HEAD, color: "rgba(255,255,255,.55)", ls: 3 });
  badgeIcon(ctx, xR + 20, cy0 + 56, 20, "#10b981", "check");
  txt(ctx, "OUR DIFFERENCE", xR + 52, cy0 + 66, { size: 28, weight: 900, family: F_HEAD, color: "#34d399", ls: 3 });
  const top = cy0 + 110, rowH = (cy0 + ch - 26 - top) / n;
  for (let i = 0; i < n; i++) {
    const cy = top + i * rowH + rowH / 2;
    if (i) { ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.moveTo(xL, cy - rowH / 2); ctx.lineTo(xL + 2 * colW + 30, cy - rowH / 2); ctx.stroke(); }
    badgeIcon(ctx, xL + 18, cy, 18, "#ef4444", "cross");
    const fo = fitOne(ctx, olds[i], { weight: 600, family: F_BODY, maxW: colW - 60, maxLines: 2, maxH: rowH - 16, max: 34, min: 22, lh: 1.12 });
    drawLines(ctx, fo, xL + 50, cy - (fo.lines.length * fo.size * fo.lh) / 2, { weight: 600, family: F_BODY, color: "rgba(255,255,255,.5)" });
    badgeIcon(ctx, xR + 18, cy, 18, "#10b981", "check");
    const fn = fitOne(ctx, news[i], { weight: 800, family: F_BODY, maxW: colW - 60, maxLines: 2, maxH: rowH - 16, max: 36, min: 22, lh: 1.12 });
    drawLines(ctx, fn, xR + 50, cy - (fn.lines.length * fn.size * fn.lh) / 2, { weight: 800, family: F_BODY, color: "#ffffff" });
  }
}

/* Variation 3: Social Proof / High Authority
   gold stars, editorial quotation marks around the hook, product hero, verified pill */
function layoutVQuote(ctx, c, H) {
  const W = VW - 2 * P, th = c.theme;
  photoBg(ctx, c, H);
  drawStars(ctx, P, 196, 40, "#fbbf24");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  txt(ctx, "“", P - 8, 196 + 80 + 230, { size: 340, weight: 900, family: "Georgia, serif", color: th.hl });
  ctx.restore();
  const f = (() => { ctx.save(); if ("letterSpacing" in ctx) ctx.letterSpacing = "-1px"; const r = fitWords(ctx, markupWords(c.quoteText, true), { weight: 900, family: F_HEAD, maxW: W, maxLines: 4, max: c.tall ? 100 : 88, min: 46, lh: 1.04 }); ctx.restore(); return r; })();
  ctx.save();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "-1px";
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  const qy = 196 + 80 + 128;
  const qb = drawLines(ctx, f, P, qy, { weight: 900, family: F_HEAD, color: "#ffffff" });
  ctx.restore();
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
  txt(ctx, "”", VW - P, qb + 170, { size: 340, weight: 900, family: "Georgia, serif", color: th.hl, align: "right" });
  ctx.restore();
  drawSubtitle(ctx, c, qb + 30, { maxW: W - 260 });
  const label = (c.sub || "VERIFIED PURCHASE · 30-DAY TRIAL").toUpperCase();
  ctx.font = `800 30px ${F_HEAD}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  const lw = ctx.measureText(label).width + 130;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  const px = (VW - lw) / 2, py = H - 72 - 84;
  glass(ctx, c, px, py, lw, 84, 42, "rgba(2,6,23,.72)", 14, rgba(th.hl, 0.6));
  badgeIcon(ctx, px + 48, py + 42, 20, "#10b981", "check");
  txt(ctx, label, px + 82, py + 53, { size: 30, weight: 800, family: F_HEAD, color: "#ffffff", ls: 3 });
}

/* Variation 4: Feature Callouts
   minimal headline, product hero, two glass chips tied to the product by thin lines */
function layoutVNodes(ctx, c, H) {
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 2, max: 72, min: 44, weight: 800 });
  const chips = (c.items.length ? c.items : ["Premium materials", "Built to last"]).slice(0, 2);
  const slots = [
    { side: "L", y: H * 0.43, tx: VW * 0.44, ty: H * 0.5 },
    { side: "R", y: H * 0.6, tx: VW * 0.57, ty: H * 0.62 },
  ];
  chips.forEach((txtc, i) => {
    const sl = slots[i];
    const f = fitOne(ctx, txtc, { weight: 700, family: F_BODY, maxW: 400, maxLines: 1, max: 36, min: 26 });
    ctx.font = `700 ${f.size}px ${F_BODY}`;
    const tw = f.lines[0].reduce((t, wd) => t + ctx.measureText(wd.w).width, 0) + ctx.measureText(" ").width * (f.lines[0].length - 1);
    const w = tw + 76, h = 84;
    const x = sl.side === "L" ? P : VW - P - w, y = sl.y;
    const ex = sl.side === "L" ? x + w : x, ey = y + h / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(sl.tx, sl.ty); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = "rgba(255,255,255,.7)"; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(sl.tx, sl.ty, 9, 0, 7); ctx.fill();
    ctx.restore();
    glass(ctx, c, x, y, w, h, 42, "rgba(0,0,0,.6)", 14, "rgba(255,255,255,.2)");
    ctx.fillStyle = c.theme.hl; ctx.beginPath(); ctx.arc(x + 36, y + h / 2, 8, 0, 7); ctx.fill();
    drawLines(ctx, f, x + 58, y + (h - f.size * f.lh) / 2, { weight: 700, family: F_BODY, color: "#ffffff" });
  });
}

/* Ingredients dissection: 4 numbered callouts around the packshot */
function layoutIngr(ctx, c, H) {
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 2, max: 96, min: 54 });
  const items = c.items.length ? c.items : ["Add up to 4 components"];
  drawCallouts(ctx, c, items, NODE_SLOTS(H), true);
  drawBadges(ctx, c, P, H - BOT - ((c.badge ? 128 : 0) + (c.sub ? 92 : 0)), 700);
}

/* Ugly marker ad: handwritten, highlighter strokes, red arrow */
function layoutMarker(ctx, c, H) {
  const th = c.theme, W = VW - 2 * P;
  ctx.fillStyle = "#fffdf0"; ctx.fillRect(0, 0, VW, H);
  ctx.strokeStyle = "rgba(15,23,42,.05)"; ctx.lineWidth = 2;
  for (let y = 260; y < H; y += 62) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }
  const f = fitWords(ctx, c.headWords, { weight: 700, family: F_HAND, maxW: W, maxLines: 3, max: 168, min: 88, lh: 1.02 });
  ctx.font = `700 ${f.size}px ${F_HAND}`;
  const sp = ctx.measureText(" ").width, y0 = 190;
  f.lines.forEach((line, i) => {
    const lw = line.reduce((t2, wd) => t2 + ctx.measureText(wd.w).width, 0) + sp * (line.length - 1);
    let x = P; const by = y0 + i * f.size * f.lh + f.size * 0.82;
    line.forEach((wd) => {
      const ww = ctx.measureText(wd.w).width;
      if (wd.hl) { ctx.save(); ctx.fillStyle = "rgba(250,204,21,.92)"; ctx.translate(x - 8, by - f.size * 0.62); ctx.rotate(-0.012); ctx.fillRect(0, 0, ww + 16, f.size * 0.58); ctx.restore(); }
      ctx.fillStyle = "#111827"; ctx.textAlign = "left"; ctx.fillText(wd.w, x, by);
      x += ww + sp;
    });
  });
  let hb = y0 + f.lines.length * f.size * f.lh;
  hb = drawBadges(ctx, c, P, hb + 20, 760) - 20;
  const pTop = hb + 50, pBot = H - BOT - 190;
  const ph = Math.max(300, pBot - pTop);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff"; rrect(ctx, P, pTop, W, ph, 20); ctx.fill(); ctx.restore();
  if (c.img) drawCover(ctx, c.img, P + 14, pTop + 14, W - 28, ph - 28, 12, c.pos, c);
  else drawSlot(ctx, c, P + 14, pTop + 14, W - 28, ph - 28, 12);
  const nf = fitOne(ctx, c.note, { weight: 700, family: F_HAND, maxW: W - 260, maxLines: 2, max: 104, min: 60, lh: 1 });
  ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const ax = P + 70, ay = H - BOT - 170;
  ctx.beginPath(); ctx.moveTo(ax + 20, ay); ctx.bezierCurveTo(ax - 60, ay - 90, ax + 20, ay - 190, ax + 190, ay - 220); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ax + 190, ay - 220); ctx.lineTo(ax + 122, ay - 236); ctx.moveTo(ax + 190, ay - 220); ctx.lineTo(ax + 150, ay - 160); ctx.stroke();
  drawLines(ctx, nf, P + 190, H - BOT - 190 + 10, { weight: 700, family: F_HAND, color: "#dc2626" });
}

/* Competitor receipt */
function layoutReceipt(ctx, c, H) {
  const W = 800, x0 = (VW - W) / 2;
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 200, { maxLines: 3, max: 96, min: 50 });
  const mono = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const rows = c.rows.length ? c.rows : [{ label: "Add lines like: Item 120>49", old: "", now: "" }];
  const rowH = 74, pad = 44;
  const cardH = pad + 44 + 30 + rows.length * rowH + (c.totals ? 130 : 20) + pad;
  const y0 = Math.max(hb + 50, H - BOT - cardH);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(x0, y0 + 24); ctx.arcTo(x0, y0, x0 + 24, y0, 24); ctx.lineTo(x0 + W - 24, y0); ctx.arcTo(x0 + W, y0, x0 + W, y0 + 24, 24);
  const yb = y0 + cardH;
  ctx.lineTo(x0 + W, yb); for (let x = x0 + W; x > x0; x -= 40) { ctx.lineTo(x - 20, yb + 18); ctx.lineTo(x - 40, yb); }
  ctx.closePath(); ctx.fill(); ctx.restore();
  txt(ctx, "ORDER SUMMARY", x0 + pad, y0 + pad + 26, { size: 30, weight: 700, family: mono, color: "#64748b", ls: 6 });
  ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
  ctx.beginPath(); ctx.moveTo(x0 + pad, y0 + pad + 50); ctx.lineTo(x0 + W - pad, y0 + pad + 50); ctx.stroke(); ctx.setLineDash([]);
  let y = y0 + pad + 50 + 30;
  rows.forEach((r) => {
    const lf = fitOne(ctx, r.label, { weight: 600, family: mono, maxW: r.old ? 400 : W - 2 * pad, maxLines: 1, max: 34, min: 24 });
    drawLines(ctx, lf, x0 + pad, y + 14, { weight: 600, family: mono, color: "#0f172a" });
    if (r.old) {
      ctx.font = `600 34px ${mono}`;
      const nw = ctx.measureText(r.now).width;
      txt(ctx, r.now, x0 + W - pad, y + 46, { size: 34, weight: 800, family: mono, color: "#15803d", align: "right" });
      ctx.font = `600 34px ${mono}`;
      const ow = ctx.measureText(r.old).width, ox = x0 + W - pad - nw - 24 - ow;
      txt(ctx, r.old, ox, y + 46, { size: 34, weight: 600, family: mono, color: "#94a3b8" });
      ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ox - 4, y + 34); ctx.lineTo(ox + ow + 4, y + 34); ctx.stroke();
    }
    y += rowH;
  });
  if (c.totals) {
    ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(x0 + pad, y + 6); ctx.lineTo(x0 + W - pad, y + 6); ctx.stroke(); ctx.setLineDash([]);
    txt(ctx, "TYPICAL TOTAL", x0 + pad, y + 50, { size: 28, weight: 700, family: mono, color: "#64748b" });
    ctx.font = `700 36px ${mono}`; const ow = ctx.measureText(c.totals[0]).width;
    txt(ctx, c.totals[0], x0 + W - pad, y + 52, { size: 36, weight: 700, family: mono, color: "#94a3b8", align: "right" });
    ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0 + W - pad - ow - 4, y + 38); ctx.lineTo(x0 + W - pad + 4, y + 38); ctx.stroke();
    txt(ctx, (c.brand ? c.brand.toUpperCase().slice(0, 14) : "YOU PAY"), x0 + pad, y + 108, { size: 34, weight: 800, family: mono, color: "#0f172a" });
    txt(ctx, c.totals[1], x0 + W - pad, y + 112, { size: 54, weight: 800, family: mono, color: "#15803d", align: "right" });
  }
}

/* Tweet-style screenshot card over the product */
function layoutTweet(ctx, c, H) {
  const W = VW - 2 * P;
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 200, { maxLines: 2, max: 92, min: 54 });
  const tf = fitOne(ctx, c.text, { weight: 500, family: F_BODY, maxW: W - 96, maxLines: 6, max: 56, min: 32, lh: 1.28 });
  const th2 = tf.lines.length * tf.size * tf.lh;
  const cardH = 44 + 96 + 30 + th2 + 30 + 60 + 40;
  const y0 = Math.min(hb + 40, H - BOT - cardH - 200);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff"; rrect(ctx, P, y0, W, cardH, 44); ctx.fill(); ctx.restore();
  ctx.fillStyle = "#dbeafe"; ctx.beginPath(); ctx.arc(P + 44 + 48, y0 + 44 + 48, 48, 0, 7); ctx.fill();
  txt(ctx, "C", P + 92, y0 + 44 + 48 + 17, { size: 50, weight: 800, family: F_HEAD, color: "#1d4ed8", align: "center" });
  txt(ctx, "Customer", P + 168, y0 + 44 + 40, { size: 40, weight: 800, color: "#0f172a" });
  txt(ctx, "@customer", P + 168, y0 + 44 + 84, { size: 32, weight: 500, color: "#64748b" });
  drawLines(ctx, tf, P + 48, y0 + 44 + 96 + 24, { weight: 500, family: F_BODY, color: "#0f172a" });
  const iy = y0 + cardH - 62;
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  rrect(ctx, P + 52, iy - 14, 40, 30, 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(P + 62, iy + 16); ctx.lineTo(P + 60, iy + 30); ctx.lineTo(P + 76, iy + 16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(P + 210, iy - 8); ctx.lineTo(P + 250, iy - 8); ctx.lineTo(P + 240, iy - 18); ctx.moveTo(P + 250, iy + 14); ctx.lineTo(P + 210, iy + 14); ctx.lineTo(P + 220, iy + 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(P + 410, iy + 22); ctx.bezierCurveTo(P + 380, iy, P + 384, iy - 26, P + 406, iy - 20); ctx.bezierCurveTo(P + 414, iy - 18, P + 418, iy - 12, P + 418, iy - 12); ctx.bezierCurveTo(P + 418, iy - 12, P + 424, iy - 20, P + 434, iy - 20); ctx.bezierCurveTo(P + 456, iy - 26, P + 456, iy, P + 410, iy + 22); ctx.stroke();
  drawBadges(ctx, c, P, H - BOT - ((c.badge ? 128 : 0) + (c.sub ? 92 : 0)), 700);
}

/* iMessage-style thread over the image */
function layoutDM(ctx, c, H) {
  photoBg(ctx, c, H);
  const hb = headline(ctx, c, 200, { maxLines: 3, max: 100, min: 54 });
  const W = VW - 2 * P, bw = 700;
  const rf = fitOne(ctx, c.recv, { weight: 500, family: F_BODY, maxW: bw - 80, maxLines: 3, max: 46, min: 30, lh: 1.24 });
  const sf = fitOne(ctx, c.sent, { weight: 500, family: F_BODY, maxW: bw - 80, maxLines: 4, max: 46, min: 30, lh: 1.24 });
  const rh = rf.lines.length * rf.size * rf.lh + 64, sh = sf.lines.length * sf.size * sf.lh + 64;
  let y = Math.max(hb + 90, H - BOT - rh - sh - 40 - 70);
  txt(ctx, "Today 9:41 AM", VW / 2, y - 26, { size: 28, weight: 600, color: "rgba(255,255,255,.75)", align: "center" });
  const bubble = (x, yy, w, h, fill, right) => {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = fill; rrect(ctx, x, yy, w, h, 46); ctx.fill();
    ctx.beginPath(); const tx = right ? x + w - 4 : x + 4;
    ctx.moveTo(tx, yy + h - 40); ctx.quadraticCurveTo(tx + (right ? 2 : -2), yy + h + 2, tx + (right ? 26 : -26), yy + h + 4);
    ctx.quadraticCurveTo(tx + (right ? -6 : 6), yy + h + 4, tx + (right ? -30 : 30), yy + h - 14); ctx.closePath(); ctx.fill(); ctx.restore();
  };
  bubble(P, y, bw, rh, "#e5e7eb", false);
  drawLines(ctx, rf, P + 40, y + 32, { weight: 500, family: F_BODY, color: "#0f172a" });
  y += rh + 30;
  bubble(VW - P - bw, y, bw, sh, "#0a84ff", true);
  drawLines(ctx, sf, VW - P - bw + 40, y + 32, { weight: 500, family: F_BODY, color: "#ffffff" });
  txt(ctx, "Delivered", VW - P - 8, y + sh + 52, { size: 26, weight: 600, color: "rgba(255,255,255,.7)", align: "right" });
}

/* Press quote bar pinned above the product */
function layoutPress(ctx, c, H) {
  const W = VW - 2 * P, th = c.theme, serif = 'Georgia, "Times New Roman", serif';
  photoBg(ctx, c, H);
  const qf = fitWords(ctx, plainWords("“" + c.quoteText + "”"), { weight: 700, family: serif, maxW: W - 24, maxLines: 4, max: c.tall ? 84 : 76, min: 38, lh: 1.16 });
  const bh = 34 + (c.pub ? 92 : 40) + qf.lines.length * qf.size * qf.lh + 40;
  const y0 = 210;
  ctx.fillStyle = "rgba(2,6,23,.86)"; ctx.fillRect(0, y0, VW, bh);
  ctx.fillStyle = th.hl; ctx.fillRect(0, y0, VW, 6); ctx.fillRect(0, y0 + bh - 6, VW, 6);
  let y = y0 + 34;
  if (c.pub) {
    txt(ctx, "AS SEEN IN", P, y + 26, { size: 26, weight: 800, family: F_HEAD, color: "rgba(255,255,255,.65)", ls: 6 });
    txt(ctx, c.pub, P, y + 84, { size: 54, weight: 700, family: serif, color: th.hl });
    y += 92;
  } else y += 40;
  drawLines(ctx, qf, P, y, { weight: 700, family: serif, color: "#ffffff" });
  const hb = y0 + bh + 36;
  const hf = fitWords(ctx, c.headWords, { ...HEAD, maxW: W, maxLines: 2, max: 84, min: 44 });
  drawLines(ctx, hf, P, hb, { ...HEAD, color: th.ink, hl: th.hl });
  drawBadges(ctx, c, P, H - BOT - ((c.sub ? 92 : 0)), 700);
}

/* Before / After vertical split with metrics */
function layoutBA(ctx, c, H) {
  const th = c.theme, half = VW / 2;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1e293b"); g.addColorStop(1, "#020617");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, H);
  ctx.save(); ctx.beginPath(); ctx.rect(half, 0, half, H); ctx.clip();
  if (c.img) drawCover(ctx, c.img, half, 0, half, H, 0, c.pos, c);
  else { ctx.fillStyle = "rgba(37,99,235,.35)"; ctx.fillRect(half, 0, half, H); drawSlot(ctx, c, half + 40, H / 2 - 220, half - 80, 440, 30); }
  const sh = ctx.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, "rgba(2,6,23,.75)"); sh.addColorStop(0.4, "rgba(2,6,23,.05)"); sh.addColorStop(0.7, "rgba(2,6,23,.3)"); sh.addColorStop(1, "rgba(2,6,23,.9)");
  ctx.fillStyle = sh; ctx.fillRect(half, 0, half, H); ctx.restore();
  ctx.fillStyle = "#ffffff"; ctx.fillRect(half - 4, 0, 8, H);
  ctx.beginPath(); ctx.arc(half, H * 0.5, 34, 0, 7); ctx.fill();
  ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(half - 14, H * 0.5); ctx.lineTo(half + 14, H * 0.5); ctx.moveTo(half - 6, H * 0.5 - 9); ctx.lineTo(half - 15, H * 0.5); ctx.lineTo(half - 6, H * 0.5 + 9); ctx.moveTo(half + 6, H * 0.5 - 9); ctx.lineTo(half + 15, H * 0.5); ctx.lineTo(half + 6, H * 0.5 + 9); ctx.stroke();
  const hb = headline(ctx, c, 200, { maxLines: 2, max: 92, min: 52 });
  const py = hb + 40;
  [["BEFORE", 60, "#475569"], ["AFTER", half + 60, "#10b981"]].forEach(([lab, x, col]) => {
    ctx.font = `900 40px ${F_HEAD}`; const w = ctx.measureText(lab).width + 70;
    ctx.fillStyle = col; rrect(ctx, x, py, w, 84, 42); ctx.fill();
    txt(ctx, lab, x + w / 2, py + 57, { size: 40, weight: 900, family: F_HEAD, color: "#ffffff", align: "center", ls: 4 });
  });
  const metric = (str, cx, color) => {
    const f = fitOne(ctx, str || "Add a metric", { ...HEAD, maxW: half - 120, maxLines: 3, max: 110, min: 44, lh: 1.02 });
    const h = f.lines.length * f.size * f.lh;
    drawLines(ctx, f, cx, H - BOT - h - 10, { ...HEAD, color, align: "center" });
  };
  metric(c.ba.before, half / 2, "#cbd5e1");
  metric(c.ba.after, half + half / 2, th.hl);
  drawBadges(ctx, { ...c, sub: c.sub }, 60, py + 120, half - 120);
}

/* Trend chart proof */
function layoutChart(ctx, c, H) {
  const W = VW - 2 * P, th = c.theme;
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 2, max: 96, min: 54 });
  const ph = c.tall ? 620 : 520, y0 = H - BOT - ph;
  darkPanel(ctx, c, P, y0, W, ph, 44, 0.78);
  const x0 = P + 70, x1 = P + W - 70, gy0 = y0 + 150, gy1 = y0 + ph - 130;
  ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const yy = gy0 + ((gy1 - gy0) * i) / 3; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
  const sN = moneyNum(c.items[0] || ""), eN = moneyNum(c.items[1] || "");
  let rs = 0.15, re = 0.9;
  if (!isNaN(sN) && !isNaN(eN) && sN !== eN) { rs = sN < eN ? 0.15 : 0.9; re = sN < eN ? 0.9 : 0.15; }
  const ys = gy1 - (gy1 - gy0) * rs, ye = gy1 - (gy1 - gy0) * re;
  const mid = (x0 + x1) / 2;
  const path = () => { ctx.beginPath(); ctx.moveTo(x0, ys); ctx.bezierCurveTo(mid - 60, ys, mid - 120, (ys + ye) / 2 + (ys > ye ? 40 : -40), mid, (ys + ye) / 2); ctx.bezierCurveTo(mid + 120, (ys + ye) / 2 + (ys > ye ? -40 : 40), x1 - 200, ye, x1, ye); };
  path(); ctx.lineTo(x1, gy1); ctx.lineTo(x0, gy1); ctx.closePath();
  const ag = ctx.createLinearGradient(0, gy0, 0, gy1); ag.addColorStop(0, rgba(th.hl, 0.35)); ag.addColorStop(1, rgba(th.hl, 0));
  ctx.fillStyle = ag; ctx.fill();
  path(); ctx.strokeStyle = th.hl; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.stroke();
  [[x0, ys], [x1, ye]].forEach(([x, y]) => { ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); ctx.fillStyle = th.hl; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); });
  txt(ctx, "DAY 1", x0, gy1 + 56, { size: 28, weight: 800, family: F_HEAD, color: "rgba(255,255,255,.7)", ls: 5 });
  txt(ctx, "DAY 30", x1, gy1 + 56, { size: 28, weight: 800, family: F_HEAD, color: "rgba(255,255,255,.7)", ls: 5, align: "right" });
  const lab = (str, x, align, col) => { const f = fitOne(ctx, str || "Add a value", { ...HEAD, maxW: 420, maxLines: 2, max: 60, min: 32, lh: 1.05 }); drawLines(ctx, f, x, y0 + 36, { ...HEAD, color: col, align }); };
  lab(c.items[0], x0 + 150, "center", "#e2e8f0");
  lab(c.items[1], x1 - 150, "center", th.hl);
}

/* Stop-light rating matrix */
function layoutStoplight(ctx, c, H) {
  const W = VW - 2 * P, th = c.theme;
  photoBg(ctx, c, H);
  headline(ctx, c, 200, { maxLines: 3, max: 96, min: 52 });
  const rows = c.items.length ? c.items : ["Add up to 4 criteria"];
  const rowH = 96, headH = 84, legH = 70;
  const panelH = headH + rows.length * rowH + legH + 20;
  const y0 = H - BOT - panelH;
  darkPanel(ctx, c, P, y0, W, panelH, 40, 0.74);
  const cx = [P + 520, P + 680, P + 840];
  const heads = [c.brand && c.brand.length <= 8 ? c.brand.toUpperCase() : "YOU", "TYPICAL", "BUDGET"];
  heads.forEach((h, i) => txt(ctx, h, cx[i], y0 + 54, { size: 24, weight: 900, family: F_HEAD, color: i === 0 ? th.hl : th.muted, ls: 2, align: "center" }));
  const col = { g: "#22c55e", y: "#facc15", r: "#ef4444" };
  const pat = [["g", "y", "r"], ["g", "y", "r"], ["g", "r", "g"], ["g", "y", "r"]];
  rows.forEach((r, i) => {
    const cy = y0 + headH + i * rowH + rowH / 2;
    if (i) { ctx.strokeStyle = th.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P + 30, cy - rowH / 2); ctx.lineTo(P + W - 30, cy - rowH / 2); ctx.stroke(); }
    const lf = fitOne(ctx, r, { weight: 700, family: F_BODY, maxW: 400, maxLines: 2, max: 36, min: 24, lh: 1.1 });
    drawLines(ctx, lf, P + 44, cy - (lf.lines.length * lf.size * lf.lh) / 2, { weight: 700, family: F_BODY, color: "#ffffff" });
    pat[i % 4].forEach((k, j) => {
      ctx.save(); ctx.shadowColor = col[k]; ctx.shadowBlur = 18; ctx.fillStyle = col[k]; ctx.beginPath(); ctx.arc(cx[j], cy, 24, 0, 7); ctx.fill(); ctx.restore();
    });
  });
  const ly = y0 + panelH - 34;
  [["g", "Best"], ["y", "OK"], ["r", "Weak"]].forEach(([k, l], i) => { const x = P + 44 + i * 190; ctx.fillStyle = col[k]; ctx.beginPath(); ctx.arc(x, ly - 8, 11, 0, 7); ctx.fill(); txt(ctx, l, x + 26, ly, { size: 28, weight: 700, color: "rgba(255,255,255,.75)" }); });
}

const LAYOUTS = { vHero: layoutVHero, vCompare: layoutVCompare, vQuote: layoutVQuote, vNodes: layoutVNodes, ingr: layoutIngr, marker: layoutMarker, receipt: layoutReceipt, tweet: layoutTweet, dm: layoutDM, press: layoutPress, ba: layoutBA, chart: layoutChart, stoplight: layoutStoplight, hero: layoutHero, split: layoutSplit, myth: layoutMyth, review: layoutReview, compare: layoutCompare, list: layoutList, quote: layoutQuote };

function renderCreative(canvas, cfg, outW) {
  const H = cfg.tall ? 1920 : 1350;
  canvas.width = outW;
  canvas.height = Math.round((outW * H) / VW);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(outW / VW, 0, 0, outW / VW, 0, 0);
  drawBackground(ctx, cfg, H);
  LAYOUTS[cfg.layout](ctx, cfg, H);
  drawBrand(ctx, cfg);
}

/* ---- inputs ---- */
function readProductImage(file, opt) {
  const o = opt || {};
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error(o.png ? "Choose a PNG, SVG, JPG or WEBP logo." : "Choose a JPG, PNG or WEBP product photo."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const nw = img.naturalWidth || 512, nh = img.naturalHeight || 512;
        const k = o.png ? Math.min(nw > 600 ? 600 / nw : 1, 1) * (nw < 300 && img.naturalWidth === 0 ? 1 : 1) : Math.min(1, 1400 / Math.max(nw, nh));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(nw * k));
        c.height = Math.max(1, Math.round(nh * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ canvas: c, name: file.name, w: nw, h: nh, thumb: o.png ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.7) });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(new Error("That image could not be read. Try a JPG or PNG."));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be read. Try a JPG or PNG.")); };
    img.src = url;
  });
}

/* What the optional Details field means depends on the layout being shown. */
const DETAILS_HELP = {
  hero: "Not used by this layout. The headline, subtitle and badges carry the message.",
  split: "Up to 3 benefits, separated by commas. Each becomes a checked line.",
  myth: "The fact that answers the myth. The myth line is written for you.",
  review: "Up to 3 real customer reviews, separated by |. Each becomes a review card.",
  compare: "Up to 3 points, separated by commas. Each becomes a comparison row.",
  list: "Up to 4 benefits, separated by commas. Each becomes a checked line.",
  quote: "The founder note, written like a note: what you made and why.",
  marker: "The handwritten note the red arrow points to.",
  receipt: "One line per item: label, typical price > your price. Separate lines with ; e.g. Coffee shop 120>38; Delivery 45>0",
  tweet: "The customer reaction, as they wrote it. Only use posts you have permission to share.",
  ingr: "Up to 4 components or specs, separated by commas. Each gets a numbered callout.",
  stoplight: "Up to 4 criteria, separated by commas. Your column is green; Typical and Budget are illustrative, so use this only where your own tests back it up.",
  dm: "Your reply to \"Where did you get that?\". One short line.",
  press: "The exact quote. Only quote coverage you actually received, and add the publication name in the badge field.",
  ba: "Two metrics, separated by a comma: before, after. e.g. 14 breakouts, 3 breakouts. Your photo appears on the After side.",
  chart: "Two labeled numbers, separated by a comma: start, end. e.g. 58 sleep score, 81 sleep score. The curve connects your two numbers, so use real ones.",
  vHero: "Up to 2 real customer reviews, separated by |. Only mark them Verified buyer if they are.",
  vCompare: "Up to 3 things that set you apart, separated by commas. They fill the OUR DIFFERENCE column.",
  vQuote: "Not used here. Your Main Headline is the quote.",
  vNodes: "Up to 2 feature callouts, separated by commas.",
};

function captionsFor(t, brand, hook, tall) {
  const d = clean(hook);
  if (!d) return null;
  const bn = brand.trim();
  const cat = detectCategory(bn + " " + d);
  const cta = cat === "local" ? "Book now" : "Shop now";
  const lower = d.charAt(0).toLowerCase() + d.slice(1);
  const fw = {
    "Contrarian angle": `Everyone says it can't be done. ${bn ? bn + ": " : ""}${d}. ${cta} →`,
    "Show, don't tell": `Watch closely. ${d}. ${cta} →`,
    Comparison: `Side by side, ${bn || "we"} ${bn ? "wins" : "win"} on one thing: ${lower}. ${cta} →`,
    "Sensory hook": `Watch this. ${d}. ${cta} →`,
    "Outcome + urgency": `${d}. Don't wait on this one. ${cta} →`,
    "Social proof": `Read this before you buy: ${lower}. ${cta} →`,
    Authority: `From the ${bn ? bn + " team" : "founder"}: ${d}. ${cta} →`,
    "Pain point": `If this sounds like you: ${lower}. Meet ${bn || "the fix"}. ${cta} →`,
    Identity: `Built for you: ${lower}. ${cta} →`,
    Outcome: `${d}. That's ${bn || "the point"}. ${cta} →`,
    "Pattern interrupt": `Ok, hear me out. ${d}. ${cta} →`,
    "Price anchoring": `Do the math: ${lower}. ${cta} →`,
    Curiosity: `Everyone asks where it's from. ${d}. ${cta} →`,
    "Component proof": `Every component, listed: ${lower}. ${cta} →`,
    Transformation: `${d}. Same person, real change. ${cta} →`,
  };
  const a = fw[t.framework] || `${d}. ${cta} →`;
  const b = tall
    ? `Stop scrolling: ${lower}.${bn ? " That's " + bn + "." : ""} Watch to the end.`
    : `${d}.${bn ? " " + bn + " makes it simple." : ""} ${cta} →`;
  return [
    { label: t.framework, kind: tall ? "Reel / TikTok caption" : "Feed caption", text: a },
    { label: tall ? "Watch-time hook" : "Direct offer", kind: tall ? "Reel / TikTok caption" : "Feed caption", text: b },
  ];
}

/* ------------------------------- Modal --------------------------------- */

function badgeDefaults(t) {
  const a = t.art;
  if (a.kind === "restock") return { badge: "Back in stock", sub: "", pills: a.sizes.map((x) => x[0]).join(", ") };
  if (a.kind === "neon") return { badge: a.label, sub: "", pills: "" };
  return { badge: "", sub: "", pills: "" };
}

function slugify(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function StudioModal({ tpl, onClose, notify }) {
  const [img, setImg] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [brand, setBrand] = useState("");
  const [hook, setHook] = useState("");
  const bd = useMemo(() => badgeDefaults(tpl), [tpl]);
  const [badge, setBadge] = useState(bd.badge);
  const [sub, setSub] = useState(bd.sub);
  const [pills, setPills] = useState(bd.pills);
  const [headText, setHeadText] = useState("");
  const [oldWay, setOldWay] = useState("");
  const [subText, setSubText] = useState("");
  const [logo, setLogo] = useState(null);
  const [logoErr, setLogoErr] = useState("");
  const [logoOver, setLogoOver] = useState(false);
  const logoRef = useRef(null);
  const [seed, setSeed] = useState(-1);
  const [sel, setSel] = useState(-1);
  const [gen, setGen] = useState(false);
  const [fonts, setFonts] = useState(0);
  const [over, setOver] = useState(false);
  const [pos, setPos] = useState(POS0);
  const [grab, setGrab] = useState(false);
  const [dragging, setDragging] = useState(false);
  const cfgRef = useRef(null);
  const dragRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);
  const thumbRefs = useRef([]);
  const fileRef = useRef(null);
  const closeRef = useRef(null);
  const timers = useRef([]);
  const tall = tpl.type === "video";
  const layout = KIND_LAYOUT[tpl.art.kind] || "hero";
  const variants = useMemo(() => (seed < 0 ? [] : makeVariants(seed)), [seed]);
  const cur = sel < 0 || !variants[sel] ? BASE_VARIANT : variants[sel];
  const activeLayout = cur.layout || layout;
  const needsHeadline = !!HEADLINE_REQUIRED[activeLayout];
  const needsDetails = !!DETAILS_REQUIRED[activeLayout];
  const capSrc = okText(headText) ? headText : "";
  const inputs = { brand, hook, img, pos, badge, sub, pills, logo, headline: headText, subtitle: subText, oldway: oldWay };
  const captions = useMemo(() => captionsFor(tpl, brand, capSrc, tall), [tpl, brand, capSrc, tall]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      timers.current.forEach(clearTimeout);
    };
  }, [onClose]);

  useEffect(() => {
    let live = true;
    try {
      Promise.all([document.fonts.load(`900 60px ${F_HEAD}`), document.fonts.load(`600 40px ${F_HAND}`), document.fonts.load(`700 34px ${F_BODY}`)])
        .then(() => live && setFonts(1)).catch(() => {});
    } catch (e) {}
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (canvasRef.current) { const cfg = buildConfig(tpl, inputs, cur); renderCreative(canvasRef.current, cfg, 720); cfgRef.current = cfg; }
    if (seed >= 0) variants.forEach((v, i) => { const el = thumbRefs.current[i]; if (el) renderCreative(el, buildConfig(tpl, inputs, v), 220); });
  }, [tpl, brand, hook, img, pos, badge, sub, pills, logo, headText, subText, oldWay, variants, sel, fonts, seed]);

  const onFile = (file) => {
    if (!file) return;
    setImgErr("");
    setImgBusy(true);
    readProductImage(file).then((r) => { setPos(POS0); setImg(r); }).catch((e) => setImgErr(e.message)).finally(() => setImgBusy(false));
  };

  /* Pointer to design-space coordinates and hit test against the photo frame */
  const toDesign = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.width) * VW, k: VW / r.width };
  };
  const overFrame = (e) => {
    const f = cfgRef.current && cfgRef.current.frame;
    if (!f || !img) return false;
    const d = toDesign(e);
    return d.x >= f.x && d.x <= f.x + f.w && d.y >= f.y && d.y <= f.y + f.h;
  };
  const onDown = (e) => {
    if (e.button !== 0 || !overFrame(e)) return;
    e.preventDefault();
    const f = cfgRef.current.frame;
    const k = coverWin(img.canvas, f.w, f.h, pos);
    dragRef.current = { cx: e.clientX, cy: e.clientY, x: k.x, y: k.y, f };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    setDragging(true);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) { setGrab(overFrame(e)); return; }
    const kk = toDesign(e).k;
    const nx = d.x + ((e.clientX - d.cx) * kk) / d.f.w;
    const ny = d.y + ((e.clientY - d.cy) * kk) / d.f.h;
    const w = coverWin(img.canvas, d.f.w, d.f.h, { x: nx, y: ny, s: pos.s });
    setPos((p) => ({ ...p, x: w.x, y: w.y }));
  };
  const onUp = () => { dragRef.current = null; setDragging(false); };
  const setZoom = (pct) => setPos((p) => {
    const f = cfgRef.current && cfgRef.current.frame;
    const s = pct / 100;
    if (!f || !img) return { ...p, s };
    const w = coverWin(img.canvas, f.w, f.h, { ...p, s });
    return { x: w.x, y: w.y, s };
  });

  const onLogo = (file) => {
    if (!file) return;
    setLogoErr("");
    readProductImage(file, { png: true }).then(setLogo).catch((e) => setLogoErr(e.message));
  };

  const canGen = true;
  const generate = () => {
    if (!canGen || gen) return;
    setGen(true);
    const t = setTimeout(() => {
      setSeed((s) => s + 1);
      setSel(0);
      setGen(false);
      notify("4 ad variations generated");
    }, 600);
    timers.current.push(t);
  };

  const ready = !!img && (!needsHeadline || okText(headText)) && (!needsDetails || okText(hook));
  const why = !img ? "Upload a product image to enable the download." : needsHeadline && !okText(headText) ? "Write your own Main Headline. This layout ships with sample copy that may not be true for your product." : needsDetails && !okText(hook) ? "Fill in Details with your own content. The preview shows sample text that may not be true for your product." : "";

  const download = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const c = document.createElement("canvas");
      renderCreative(c, buildConfig(tpl, inputs, cur), 1080);
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      if (!blob) throw new Error("build");
      const filename = `${slugify(brand) || "ad"}-${tpl.id}${sel < 0 ? "" : "-v" + (sel + 1)}.png`;
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (dl) {
        await dl.save({ filename, data: blob });
        notify("Ad creative saved as PNG");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        notify("Download started. If nothing happens, right-click the preview and choose Save image.", 4500);
      }
    } catch (e) {
      if (e && e.code === "declined") { /* viewer said no */ }
      else notify("The download could not start here. Right-click the preview and choose Save image.", 4500);
    } finally {
      setSaving(false);
    }
  };

  const copyCap = async (text) => {
    const ok = await copyText(text);
    notify(ok ? "Copied to clipboard!" : "Copy was blocked here. Select the text and copy it manually.", ok ? 2000 : 4500);
  };

  const drag = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files && e.dataTransfer.files[0]); },
  };
  const field = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 sm:text-sm placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="st-title" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-900/20 sm:rounded-3xl"
      >
        <header className="flex items-start gap-3.5 border-b border-slate-100 px-6 py-5 md:px-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30"><Icon.Wand className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 pr-8">
            <h2 id="st-title" className="text-xl font-semibold tracking-tight text-slate-900">Creative Synthesizer</h2>
            <p className="mt-0.5 truncate text-[13px] text-slate-500">{tpl.title} · {tpl.format}</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
            <Icon.Close className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2">
          {/* LEFT: live preview */}
          <section className="flex flex-col items-center gap-4 bg-slate-50 px-6 py-6 md:px-8">
            <div className="flex w-full items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Live Preview</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">{tall ? "9:16 · 1080×1920" : "4:5 · 1080×1350"}</span>
            </div>
            <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-900/10">
              <canvas
                ref={canvasRef} role="img" aria-label="Live preview of your ad creative. Drag the product photo to reposition it."
                draggable={false} onDragStart={(e) => e.preventDefault()}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                onPointerLeave={() => !dragRef.current && setGrab(false)}
                style={{ touchAction: grab || dragging ? "none" : "auto" }}
                className={`block h-auto max-h-[58vh] w-auto max-w-full select-none ${dragging ? "cursor-grabbing" : grab ? "cursor-grab" : "cursor-default"}`}
              />
            </div>
            {TEMPLATE_IMGS[tpl.id] && (
              <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                <img src={TEMPLATE_IMGS[tpl.id]} alt={`${tpl.title} template`} className="h-20 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Template reference</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{tpl.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">{img ? "Your photo and copy replace the sample scene." : "Upload a product photo shot like this. Your photo and copy replace the sample scene."}</p>
                </div>
              </div>
            )}
            {seed >= 0 && (
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Ad variations · new structure and hook angle</p>
                  <button
                    onClick={() => setSel(-1)} aria-pressed={sel < 0}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${sel < 0 ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-white hover:text-slate-800"}`}
                  >Template layout</button>
                </div>
                <ul className="mt-2 grid grid-cols-4 gap-2.5">
                  {variants.map((v, i) => (
                    <li key={v.layout}>
                      <button
                        onClick={() => setSel(i)} aria-pressed={sel === i} aria-label={`Use variation ${i + 1}: ${v.label}`}
                        className={`flex w-full flex-col items-stretch gap-1.5 rounded-xl border bg-white p-1.5 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 ${sel === i ? "border-blue-600 ring-2 ring-blue-600" : "border-slate-200 hover:border-slate-300"}`}
                      >
                        <canvas ref={(el) => (thumbRefs.current[i] = el)} className="block h-auto w-full rounded-lg" />
                        <span className="px-0.5 text-[11px] font-semibold leading-tight text-slate-700">{i + 1}. {v.label}</span>
                        <span className="px-0.5 text-[10px] leading-tight text-slate-400">{v.angle} hook</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* RIGHT: customizer */}
          <section className="flex min-w-0 flex-col gap-5 px-6 py-6 md:px-8">
            <div>
              <p className="text-sm font-semibold text-slate-900" id="st-img-label">1. Upload Product Image</p>
              <input ref={fileRef} id="st-file" type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-labelledby="st-img-label" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
              {img ? (
                <div {...drag} className={`mt-2 flex items-center gap-4 rounded-2xl border-2 border-dashed bg-white p-3.5 transition ${over ? "border-blue-500 bg-blue-50/70" : "border-slate-200"}`}>
                  <img src={img.thumb} alt="Your product" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{img.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-500">{img.w}×{img.h} · placed in the creative</p>
                  </div>
                  <button onClick={() => fileRef.current && fileRef.current.click()} className="rounded-full px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Replace</button>
                  <button onClick={() => setImg(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Remove</button>
                </div>
              ) : (
                <div
                  {...drag} role="button" tabIndex={0} onClick={() => fileRef.current && fileRef.current.click()}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileRef.current.click())}
                  aria-describedby="st-img-label"
                  className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-7 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 ${over ? "border-blue-500 bg-blue-50/70" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"}`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon.Image className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">{imgBusy ? "Reading your photo…" : "Drag your product photo here, or click to browse"}</p>
                  <p className="mt-1 text-xs text-slate-500">JPG, PNG or WEBP. A clean shot on a plain background works best. It never leaves your browser.</p>
                </div>
              )}
              {img && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <label htmlFor="st-zoom" className="text-xs font-semibold text-slate-700">Zoom</label>
                    <input
                      id="st-zoom" type="range" min="100" max="200" step="1" value={Math.round(pos.s * 100)}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      aria-valuetext={`${Math.round(pos.s * 100)} percent`}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer accent-blue-600"
                    />
                    <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-600">{Math.round(pos.s * 100)}%</span>
                    <button
                      onClick={() => setPos(POS0)}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"
                    >Reset Position</button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">Click and drag image in preview to adjust position</p>
                </div>
              )}
              {imgErr && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{imgErr}</p>}

              <input ref={logoRef} id="st-logo" type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload Brand Logo" onChange={(e) => { onLogo(e.target.files[0]); e.target.value = ""; }} />
              <div
                onDragOver={(e) => { e.preventDefault(); setLogoOver(true); }} onDragLeave={() => setLogoOver(false)}
                onDrop={(e) => { e.preventDefault(); setLogoOver(false); onLogo(e.dataTransfer.files && e.dataTransfer.files[0]); }}
                className={`mt-3 flex items-center gap-3 rounded-xl border border-dashed px-3.5 py-2.5 transition ${logoOver ? "border-blue-500 bg-blue-50/70" : "border-slate-300 bg-white"}`}
              >
                {logo ? (
                  <>
                    <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-100 p-1"><img src={logo.thumb} alt="Your brand logo" className="max-h-full max-w-full object-contain" /></span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{logo.name}</span>
                    <button onClick={() => logoRef.current && logoRef.current.click()} className="rounded-full px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Replace</button>
                    <button onClick={() => setLogo(null)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Remove</button>
                  </>
                ) : (
                  <>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon.Badge className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">Upload Brand Logo (PNG/SVG) <span className="font-normal text-slate-400">optional</span></span>
                      <span className="block text-[11px] text-slate-500">Shown top-left. Without one, your brand name gets an initial badge.</span>
                    </span>
                    <button onClick={() => logoRef.current && logoRef.current.click()} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Browse</button>
                  </>
                )}
              </div>
              {logoErr && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{logoErr}</p>}
            </div>

            <div>
              <label htmlFor="st-brand" className="mb-1.5 block text-sm font-semibold text-slate-900">2. Product &amp; Brand Name</label>
              <input id="st-brand" className={field} value={brand} maxLength={40} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Lumen Glow" />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="st-headline" className="text-sm font-semibold text-slate-900">3. Main Headline {needsHeadline && <span className="font-normal text-rose-600">(required)</span>}</label>
                <span className="text-[11px] font-medium tabular-nums text-slate-400">{headText.length}/60</span>
              </div>
              <input id="st-headline" className={field} value={headText} maxLength={60} onChange={(e) => setHeadText(e.target.value)} placeholder={"STOP SETTLING FOR LESS."} aria-describedby="st-head-help" />
              <p id="st-head-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">Only the headline at the top of the ad. Under 5 characters keeps the default headline.</p>
            </div>

            <div>
              <label htmlFor="st-subtitle" className="mb-1.5 block text-sm font-semibold text-slate-900">Subtitle / Feature</label>
              <input id="st-subtitle" className={field} value={subText} maxLength={50} onChange={(e) => setSubText(e.target.value)} placeholder="e.g. Designed to outperform the rest." />
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">The colored accent line under the headline.</p>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="st-hook" className="text-sm font-semibold text-slate-900">Details {needsDetails ? <span className="font-normal text-rose-600">(required)</span> : <span className="font-normal text-slate-400">(optional)</span>}</label>
                <span className="text-[11px] font-medium tabular-nums text-slate-400">{hook.length}/120</span>
              </div>
              <input id="st-hook" className={field} value={hook} maxLength={120} onChange={(e) => setHook(e.target.value)} placeholder="Reviews, features or numbers for this layout" aria-describedby="st-hook-help" />
              <p id="st-hook-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">{DETAILS_HELP[activeLayout]}</p>
            </div>

            <fieldset className="rounded-2xl border border-slate-200 p-4">
              <legend className="px-1.5 text-sm font-semibold text-slate-900">Overlay badges</legend>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="st-badge" className="mb-1 block text-xs font-semibold text-slate-600">{layout === "press" ? "Publication name" : "Badge text"}</label>
                  <input id="st-badge" className={field} value={badge} maxLength={28} onChange={(e) => setBadge(e.target.value)} placeholder={layout === "press" ? "e.g. the outlet that quoted you" : "e.g. Back in stock"} />
                </div>
                <div>
                  <label htmlFor="st-sub" className="mb-1 block text-xs font-semibold text-slate-600">Sub-badge</label>
                  <input id="st-sub" className={field} value={sub} maxLength={40} onChange={(e) => setSub(e.target.value)} placeholder="e.g. Only 14 left in stock" />
                </div>
                <div>
                  <label htmlFor="st-oldway" className="mb-1 block text-xs font-semibold text-slate-600">Old way points <span className="font-normal text-slate-400">(Split Comparison variation)</span></label>
                  <input id="st-oldway" className={field} value={oldWay} maxLength={90} onChange={(e) => setOldWay(e.target.value)} placeholder="e.g. Harsh formulas, Slow results" />
                </div>
                {layout === "hero" && (
                  <div>
                    <label htmlFor="st-pills" className="mb-1 block text-xs font-semibold text-slate-600">{tpl.art.kind === "restock" ? "Size pills" : "Option pills"} <span className="font-normal text-slate-400">(comma separated)</span></label>
                    <input id="st-pills" className={field} value={pills} maxLength={60} onChange={(e) => setPills(e.target.value)} placeholder="e.g. S, M, L, XL" />
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Clear a field to remove it from the ad. Only claim what is true, such as stock levels, sizes and offers.</p>
            </fieldset>

            <div>
              <button
                onClick={generate} disabled={!canGen || gen}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none"
              >
                {gen ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                ) : (
                  <Icon.Wand className="h-4 w-4" />
                )}
                {gen ? "Synthesizing…" : seed >= 0 ? "Generate New Variations" : "Generate Ad Variations"}
              </button>
              
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Why this template converts · {tpl.framework}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {tpl.why.map((w) => (
                  <li key={w} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                    <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Icon.Check className="h-2.5 w-2.5" /></span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* BOTTOM ACTION BAR */}
        <footer className="max-h-[42vh] overflow-y-auto border-t border-slate-100 bg-white px-6 py-4 md:px-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-start">
            <div>
              <button
                onClick={download} disabled={!ready || saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Icon.Download className="h-4 w-4" />
                {saving ? "Preparing…" : "Download Ad Creative (PNG)"}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {why || (tall ? "Video templates export the 9:16 opening frame. Use it as the hook frame or thumbnail. No button is painted on the image." : "Exports at full 1080×1350 resolution. No button is painted on the image.")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {captions ? (
                captions.map((cp, i) => (
                  <div key={i} className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{cp.label}</span>
                      <span className="text-[11px] font-medium text-slate-400">{cp.kind}</span>
                    </div>
                    <p className="mt-2 flex-1 text-[13px] leading-relaxed text-slate-800">{cp.text}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-[11px] font-medium tabular-nums ${!tall && cp.text.length > 125 ? "text-amber-600" : "text-slate-400"}`}>{cp.text.length}{tall ? "" : "/125 before See more"}</span>
                      <button onClick={() => copyCap(cp.text)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
                        <Icon.Copy className="h-3.5 w-3.5" /> Copy Caption
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="col-span-full rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                  Type your Main Headline (5+ characters) to get 2 suggested captions tailored to this {tall ? "video" : "static"} format.
                </p>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export { VW, F_HEAD, F_BODY, F_HAND, KIND_LAYOUT, mkTheme, PALETTES, templateTheme, FRAMES, VARIANT_DEFS, BASE_VARIANT, makeVariants, DEF_HEAD, DEF_SUB, DEF_REVIEWS, clean, parseItems, markupWords, autoWords, HEADLINE_REQUIRED, DETAILS_REQUIRED, okText, parseReceipt, moneyNum, receiptTotals, buildConfig, txt, wrapWords, fitWords, drawLines, plainWords, POS0, OVERSCAN, coverWin, drawCover, drawSlot, badgeIcon, drawStars, drawBrand, drawBackground, P, BOT, HEAD, PHOTO_LAYOUTS, rgba, photoBg, headline, drawSubtitle, drawBadges, drawPillsRow, layoutHero, layoutSplit, layoutMyth, layoutReview, layoutCompare, layoutList, layoutQuote, topShade, darkPanel, fitOne, drawCallouts, NODE_SLOTS, glass, verifiedPill, layoutVHero, layoutVCompare, layoutVQuote, layoutVNodes, layoutIngr, layoutMarker, layoutReceipt, layoutTweet, layoutDM, layoutPress, layoutBA, layoutChart, layoutStoplight, LAYOUTS, renderCreative, readProductImage, DETAILS_HELP, captionsFor, badgeDefaults, slugify, StudioModal };
