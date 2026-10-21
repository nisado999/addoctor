import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "./ui";
import { field, copyText, SPY_API } from "./shared.js";
import { apiFetch } from "./api.js";
import { makeCost } from "./billing.js";
import { track } from "./track.js";
import { TEMPLATE_IMGS, TEMPLATE_VIDS } from "./templateImgs.js";
import { saveMyAd } from "./myads.jsx";

gsap.registerPlugin(useGSAP);
const calm = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Two ways to use a template: put your logo on it as it is (BrandModal), or brief a new one in its style (InspireModal). */

function useModal(onClose) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

function Shell({ title, sub, icon, onClose, children, footer, studio }) {
  return (
    <div className="dlg-veil fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className={`relative flex max-h-[94dvh] w-full ${studio ? "sx-pop max-w-5xl" : "max-w-3xl"} flex-col overflow-hidden dlg-panel rounded-t-[28px] sm:rounded-[28px]`}
      >
        {studio && <button onClick={onClose} aria-label="Close" className="sx-close absolute right-5 top-5 z-30 grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15"><Icon.Close className="h-4 w-4" /></button>}
        {!studio && <header className="dlg-head flex items-start gap-3.5 px-6 py-5 md:px-8">
          <span className="dlg-icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl">{icon}</span>
          <div className="min-w-0 flex-1 pr-8">
            <h2 className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-slate-950">{title}</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">{sub}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 dlg-close rounded-full p-2 text-slate-500 hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">
            <Icon.Close className="h-4 w-4" />
          </button>
        </header>}
        <div className={`min-h-0 flex-1 overflow-y-auto ${studio ? "bg-white" : "bg-slate-50/50 px-6 py-6 md:px-8"}`}>{children}</div>
        {footer && <footer className={`flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-white ${studio ? "px-8 py-4 md:px-12" : "px-6 py-4 md:px-8"}`}>{footer}</footer>}
      </div>
    </div>
  );
}

/* Studio-style helpers for the product window. */
function Step({ n, title, hint, htmlFor, done, children }) {
  const Head = htmlFor ? "label" : "p";
  return (
    <div className="sx-step">
      <Head {...(htmlFor ? { htmlFor } : {})} className="mb-3.5 flex items-start gap-3.5">
        <span className={`sx-num ${done ? "is-done" : ""}`}>
          {done ? <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg> : n}
        </span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold leading-tight text-slate-950">{title}</span><span className="mt-1 block text-xs text-slate-400">{hint}</span></span>
      </Head>
      <div className="sm:pl-[34px]">{children}</div>
    </div>
  );
}

function Switch({ on, onChange, label, id }) {
  return <button id={id} type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`sx-switch ${on ? "is-on" : ""}`}><span /></button>;
}

const lab = "mb-1.5 block text-xs font-semibold text-slate-700";
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none";

/* ------------------------------ Add my logo ------------------------------ */

const SPOTS = [["tl", "Top left"], ["tc", "Top centre"], ["tr", "Top right"], ["bl", "Bottom left"], ["bc", "Bottom centre"], ["br", "Bottom right"]];
const PAD = 0.05; // margin from the edges, as a share of the frame width

/* Where the logo sits inside a w x h frame. Shared by the live preview and the export so they always match. */
function logoBox(spot, w, h, logoRatio, size) {
  const lw = w * size, lh = lw / logoRatio, m = w * PAD;
  const x = spot[1] === "l" ? m : spot[1] === "r" ? w - lw - m : (w - lw) / 2;
  const y = spot[0] === "t" ? m : h - lh - m;
  return { x, y, lw, lh };
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("image")); im.src = src; });
}

async function exportImage(tpl, logo, spot, size) {
  const base = await loadImage(TEMPLATE_IMGS[tpl.id]);
  const c = document.createElement("canvas");
  c.width = base.naturalWidth * 2; c.height = base.naturalHeight * 2;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(base, 0, 0, c.width, c.height);
  const b = logoBox(spot, c.width, c.height, logo.ratio, size);
  ctx.drawImage(logo.img, b.x, b.y, b.lw, b.lh);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  saveBlob(blob, `${tpl.id}-branded.png`);
}

/* Plays the clip once into a canvas with the logo drawn on top, and records the canvas. */
function exportVideo(tpl, logo, spot, size, onProgress) {
  return new Promise((resolve, reject) => {
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) return reject(new Error("unsupported"));
    const v = document.createElement("video");
    v.src = TEMPLATE_VIDS[tpl.id]; v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onerror = () => reject(new Error("video"));
    v.onloadedmetadata = () => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      const b = logoBox(spot, c.width, c.height, logo.ratio, size);
      const paint = () => { ctx.drawImage(v, 0, 0, c.width, c.height); ctx.drawImage(logo.img, b.x, b.y, b.lw, b.lh); };
      const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 5000000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => { saveBlob(new Blob(chunks, { type }), `${tpl.id}-branded.${type.includes("mp4") ? "mp4" : "webm"}`); resolve(); };
      let raf = 0;
      const loop = () => { paint(); onProgress(Math.min(1, v.currentTime / (v.duration || 1))); if (!v.ended) raf = requestAnimationFrame(loop); };
      v.onended = () => { cancelAnimationFrame(raf); paint(); setTimeout(() => rec.stop(), 120); };
      rec.start();
      v.play().then(loop).catch(reject);
    };
  });
}

function readLogo(file, notify) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { notify("Use a PNG, JPG, WEBP or SVG logo."); return resolve(null); }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const img = await loadImage(reader.result);
        resolve({ src: reader.result, img, ratio: (img.naturalWidth || 300) / (img.naturalHeight || 150), name: file.name });
      } catch (e) { notify("That logo file could not be read."); resolve(null); }
    };
    reader.readAsDataURL(file);
  });
}

/* Makes the logo's plain background transparent. It starts from the edges and clears every pixel that is close to the
   background colour (the average of the four corners) and connected to the edge, so the logo's own colours inside stay.
   "tol" is how different from the background a pixel may be and still count as background. */
async function cutBackground(logo, tol) {
  const max = 900;
  const k = Math.min(1, max / Math.max(logo.img.naturalWidth, logo.img.naturalHeight));
  const w = Math.max(1, Math.round(logo.img.naturalWidth * k)), h = Math.max(1, Math.round(logo.img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(logo.img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h), d = im.data;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((i) => i * 4);
  if (corners.every((i) => d[i + 3] < 12)) return logo;      // already transparent at the corners
  const bg = [0, 1, 2].map((ch) => corners.reduce((s, i) => s + d[i + ch], 0) / 4);
  const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
  const hi = tol * 1.6;                                      // between tol and hi the edge fades out instead of cutting hard
  const seen = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { const p = y * w + x; if (!seen[p] && dist(p * 4) <= hi) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue;
    const dd = dist(p * 4);
    d[p * 4 + 3] = dd <= tol ? 0 : Math.round(d[p * 4 + 3] * ((dd - tol) / (hi - tol)));
  }
  ctx.putImageData(im, 0, 0);
  const src = c.toDataURL("image/png");
  const img = await loadImage(src);
  return { ...logo, src, img, ratio: w / h };
}

/* ------------------------------ Write my own text ------------------------------ */

/* Typed text, drawn as it is written. Sizes are in font sizes (em) and shares of the frame width, so the live preview
   and the export use the same numbers. */
const TEXT_THEMES = [
  { id: "bold", name: "Bold", family: '"Arial Black", Impact, "Segoe UI", sans-serif', weight: 900, style: "normal", ink: "#ffffff", shadow: true },
  { id: "ink", name: "Ink", family: '"Segoe UI", Arial, sans-serif', weight: 800, style: "normal", ink: "#0b0b0f" },
  { id: "tag", name: "Tag", family: '"Segoe UI", Arial, sans-serif', weight: 800, style: "normal", ink: "#0b0b0f", box: "#ffffff" },
  { id: "red", name: "Red", family: '"Arial Black", Impact, "Segoe UI", sans-serif', weight: 900, style: "normal", ink: "#ffffff", box: "#e11d48" },
  { id: "outline", name: "Outline", family: '"Arial Black", Impact, "Segoe UI", sans-serif', weight: 900, style: "normal", ink: "#ffffff", stroke: "#0b0b0f" },
  { id: "script", name: "Script", family: 'Georgia, "Times New Roman", serif', weight: 600, style: "italic", ink: "#ffffff", shadow: true },
];
/* Fonts for the typed text. "theme" keeps the font of the style; the others replace it. All of them are installed on Windows and Mac. */
const TEXT_FONTS = [
  { id: "theme", name: "Style font", family: null },
  { id: "sans", name: "Sans", family: '"Segoe UI", Arial, sans-serif', weight: 800, style: "normal" },
  { id: "heavy", name: "Heavy", family: '"Arial Black", Arial, sans-serif', weight: 900, style: "normal" },
  { id: "impact", name: "Impact", family: 'Impact, "Arial Narrow", sans-serif', weight: 400, style: "normal" },
  { id: "condensed", name: "Condensed", family: '"Franklin Gothic Medium", "Arial Narrow", sans-serif', weight: 700, style: "normal" },
  { id: "rounded", name: "Rounded", family: 'Verdana, "Trebuchet MS", sans-serif', weight: 800, style: "normal" },
  { id: "serif", name: "Serif", family: 'Georgia, "Times New Roman", serif', weight: 700, style: "normal" },
  { id: "elegant", name: "Elegant", family: '"Palatino Linotype", Palatino, "Book Antiqua", serif', weight: 600, style: "italic" },
  { id: "mono", name: "Mono", family: '"Courier New", Courier, monospace', weight: 700, style: "normal" },
  { id: "hand", name: "Handwritten", family: '"Segoe Script", cursive', weight: 700, style: "normal" },
];
/* Colours for typed text: the letters, and the box behind them (the box can also be left off). */
const TEXT_COLORS = ["#ffffff", "#0b0b0f", "#e11d48", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#8b5cf6"];
/* Quick offers: one tap adds the line as a new text on the ad. */
const TEXT_OFFERS = ["50% off", "Buy 1 get 1 free", "Free shipping", "Limited time", "Shop now", "New arrival"];
/* One text on the ad. Its colour and box are optional: color null keeps the style's ink, box null keeps the style's box, box false has none. */
let textSeq = 0;
function newText(n, val = "") {
  textSeq += 1;
  return { id: `t${textSeq}`, val, theme: "bold", font: "theme", color: null, box: null, w: null, x: 0.5, y: 0.3 + 0.2 * (n % 4), s: 0.09, r: 0, bend: 0 };
}
/* The look of one text: its style, with the font, ink and box chosen for it on top. */
function layerTheme(l) {
  const base = TEXT_THEMES.find((t) => t.id === l.theme) || TEXT_THEMES[0];
  const font = TEXT_FONTS.find((f) => f.id === l.font);
  const t = font && font.family ? { ...base, family: font.family, weight: font.weight, style: font.style } : { ...base };
  if (l.color) t.ink = l.color;
  if (l.box === false) t.box = undefined;
  else if (l.box) t.box = l.box;
  return t;
}
/* The curved arrow the rotate dot shows, so it reads as a turn and not a grab. The dark stroke has a white edge, so it shows on any photo. */
const ROTATE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'><g fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='M21 13a8 8 0 1 1-2.6-5.9' stroke='white' stroke-width='4.5'/><path d='M18.4 2.6v4.5h-4.5' stroke='white' stroke-width='4.5'/><path d='M21 13a8 8 0 1 1-2.6-5.9' stroke='black' stroke-width='2'/><path d='M18.4 2.6v4.5h-4.5' stroke='black' stroke-width='2'/></g></svg>";
// Encoded, so the browser reads it as an image. The fallback is a crosshair, never a hand.
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 13 13, crosshair`;
const TEXT_MAX = 0.84;   // a line may take this share of the frame width at most
const TEXT_LH = 1.2;     // line height
const TEXT_PAD = 0.45;   // side padding of a boxed theme (top and bottom are 0.3)
let measurer = null;

function measureText(text, theme) {
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  measurer.font = `${theme.style} ${theme.weight} 1000px ${theme.family}`;
  return measurer.measureText(text).width / 1000;
}

/* Breaks the text into lines: the user's own line breaks, plus a wrap where a line would get too wide. */
function layoutText(text, theme, s, boxW) {
  const room = (boxW || TEXT_MAX) / s - (theme.box ? 2 * TEXT_PAD : 0);
  const lines = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureText(next, theme) > room) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/* Draws the lines centred on (cx, cy) of a canvas that is W pixels wide. */
function drawText(ctx, lines, theme, cx, cy, s, W, boxW) {
  const F = s * W, lh = TEXT_LH * F;
  const padX = theme.box ? TEXT_PAD * F : 0, padY = theme.box ? 0.3 * F : 0;
  ctx.font = `${theme.style} ${theme.weight} ${F}px ${theme.family}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const w = boxW ? boxW * W : Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * padX;   // a set width is the box the user stretched
  const h = lines.length * lh + 2 * padY;
  const top = cy - h / 2;
  if (theme.box) { ctx.fillStyle = theme.box; ctx.beginPath(); ctx.roundRect(cx - w / 2, top, w, h, 0.22 * F); ctx.fill(); }
  ctx.fillStyle = theme.ink;
  ctx.strokeStyle = theme.stroke || theme.ink; ctx.lineWidth = 0.16 * F; ctx.lineJoin = "round";
  if (theme.shadow) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 0.12 * F; ctx.shadowOffsetY = 0.05 * F; }
  lines.forEach((l, i) => {
    const y = top + padY + (i + 0.5) * lh;
    if (theme.stroke) ctx.strokeText(l, cx, y);
    ctx.fillText(l, cx, y);
  });
  ctx.shadowColor = "rgba(0,0,0,0)"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

/* Curved text: every glyph sits on a gentle arc. Positions are shares of the frame width, centred on the text block. bend 0 is straight. */
function arcGlyphs(lines, theme, s, bend) {
  if (!lines.length) return { list: [], minX: 0, minY: 0, w: 0, h: 0 };
  const A = 0.6 * s;
  const list = [];
  lines.forEach((line, row) => {
    const chars = [...line];
    const widths = chars.map((ch) => measureText(ch, theme) * s);
    const total = widths.reduce((a, b) => a + b, 0);
    const half = Math.max(total / 2, 1e-6);
    const y0 = (row + 0.5 - lines.length / 2) * TEXT_LH * s;
    let x = -total / 2;
    chars.forEach((ch, j) => {
      const cx = x + widths[j] / 2;
      x += widths[j];
      const u = cx / half;
      list.push({ ch, x: cx, y: y0 - bend * A * (1 - u * u), a: (Math.atan((2 * bend * A * u) / half) * 180) / Math.PI });
    });
  });
  const xs = list.map((g) => g.x), ys = list.map((g) => g.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { list, minX, minY, w: maxX - minX + s, h: maxY - minY + TEXT_LH * s };
}

/* Draws curved glyphs around (0, 0) of the canvas's current transform, sized as drawText sizes them. */
function drawArc(ctx, glyphs, theme, s, W) {
  const F = s * W;
  ctx.font = `${theme.style} ${theme.weight} ${F}px ${theme.family}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = theme.ink; ctx.strokeStyle = theme.stroke || theme.ink; ctx.lineWidth = 0.16 * F; ctx.lineJoin = "round";
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x * W, g.y * W); ctx.rotate((g.a * Math.PI) / 180);
    if (theme.stroke) ctx.strokeText(g.ch, 0, 0);
    ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
}

/* The same look as drawText, for the live preview on the frame. The frame is a size container, so cqw is its width. */
function textCss(theme, s, boxW) {
  return {
    width: boxW ? `${boxW * 100}cqw` : undefined, boxSizing: boxW ? "border-box" : undefined,
    fontFamily: theme.family, fontWeight: theme.weight, fontStyle: theme.style, fontSize: `${s * 100}cqw`,
    lineHeight: TEXT_LH, color: theme.ink, whiteSpace: "pre", textAlign: "center",
    textShadow: theme.shadow ? "0 0.05em 0.12em rgba(0,0,0,0.45)" : undefined,
    WebkitTextStroke: theme.stroke ? `0.16em ${theme.stroke}` : undefined,
    paintOrder: theme.stroke ? "stroke fill" : undefined,
    background: theme.box, borderRadius: theme.box ? "0.22em" : undefined,
    padding: theme.box ? "0.3em 0.45em" : undefined,
  };
}

/* Handles on a placed logo or text: the four corners resize it, the dot above rotates it. They sit inside the rotated box, so they turn with it. */
function Handles({ onHandle, onMove, onUp, wide }) {
  const corners = [[0, 0], [100, 0], [0, 100], [100, 100]];
  const sides = [[0, 50], [100, 50]];
  const dot = "absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-slate-950 bg-white shadow-sm pointer-events-auto";
  return (
    <div className="pointer-events-none absolute inset-0" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {corners.map(([x, y], i) => (
        <span key={i} role="presentation" title="Drag to resize" onPointerDown={(e) => onHandle(e, "scale")} className={`${dot} cursor-nwse-resize`} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {wide && sides.map(([x, y], i) => (
        <span key={`w${i}`} role="presentation" title="Drag to make the box wider or narrower" onPointerDown={(e) => onHandle(e, "width")} className={`${dot} cursor-ew-resize`} style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      <span role="presentation" title="Drag to rotate" onPointerDown={(e) => onHandle(e, "rotate")} className={dot} style={{ left: "50%", top: "-24px", cursor: ROTATE_CURSOR }} />
    </div>
  );
}

function LogoDrop({ logo, onLogo, notify, quiet }) {
  const fileRef = useRef(null);
  const take = async (file) => { const l = await readLogo(file, notify); if (l) onLogo(l); };
  return (
    <>
      <button
        type="button" onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-left transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"
      >
        <span className={quiet ? "grid h-6 w-6 shrink-0 place-items-center text-slate-900" : "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-900"}><Icon.Upload className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{logo ? logo.name : "Upload your logo"}</span>
          <span className="block text-xs text-slate-500">{logo ? "Click to choose a different file." : "PNG with a transparent background works best. It never leaves your browser."}</span>
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => take(e.target.files[0])} />
    </>
  );
}

function BrandModal({ tpl, onClose, notify }) {
  useModal(onClose);
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
  const [logo, setLogo] = useState(null); // { src, img, ratio, name }
  const [spot, setSpot] = useState("br");
  const [size, setSize] = useState(0.26);
  const [busy, setBusy] = useState(null); // null | 0..1

  const download = async () => {
    if (!logo || busy !== null) return;
    setBusy(0);
    try {
      if (isVideo) await exportVideo(tpl, logo, spot, size, setBusy);
      else await exportImage(tpl, logo, spot, size);
      notify(isVideo ? "Branded video downloaded" : "Branded image downloaded");
    } catch (e) {
      notify(e.message === "unsupported" ? "This browser cannot export video. Try Chrome or Edge on a computer." : "The download failed. Please try again.", 3200);
    }
    setBusy(null);
  };

  // The preview positions the logo with the same maths as the export, in percentages of the frame.
  const frame = isVideo ? [9, 16] : [4, 5];
  const pv = logo ? logoBox(spot, 100, (100 * frame[1]) / frame[0], logo.ratio, size) : null;

  return (
    <Shell
      title="Add my logo" sub={`${tpl.title} · your logo goes straight onto this ${isVideo ? "video" : "image"}, nothing else changes.`}
      icon={<Icon.Image className="h-5 w-5" />} onClose={onClose}
      footer={
        <>
          {busy !== null && isVideo && <span className="mr-auto text-xs font-medium tabular-nums text-slate-500">Rendering… {Math.round(busy * 100)}%. Keep this tab open.</span>}
          <button onClick={download} disabled={!logo || busy !== null} className={primaryBtn}>
            <Icon.Download className="h-4 w-4" /> {busy !== null ? "Working…" : `Download branded ${isVideo ? "video" : "image"}`}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_1fr]">
        <div className="mx-auto w-full max-w-[240px]">
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-sm" style={{ aspectRatio: `${frame[0]} / ${frame[1]}` }}>
            {isVideo
              ? <video src={TEMPLATE_VIDS[tpl.id]} poster={TEMPLATE_IMGS[tpl.id]} muted loop autoPlay playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
              : <img src={TEMPLATE_IMGS[tpl.id]} alt={tpl.title} className="absolute inset-0 h-full w-full object-cover" />}
            {logo && <img src={logo.src} alt="Your logo" className="absolute" style={{ left: `${pv.x}%`, top: `${(pv.y / ((100 * frame[1]) / frame[0])) * 100}%`, width: `${pv.lw}%` }} />}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Live preview</p>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <span className={lab}>1. Your logo</span>
<LogoDrop logo={logo} onLogo={setLogo} notify={notify} />
          </div>

          <div>
            <span className={lab}>2. Position</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Logo position">
              {SPOTS.map(([id, name]) => (
                <button key={id} onClick={() => setSpot(id)} aria-pressed={spot === id} className={`rounded-xl border px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 ${spot === id ? "border-slate-300 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{name}</button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="logo-size" className={lab}>3. Size <span className="font-normal text-slate-400">({Math.round(size * 100)}% of the width)</span></label>
            <input id="logo-size" type="range" min="0.1" max="0.6" step="0.01" value={size} onChange={(e) => setSize(+e.target.value)} className="w-full accent-blue-600" />
          </div>

          <p className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs leading-relaxed text-slate-500">
            {isVideo ? "The video is rendered in your browser at its original size, which takes as long as the clip itself. It saves as MP4 where the browser supports it, otherwise WebM." : "The image is saved as a PNG at twice the template's size."}
          </p>
        </div>
      </div>
    </Shell>
  );
}

/* ----------------------- Make a new one inspired by it ----------------------- */

const GEN_COST = 5;
const GEN_STEPS = ["Reading the reference clip…", "Building the scene around your product…", "Rendering 8 seconds of video…", "Placing your logo…", "Final checks…"];
const GEN_MS = 7500;

/* The video engine is not connected yet, so the result is the reference clip carrying the user's logo.
   Everything around it (form, credits, progress, result, download, caption) is the finished flow. */
function InspireModal({ tpl, onClose, notify, credits = 0, onSpend }) {
  useModal(onClose);
  const [f, setF] = useState({ brand: "", product: "", notes: "" });
  const [logo, setLogo] = useState(null);
  const [spot, setSpot] = useState("br");
  const [stage, setStage] = useState("form"); // form | working | done
  const [p, setP] = useState(0);
  const [busy, setBusy] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const brand = f.brand.trim();
  const ready = brand.length > 1 && f.product.trim().length > 1;

  useEffect(() => {
    if (stage !== "working") return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const x = Math.min(1, (Date.now() - t0) / GEN_MS);
      setP(x);
      if (x >= 1) { clearInterval(id); setStage("done"); }
    }, 120);
    return () => clearInterval(id);
  }, [stage]);

  const generate = () => {
    if (!ready) return;
    if (credits < GEN_COST) { notify("Not enough credits for a video. Each one uses " + GEN_COST + "."); return; }
    if (onSpend) onSpend(GEN_COST);
    setP(0);
    setStage("working");
  };

  const download = async () => {
    if (busy !== null) return;
    setBusy(0);
    try {
      if (logo) await exportVideo(tpl, logo, spot, 0.24, setBusy);
      else { const blob = await (await fetch(TEMPLATE_VIDS[tpl.id])).blob(); saveBlob(blob, tpl.id + ".mp4"); }
      notify("Video downloaded");
    } catch (e) {
      notify(e.message === "unsupported" ? "This browser cannot export video. Try Chrome or Edge on a computer." : "The download failed. Please try again.", 3200);
    }
    setBusy(null);
  };

  const caption = `${tpl.headline}. ${tpl.primary.split(". ")[0]}.`.replace(/\.\./g, ".") + (brand ? ` ${brand}.` : "");
  const copyCaption = async () => { const ok = await copyText(caption); notify(ok ? "Caption copied" : "Copy failed. Select the text and copy it by hand.", 2400); };
  const pv = logo ? logoBox(spot, 100, (100 * 16) / 9, logo.ratio, 0.24) : null;
  const step = Math.min(GEN_STEPS.length - 1, Math.floor(p * GEN_STEPS.length));

  const preview = (
    <div className="mx-auto w-full max-w-[220px]">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-sm">
        <video src={TEMPLATE_VIDS[tpl.id]} poster={TEMPLATE_IMGS[tpl.id]} muted loop autoPlay playsInline disablePictureInPicture className={`absolute inset-0 h-full w-full object-cover transition duration-500 ${stage === "working" ? "scale-105 blur-md brightness-75" : ""}`} />
        {logo && stage !== "working" && <img src={logo.src} alt="Your logo" className="absolute" style={{ left: `${pv.x}%`, top: `${(pv.y / ((100 * 16) / 9)) * 100}%`, width: `${pv.lw}%` }} />}
        {stage === "working" && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-sm font-semibold tabular-nums text-slate-900 shadow-lg">{Math.round(p * 100)}%</span>
          </div>
        )}
        {stage === "done" && <span className="absolute left-2.5 top-2.5 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">READY · 0:08</span>}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">{stage === "form" ? "Reference" : stage === "working" ? "Generating" : "Your video"}</p>
    </div>
  );

  return (
    <Shell
      title={stage === "done" ? "Your video is ready" : "Make a new one inspired by it"}
      sub={`${tpl.title} · a new video in this style, with your brand, product and logo.`}
      icon={<Icon.Wand className="h-5 w-5" />} onClose={onClose}
      footer={
        stage === "form" ? (
          <>
            <span className="mr-auto text-xs text-slate-500">Uses <b className="font-semibold text-slate-700">{GEN_COST} credits</b> · {credits} left</span>
            <button onClick={generate} disabled={!ready} className={primaryBtn}><Icon.Sparkle className="h-4 w-4" /> Generate video</button>
          </>
        ) : stage === "working" ? (
          <span className="mr-auto text-xs font-medium text-slate-500">This takes a few seconds. Keep this window open.</span>
        ) : (
          <>
            {busy !== null && logo && <span className="mr-auto text-xs font-medium tabular-nums text-slate-500">Preparing file… {Math.round(busy * 100)}%</span>}
            <button onClick={() => setStage("form")} className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20">Change and regenerate</button>
            <button onClick={download} disabled={busy !== null} className={primaryBtn}><Icon.Download className="h-4 w-4" /> {busy !== null ? "Working…" : "Download video"}</button>
          </>
        )
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,220px)_1fr]">
        {preview}

        {stage === "form" && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="in-brand" className={lab}>Brand name</label>
                <input id="in-brand" value={f.brand} onChange={set("brand")} maxLength={40} placeholder="e.g. Lumen Glow" className={field} />
              </div>
              <div>
                <label htmlFor="in-product" className={lab}>Product to show</label>
                <input id="in-product" value={f.product} onChange={set("product")} maxLength={80} placeholder="e.g. a black oversized hoodie" className={field} />
              </div>
            </div>
            <div>
              <span className={lab}>Your logo <span className="font-normal text-slate-400">(optional)</span></span>
              <LogoDrop logo={logo} onLogo={setLogo} notify={notify} />
            </div>
            {logo && (
              <div>
                <span className={lab}>Logo position</span>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Logo position">
                  {SPOTS.map(([id, name]) => (
                    <button key={id} onClick={() => setSpot(id)} aria-pressed={spot === id} className={`rounded-xl border px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 ${spot === id ? "border-slate-300 bg-slate-100 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{name}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="in-notes" className={lab}>Anything to change <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="in-notes" value={f.notes} onChange={set("notes")} maxLength={160} placeholder="e.g. shoot it at night, use a female model" className={field} />
            </div>
          </div>
        )}

        {stage === "working" && (
          <div className="flex flex-col justify-center gap-4" role="status" aria-live="polite">
            <p className="text-base font-semibold text-slate-900">Generating your video…</p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-slate-950 transition-all duration-150" style={{ width: `${p * 100}%` }} /></div>
            <ul className="space-y-2 text-sm">
              {GEN_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 ${i < step ? "text-slate-400" : i === step ? "font-medium text-slate-900" : "text-slate-300"}`}>
                  <span className={`grid h-4 w-4 place-items-center rounded-full ${i < step ? "bg-emerald-500 text-white" : i === step ? "bg-slate-950" : "bg-slate-200"}`}>{i < step && <Icon.Check className="h-2.5 w-2.5" />}</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Icon.Check className="h-4 w-4" /> {brand}: 8-second vertical video, ready to post</p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800/80">Made in the style of {tpl.title}, showing {f.product.trim()}{logo ? ", with your logo" : ""}.</p>
            </div>
            <div>
              <span className={lab}>Suggested caption</span>
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3.5">
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-700">{caption}</p>
                <button onClick={copyCaption} aria-label="Copy caption" className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"><Icon.Copy className="h-4 w-4" /></button>
              </div>
            </div>
            <div>
              <span className={lab}>Post it as</span>
              <div className="flex flex-wrap gap-1.5">
                {["Instagram Reels", "TikTok", "Facebook Reels", "YouTube Shorts"].map((x) => <span key={x} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">{x}</span>)}
              </div>
            </div>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
              <b className="font-semibold">Demo result.</b> The video engine is not connected in this build, so this shows the reference clip{logo ? " with your logo" : ""}. The steps, credits and download work as they will in the finished product.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* --------------------------- Make it with my product --------------------------- */
/* The template is the style, the visitor's photos are the product. The server returns a new 4:5 ad, which can then
   be changed with a typed instruction, scored, and fixed from the score. */


/* A photo as a JPEG data URL no wider or taller than max, so uploads stay small. */
function shrinkPhoto(src, max = 1400, q = 0.9) {
  return loadImage(src).then((im) => {
    const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);   // transparent PNGs get a white background
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q);
  });
}
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// apiFetch sends the visitor's sign-in token; a bare fetch here made the server treat signed-in users as anonymous.
const makeCall = (path, body, signal) => apiFetch(path, { body, signal, timeout: 180000 });

const SIZES = [["9:16", "Story or Reel", 9 / 16], ["4:5", "Feed", 4 / 5], ["1:1", "Square", 1], ["16:9", "Wide", 16 / 9]];
const sizeKey = (ar) => { const [w, h] = String(ar).split("/").map(Number); const v = w / h; return SIZES.reduce((a, b) => (Math.abs(b[2] - v) < Math.abs(a[2] - v) ? b : a))[0]; };
const FREE_CHANGES = 2;   // keep in step with FREE_EDITS in api/worker.js
function ProductModal({ tpl, onClose, onBack, notify, onSpend }) {
  useModal(onClose);
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
  const inspired = tpl.mode === "inspired";          // a new ad in this mood, not a one-to-one copy
  const [photos, setPhotos] = useState([]);          // [{ src, name }]
  const [headline, setHeadline] = useState(tpl.headline || "");
  const [note, setNote] = useState("");
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState("");              // "" | what is happening now
  const [err, setErr] = useState("");
  const editing = !!tpl.editImage;                   // a saved ad opened from the Vault: start from its picture, no template to rebuild from
  const [ad, setAd] = useState(tpl.editImage || "");  // the current result, a data URL
  const [past, setPast] = useState([]);              // earlier results, newest last, for Undo
  const [fix, setFix] = useState("");
  const [review, setReview] = useState(null);
  const [logo, setLogo] = useState(null);            // the logo being placed on the finished ad
  const [logoOpen, setLogoOpen] = useState(false);
  const [lp, setLp] = useState({ x: 0.82, y: 0.9, s: 0.22, r: 0 });   // logo centre and width, as shares of the frame, and its turn in degrees
  const fileRef = useRef(null);
  const ctrl = useRef(null);
  const frameRef = useRef(null);
  const dragging = useRef(false);
  const [logoCut, setLogoCut] = useState(false);     // remove the logo's background
  const [cutTol, setCutTol] = useState(45);
  const [cutLogo, setCutLogo] = useState(null);
  const [variants, setVariants] = useState([]);       // the inspired options from the last run, shown to pick from
  const [grant, setGrant] = useState("");           // the server's pass for this ad: edits that carry it are free until the free changes run out
  const [leftBy, setLeftBy] = useState({});           // free changes left, by grant
  const [vGrants, setVGrants] = useState([]);         // the grant of each inspired option
  const freeLeft = grant ? (leftBy[grant] ?? FREE_CHANGES) : 0;
  const [sizeOpen, setSizeOpen] = useState(false);
  const [sizes, setSizes] = useState({});             // the same ad in other placements, by ratio. Made only when asked for
  const [placement, setPlacement] = useState("");    // fashion: where and how big the customer's logo or print goes on the garment
  const fashion = tpl.category === "Fashion" && !editing;
  const tall = isVideo && !editing;                  // a video template is a full-height frame: use its first frame, not the cropped 4:5 poster
  const [still, setStill] = useState("");
  const [ar, setAr] = useState(tall ? "9 / 16" : "4 / 5");
  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);
  useEffect(() => {
    if (!tall) return undefined;
    let off = false;
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = TEMPLATE_VIDS[tpl.id];
    v.onloadeddata = () => {
      if (off || !v.videoWidth) return;
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0);
        setStill(c.toDataURL("image/jpeg", 0.92));
      } catch (e) { /* the poster stays */ }
    };
    v.load();
    return () => { off = true; v.removeAttribute("src"); v.load(); };
  }, [tall, tpl.id]);
  const templateSrc = tall && still ? still : TEMPLATE_IMGS[tpl.id];
  const shown = ad || templateSrc;
  useEffect(() => {
    if (!shown) return undefined;
    let off = false;
    loadImage(shown).then((im) => { if (!off && im.naturalWidth) setAr(`${im.naturalWidth} / ${im.naturalHeight}`); }).catch(() => {});
    return () => { off = true; };
  }, [shown]);
  useEffect(() => {
    let off = false;
    if (!logo || !logoCut) { setCutLogo(null); return undefined; }
    cutBackground(logo, cutTol).then((r) => { if (!off) setCutLogo(r); }).catch(() => { if (!off) setCutLogo(null); });
    return () => { off = true; };
  }, [logo, logoCut, cutTol]);
  const shownLogo = logoCut && cutLogo ? cutLogo : logo;
  const [textOpen, setTextOpen] = useState(false);   // the text panel is open
  const [texts, setTexts] = useState([]);            // the text layers on the ad, each with its own words and look
  const [activeText, setActiveText] = useState(null); // the layer the panel edits
  const [hov, setHov] = useState(null);              // the ad item under the pointer: "logo", a text id, or null. Only that one shows its frame and handles
  const tDrag = useRef(null);                        // the text layer being dragged
  const hDrag = useRef(null);                        // an active resize or rotate handle
  const panelOpen = logoOpen || textOpen;
  const cur = texts.find((t) => t.id === activeText) || texts[texts.length - 1] || null;
  const curTheme = cur ? layerTheme(cur) : null;
  const laid = textOpen ? texts.map((l) => {
    const theme = layerTheme(l);
    const lines = l.val.trim() ? layoutText(l.val.trim(), theme, l.s, l.bend ? 0 : l.w) : [];
    return { l, theme, lines, arc: l.bend && lines.length ? arcGlyphs(lines, theme, l.s, l.bend) : null };
  }) : [];
  const patchText = (id, patch) => setTexts((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setCur = (patch) => { if (cur) patchText(cur.id, patch); };
  const addText = (val = "") => {
    const l = newText(texts.length, val);
    setTexts((ls) => [...ls, l]); setActiveText(l.id); setTextOpen(true); setLogoOpen(false);
  };
  const openText = () => { if (texts.length) { setLogoOpen(false); setTextOpen(true); } else addText(); };
  const closeText = () => { setTextOpen(false); setTexts([]); setActiveText(null); setHov(null); };
  const removeCur = () => {
    if (!cur) return;
    const rest = texts.filter((l) => l.id !== cur.id);
    setTexts(rest); setHov(null);
    setActiveText(rest.length ? rest[rest.length - 1].id : null);
    if (!rest.length) setTextOpen(false);
  };


  /* ---- motion (GSAP). Scoped to this window and reverted on close; reduced-motion users get none of it. ---- */
  const root = useRef(null), panelRef = useRef(null), stageRef = useRef(null), beamRef = useRef(null), barRef = useRef(null), goRef = useRef(null);
  const [phase, setPhase] = useState(0);
  const PHASES = ["Reading your product photo", "Matching light and shadow", "Placing it in the scene", "Adding the finishing touches"];
  useEffect(() => {
    if (!busy || ad) { setPhase(0); return undefined; }
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 9000);
    return () => clearInterval(t);
  }, [busy, ad]);

  // Opening: the heading rises, the light blooms, the ad settles in. Then the light keeps drifting, slowly.
  useGSAP(() => {
    if (calm()) return;
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".fx-head > *", { y: 16, opacity: 0, duration: 1.2, stagger: 0.07 }, 0.05)
      .from(".fx-glow", { opacity: 0, duration: 2.4, ease: "power2.out" }, 0)
      .from(".fx-ad", { y: 40, scale: 0.95, opacity: 0, duration: 1.5 }, 0.15)
      .from(".fx-cap", { opacity: 0, duration: 1, ease: "power2.out" }, 0.9);
    gsap.to(".sx-blob-a", { x: 70, y: 50, scale: 1.18, duration: 11, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".sx-blob-b", { x: -60, y: 70, scale: 1.12, duration: 13, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".sx-blob-c", { x: 60, y: -50, scale: 1.2, duration: 15, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }, { scope: root });

  // Whenever the right side changes (the form, then the edit tools) its parts glide in one after another.
  useGSAP(() => {
    if (calm() || !panelRef.current) return;
    gsap.fromTo(panelRef.current.children, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.07, ease: "expo.out", delay: 0.1, clearProps: "transform,opacity" });
  }, { dependencies: [!!ad], scope: root });

  // The ad leans gently toward the pointer. Off while a logo is being placed so dragging stays exact.
  useGSAP(() => {
    const el = frameRef.current, st = stageRef.current;
    if (!el || !st) return undefined;
    gsap.set(el, { transformPerspective: 1000 });
    if (calm() || panelOpen) { gsap.to(el, { rotationX: 0, rotationY: 0, duration: 0.6, ease: "power3.out" }); return undefined; }
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.9, ease: "power3.out" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.9, ease: "power3.out" });
    const move = (e) => {
      const r = st.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 10);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    };
    const leave = () => { rx(0); ry(0); };
    st.addEventListener("pointermove", move); st.addEventListener("pointerleave", leave);
    return () => { st.removeEventListener("pointermove", move); st.removeEventListener("pointerleave", leave); };
  }, { dependencies: [panelOpen], scope: root });

  // While working: a thin light scans the ad and a progress line creeps along.
  useGSAP(() => {
    if (!busy || calm() || !beamRef.current) return;
    gsap.fromTo(beamRef.current, { yPercent: -100 }, { yPercent: 100, duration: 1.8, ease: "sine.inOut", repeat: -1, yoyo: true });
    gsap.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 0.93, duration: ad ? 30 : 55, ease: "power1.out" });
  }, { dependencies: [!!busy], scope: root });

  // A new ad arrives: it opens from the centre, a soft flash and one ring pulse.
  useGSAP(() => {
    if (!ad || calm() || !frameRef.current) return;
    gsap.timeline()
      .fromTo("#make-result", { clipPath: "circle(0% at 50% 50%)", scale: 1.14 }, { clipPath: "circle(80% at 50% 50%)", scale: 1, duration: 1.3, ease: "expo.out", clearProps: "clipPath" }, 0)
      .fromTo(".fx-flash", { opacity: 0.7 }, { opacity: 0, duration: 1, ease: "power2.out" }, 0)
      .fromTo(frameRef.current, { scale: 0.96 }, { scale: 1, duration: 1.4, ease: "expo.out" }, 0)
      .fromTo(".fx-pulse", { scale: 1, opacity: 0.6 }, { scale: 1.3, opacity: 0, duration: 1.4, ease: "power2.out" }, 0.05);
  }, { dependencies: [ad], scope: root });

  // The main button is magnetic.
  useGSAP(() => {
    const b = goRef.current;
    if (!b || calm()) return undefined;
    const qx = gsap.quickTo(b, "x", { duration: 0.6, ease: "power3.out" }), qy = gsap.quickTo(b, "y", { duration: 0.6, ease: "power3.out" });
    const move = (e) => { const r = b.getBoundingClientRect(); qx((e.clientX - (r.left + r.width / 2)) * 0.2); qy((e.clientY - (r.top + r.height / 2)) * 0.28); };
    const leave = () => { qx(0); qy(0); };
    b.addEventListener("pointermove", move); b.addEventListener("pointerleave", leave);
    return () => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerleave", leave); };
  });

  const startDrag = (e) => { e.stopPropagation(); e.preventDefault(); setHov("logo"); dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); };
  const moveDrag = (e) => {
    if (!dragging.current || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    setLp((p) => ({ ...p, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }));
  };
  const endDrag = () => { dragging.current = false; };
  const applyLogo = async () => {
    if (!shownLogo || !ad) return;
    try {
      const base = await loadImage(ad);
      const c = document.createElement("canvas");
      c.width = base.naturalWidth; c.height = base.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(base, 0, 0);
      const lw = c.width * lp.s, lh = lw / shownLogo.ratio;
      ctx.save();
      ctx.translate(c.width * lp.x, c.height * lp.y); ctx.rotate(((lp.r || 0) * Math.PI) / 180);
      ctx.drawImage(shownLogo.img, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
      setPast((p) => [...p, ad].slice(-6));
      setAd(c.toDataURL("image/png"));
      setReview(null); setLogoOpen(false); setLogo(null); setLogoCut(false);
      track("ad_logo_added", { template_id: tpl.id, template_category: tpl.category });
    } catch (e) { notify("The logo could not be added. Try another file."); }
  };

  // Draws the typed text that is still in the panel into the image, so it becomes part of the photo. Returns the new image.
  const commitText = async () => {
    const ready = textOpen ? texts.filter((l) => l.val.trim()) : [];
    if (!ad || !ready.length) return ad;
    const base = await loadImage(ad);
    const c = document.createElement("canvas");
    c.width = base.naturalWidth; c.height = base.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base, 0, 0);
    for (const l of ready) {
      const theme = layerTheme(l);
      const lines = layoutText(l.val.trim(), theme, l.s, l.bend ? 0 : l.w);
      ctx.save();
      ctx.translate(c.width * l.x, c.height * l.y); ctx.rotate(((l.r || 0) * Math.PI) / 180);
      if (l.bend) drawArc(ctx, arcGlyphs(lines, theme, l.s, l.bend).list, theme, l.s, c.width);
      else drawText(ctx, lines, theme, 0, 0, l.s, c.width, l.w);
      ctx.restore();
    }
    const url = c.toDataURL("image/png");
    setPast((p) => [...p, ad].slice(-6));
    setAd(url); setReview(null); closeText();
    track("ad_text_added", { template_id: tpl.id, template_category: tpl.category, text_layers: ready.length });
    return url;
  };
  const applyText = async () => {
    try { await commitText(); } catch (e) { notify("The text could not be added. Try again."); }
  };

  // Keeps the finished ad in the Vault, under My ads, so it can be downloaded again later. Text still in the panel goes in first.
  const saveToVault = async () => {
    if (!ad) return;
    try {
      const src = await commitText();
      await saveMyAd({ dataUrl: src, title: tpl.title, category: tpl.category, templateId: tpl.id });
      track("ad_saved_to_vault", { template_id: tpl.id, template_category: tpl.category });
      notify("Saved to your Vault, under My ads");
    } catch (e) { notify(e.message || "The ad could not be saved."); }
  };

  const startTextDrag = (e, id) => { e.stopPropagation(); e.preventDefault(); tDrag.current = id; setHov(id); setActiveText(id); e.currentTarget.setPointerCapture(e.pointerId); };
  const moveTextDrag = (e) => {
    if (!tDrag.current || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    patchText(tDrag.current, { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  const endTextDrag = () => { tDrag.current = null; };

  /* Resize and rotate with the handles. The centre of the overlay stays put; a corner scales it by how far the pointer moves from the centre, the top dot turns it by the angle the pointer sweeps. */
  const startHandle = (target, e, mode) => {
    e.stopPropagation(); e.preventDefault();
    const r = frameRef.current.getBoundingClientRect();
    const st = target === "logo" ? lp : texts.find((t) => t.id === target);
    hDrag.current = { target, mode, p0: { x: e.clientX, y: e.clientY }, c: { x: r.left + st.x * r.width, y: r.top + st.y * r.height }, s0: st.s, r0: st.r || 0, w0: st.w || 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveHandle = (e) => {
    const d = hDrag.current;
    if (!d) return;
    const apply = (patch) => (d.target === "logo" ? setLp((p) => ({ ...p, ...patch })) : patchText(d.target, patch));
    if (d.mode === "rotate") {
      const a0 = Math.atan2(d.p0.y - d.c.y, d.p0.x - d.c.x), a1 = Math.atan2(e.clientY - d.c.y, e.clientX - d.c.x);
      const deg = d.r0 + ((a1 - a0) * 180) / Math.PI;
      apply({ r: Math.round(((deg + 540) % 360) - 180) });
    } else if (d.mode === "width") {
      // The side handles stretch the box from its centre: the distance from the centre to the pointer is half the width.
      const r = frameRef.current.getBoundingClientRect();
      apply({ w: Math.min(0.95, Math.max(0.08, (2 * Math.abs(e.clientX - d.c.x)) / r.width)) });
    } else {
      const d0 = Math.hypot(d.p0.x - d.c.x, d.p0.y - d.c.y) || 1, d1 = Math.hypot(e.clientX - d.c.x, e.clientY - d.c.y);
      const [lo, hi] = d.target === "logo" ? [0.06, 0.7] : [0.03, 0.18];
      const s = Math.min(hi, Math.max(lo, (d.s0 * d1) / d0));
      // A text box that was stretched keeps its stretch in proportion to the text.
      apply(d.w0 ? { s, w: Math.min(0.95, d.w0 * (s / d.s0)) } : { s });
    }
  };
  const endHandle = () => { hDrag.current = null; };

  const addPhotos = async (files) => {
    const ok = [...files].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type)).slice(0, 3 - photos.length);
    if (!ok.length) { notify("Use PNG, JPG or WEBP photos."); return; }
    try {
      const got = await Promise.all(ok.map(async (f) => ({ name: f.name, src: await shrinkPhoto(await readFile(f)) })));
      setPhotos((p) => [...p, ...got].slice(0, 3));
    } catch (e) { notify("That photo could not be read."); }
  };

  const run = async (label, body, spendNow) => {
    if (busy) return;
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    const c = new AbortController();
    ctrl.current = c;
    setBusy(label); setErr("");
    try {
      const out = await makeCall("/make/ad", { refs: photos.map((p) => p.src), headline: headline.trim(), quality: premium ? "premium" : "standard", mode: inspired ? "inspired" : "exact", ratio: tall ? "9:16" : "4:5", ...body }, c.signal);
      if (ad) setPast((p) => [...p, ad].slice(-6));
      setAd(`data:${out.mime};base64,${out.data}`);
      if (out.grant) { setGrant(out.grant); setSizes({}); }
      const free = out.freeLeft !== undefined;
      if (free) setLeftBy((m) => ({ ...m, [grant]: out.freeLeft }));
      setReview(null); setFix("");
      track(body.base ? "ad_edited" : "ad_generated", { template_id: tpl.id, template_category: tpl.category, quality: premium ? "premium" : "standard", product_photos: photos.length, has_headline: !!headline.trim() });
      if (spendNow && onSpend && !free) onSpend(makeCost(premium));
    } catch (e) { if (!c.signal.aborted) setErr(e.message || "Something went wrong. Try again."); }
    setBusy("");
  };

  const generate = async () => {
    const template = await shrinkPhoto(templateSrc, 1000);
    const body = { template, about: tpl.desc || "", note: note.trim(), placement: fashion ? placement.trim() : "", keepText: headline.trim() === (tpl.headline || "").trim() };
    if (inspired) return generateVariants(body);
    run("Putting your product into the photo…", body, true);
  };
  const edit = async (text) => { const t = (text || "").trim(); if (t && ad && !busy) run("Applying your change…", { base: await shrinkPhoto(ad, 1600, 0.92), fix: t, grant }, true); };
  // The same ad for another placement (Story, Feed, square, wide). Made only when the user asks; the ad they have stays as a version.
  const resizeTo = async (r) => {
    if (!ad || busy) return;
    const cur = sizeKey(ar);
    if (r === cur) return;
    setSizeOpen(false);
    if (sizes[r]) { setSizes((m) => ({ ...m, [cur]: ad })); setAd(sizes[r]); setReview(null); return; }   // already made: just show it, no charge
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    const c = new AbortController();
    ctrl.current = c;
    setBusy(`Making the ${r} version…`); setErr("");
    try {
      const out = await makeCall("/make/ad", { refs: photos.map((p) => p.src), quality: premium ? "premium" : "standard", base: await shrinkPhoto(ad, 1600, 0.92), fix: "resize", resize: true, ratio: r, grant }, c.signal);
      const url = `data:${out.mime};base64,${out.data}`;
      const free = out.freeLeft !== undefined;
      if (free) setLeftBy((m) => ({ ...m, [grant]: out.freeLeft }));
      setSizes((m) => ({ ...m, [cur]: ad, [r]: url }));
      setAd(url); setReview(null);
      track("ad_resized", { template_id: tpl.id, template_category: tpl.category, ratio: r });
      if (onSpend && !free) onSpend(makeCost(premium));
    } catch (e) { if (!c.signal.aborted) setErr(e.message || "Something went wrong. Try again."); }
    setBusy("");
  };
  const undo = () => { if (!past.length || busy) return; setAd(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setReview(null); };

  /* Inspired ads come in three options. Each option is its own request, so each one is charged, and the credits shown
     on the button are the total for all three. Only the options that came back are charged. */
  const VARIANTS = 3;
  const generateVariants = async (body) => {
    if (busy) return;
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    const c = new AbortController();
    ctrl.current = c;
    setBusy("Creating 3 new ads around your product…"); setErr("");
    const one = () => makeCall("/make/ad", { refs: photos.map((p) => p.src), headline: headline.trim(), quality: premium ? "premium" : "standard", mode: "inspired", ratio: tall ? "9:16" : "4:5", ...body }, c.signal);
    try {
      const res = await Promise.allSettled(Array.from({ length: VARIANTS }, one));
      const okRes = res.filter((r) => r.status === "fulfilled");
      const got = okRes.map((r) => `data:${r.value.mime};base64,${r.value.data}`);
      setVGrants(okRes.map((r) => r.value.grant || ""));
      setGrant(okRes[0] ? okRes[0].value.grant || "" : ""); setSizes({});
      if (!got.length) throw res[0].reason || new Error("Something went wrong. Try again.");
      if (ad) setPast((p) => [...p, ad].slice(-6));
      setVariants(got); setAd(got[0]);
      setReview(null); setFix("");
      track("ad_generated", { template_id: tpl.id, template_category: tpl.category, quality: premium ? "premium" : "standard", product_photos: photos.length, has_headline: !!headline.trim(), options: got.length });
      if (onSpend) onSpend(makeCost(premium) * got.length);
    } catch (e) { if (!c.signal.aborted) setErr(e.message || "Something went wrong. Try again."); }
    setBusy("");
  };
  const pickVariant = (v) => {
    if (v === ad || busy) return;
    setPast((p) => [...p, ad].slice(-6));
    setGrant(vGrants[variants.indexOf(v)] || "");
    setAd(v); setReview(null);
  };

  const check = async () => {
    if (busy || !ad) return;
    setBusy("Scoring this ad…"); setErr("");
    try {
      const small = await shrinkPhoto(ad, 900, 0.85);
      const rv = await makeCall("/make/review", { image: small, headline: headline.trim(), refs: photos.slice(0, 2).map((p) => p.src) });
      setReview(rv);
      track("ad_scored", { template_id: tpl.id, template_category: tpl.category, score: rv.score });
    } catch (e) { setErr(e.message || "The check failed. Try again."); }
    setBusy("");
  };

  const download = async () => {
    let src = ad;
    try { src = await commitText(); } catch (e) { notify("The text could not be added. Try again."); return; }   // text still in the panel goes into the photo first
    const blob = await (await fetch(src)).blob();
    track("ad_downloaded", { template_id: tpl.id, template_category: tpl.category });
    saveBlob(blob, `${tpl.id}-my-product${Object.keys(sizes).length > 1 ? "-" + sizeKey(ar).replace(":", "x") : ""}.${blob.type.includes("png") ? "png" : "jpg"}`);
  };

  const scoreHex = review ? (review.score >= 75 ? "#059669" : review.score >= 55 ? "#d97706" : "#e11d48") : "#059669";
  const pct = (v, lo, hi) => `${((v - lo) / (hi - lo)) * 100}%`;
  const ideas = ["Make the background a gym", "Make it brighter", "Change the headline to Run further"];
  const placeIdeas = ["Small, on the left chest", "Small, centred on the chest", "Large, across the front", "Small, on the sleeve"];

  return (
    <Shell
      studio
      title={editing ? tpl.title : inspired ? "Create a new ad inspired by this" : "Put my product in this ad"}
      sub={editing ? "Your saved ad. Add text or a logo, change it, then download or save it again." : inspired ? `${tpl.title} · a brand new ad with your real product, in the mood of this one.` : `${tpl.title} · the same ad, one to one, with your real product in it.`}
      icon={null} onClose={onClose}
      footer={
        <>
          {busy && <span className="mr-auto inline-flex items-center gap-2.5 text-xs font-medium text-slate-500"><span className="sx-dot" />{busy} This can take up to a minute.</span>}
          {!busy && !ad && !photos.length && <span className="mr-auto text-xs font-medium text-slate-400">Add a product photo to begin</span>}
          {ad && !busy && past.length > 0 && <button onClick={undo} className="mr-auto text-xs font-semibold text-slate-500 transition hover:text-slate-900">Undo last change</button>}
          {ad && !editing && <button onClick={saveToVault} disabled={!!busy} className="sx-ghost inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50">Save to Vault</button>}
          {ad && <button onClick={download} disabled={!!busy} className="sx-ghost inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"><Icon.Download className="h-4 w-4" /> Download</button>}
          {!editing && (
            <button id="make-go" ref={goRef} onClick={generate} disabled={!photos.length || !!busy} className={`${primaryBtn} !px-7 !py-3 !text-[15px]`}>
              {busy ? "Working…" : ad ? "Make another version" : inspired ? `Generate 3 options · ${VARIANTS * makeCost(premium)} credits` : `Generate my ad · ${makeCost(premium)} credits`}
            </button>
          )}
        </>
      }
    >
      <div ref={root} className="grid md:min-h-[590px] md:grid-cols-[minmax(0,390px)_1fr]">
        <div ref={stageRef} className="sx-stage px-8 pb-12 pt-14 md:px-10 md:pt-24">
          <div className="fx-glow" aria-hidden="true"><span className="sx-blob sx-blob-a" /><span className="sx-blob sx-blob-b" /><span className="sx-blob sx-blob-c" /></div>
          <div className="relative md:sticky md:top-8">
            <div className="fx-ad relative mx-auto w-full max-w-[290px]">
              <span className="fx-pulse sx-pulse" aria-hidden="true" />
              <div ref={frameRef} className="sx-ad relative w-full overflow-hidden" style={{ containerType: "inline-size", aspectRatio: ar }}>
                <img id="make-result" src={shown} alt={ad ? "Your ad" : tpl.title} className={`absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-700 ${busy ? "opacity-60 blur-[3px]" : ""}`} />
                {ad && logoOpen && shownLogo && (
                  <div className="absolute z-10" onPointerEnter={() => setHov("logo")} onPointerLeave={() => { if (!dragging.current) setHov(null); }} style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, width: `${lp.s * 100}%`, transform: `translate(-50%, -50%) rotate(${lp.r || 0}deg)` }}>
                    <img
                      src={shownLogo.src} alt="Your logo, drag to move" draggable={false}
                      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                      className="block w-full cursor-move touch-none select-none"
                    />
                    {hov === "logo" && <span className="pointer-events-none absolute inset-0 outline-dashed outline-2 outline-offset-2 outline-white/90" />}
                    {hov === "logo" && <Handles onHandle={(e, mode) => startHandle("logo", e, mode)} onMove={moveHandle} onUp={endHandle} />}
                  </div>
                )}
                {ad && laid.map(({ l, theme, lines, arc }) => {
                  if (!lines.length) return null;
                  const on = hov === l.id;
                  const pos = { left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: `translate(-50%, -50%) rotate(${l.r || 0}deg)` };
                  const drag = { onPointerDown: (e) => startTextDrag(e, l.id), onPointerMove: moveTextDrag, onPointerUp: endTextDrag, onPointerCancel: endTextDrag, onPointerEnter: () => setHov(l.id), onPointerLeave: () => { if (!tDrag.current) setHov(null); } };
                  // The frame and handles show only while the pointer is on this text, so nothing is left on the ad after you click away.
                  const frame = on ? "outline-dashed outline-2 outline-offset-4 outline-white/90" : "";
                  if (arc) return (
                    <div key={l.id} {...drag} title="Drag the text to move it" className={`absolute z-10 cursor-move touch-none select-none ${frame}`} style={{ ...pos, width: `${arc.w * 100}cqw`, height: `${arc.h * 100}cqw` }}>
                      {arc.list.map((g, i) => (
                        <span key={i} className="pointer-events-none absolute whitespace-pre" style={{ ...textCss(theme, l.s), background: undefined, borderRadius: undefined, padding: undefined, lineHeight: 1, left: `${(g.x - arc.minX + l.s / 2) * 100}cqw`, top: `${(g.y - arc.minY + (l.s * TEXT_LH) / 2) * 100}cqw`, transform: `translate(-50%, -50%) rotate(${g.a}deg)` }}>{g.ch}</span>
                      ))}
                      {on && <Handles onHandle={(e, mode) => startHandle(l.id, e, mode)} onMove={moveHandle} onUp={endHandle} />}
                    </div>
                  );
                  return (
                    <div key={l.id} {...drag} title="Drag the text to move it" className={`absolute z-10 max-w-none cursor-move touch-none select-none ${frame}`} style={{ ...textCss(theme, l.s, l.w), ...pos }}>
                      {lines.join("\n")}
                      {on && <Handles wide onHandle={(e, mode) => startHandle(l.id, e, mode)} onMove={moveHandle} onUp={endHandle} />}
                    </div>
                  );
                })}
                <span className="fx-flash pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden="true" />
                {busy && <span ref={beamRef} className="sx-beam" aria-hidden="true" />}
              </div>
            </div>
            {Object.keys(sizes).length > 1 && !busy && (
              <div className="mx-auto mt-6 flex w-full max-w-[290px] flex-wrap justify-center gap-2" role="group" aria-label="Your sizes">
                {SIZES.filter(([r]) => sizes[r] || r === sizeKey(ar)).map(([r, name]) => (
                  <button key={r} onClick={() => resizeTo(r)} aria-pressed={sizeKey(ar) === r} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${sizeKey(ar) === r ? "bg-slate-950 text-white" : "sx-chip text-slate-600"}`}>{name} {r}</button>
                ))}
              </div>
            )}
            {variants.length > 1 && !busy && (
              <div className="mx-auto mt-6 flex w-full max-w-[290px] justify-center gap-3" role="group" aria-label="Pick one of the options">
                {variants.map((v, i) => (
                  <button key={i} onClick={() => pickVariant(v)} aria-pressed={ad === v} aria-label={`Option ${i + 1}`} className={`relative h-20 w-16 overflow-hidden rounded-xl ring-2 ring-offset-2 transition ${ad === v ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`}>
                    <img src={v} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {busy ? (
              <div className="mx-auto mt-7 w-full max-w-[290px]">
                <p key={ad ? "e" : phase} className="sx-phase text-center text-[12px] font-medium tracking-wide text-slate-600">{ad ? busy : PHASES[phase]}…</p>
                <div className="sx-bar mt-3"><span ref={barRef} /></div>
              </div>
            ) : (
              <p className="fx-cap mt-6 text-center text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {ad ? "Your ad" : isVideo ? `${inspired ? "The inspiration" : "The look your ad will copy"} · first frame` : inspired ? "The inspiration" : "The look your ad will copy"}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col px-8 pb-9 pt-9 md:px-12 md:pt-12">
          <div className="fx-head pr-10">
            {onBack && !editing && <button onClick={onBack} className="mb-4 text-xs font-semibold text-slate-500 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 rounded">← Back to the template</button>}
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">{inspired ? "New ad studio" : "Product studio"}</p>
            <h2 className="mt-2 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950">{editing ? tpl.title : inspired ? "Create a new ad inspired by this" : "Put my product in this ad"}</h2>
            <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-slate-500">{editing ? "Your saved ad. Add text or a logo, change it, then download or save it again." : inspired ? "A brand new ad with your real product, in the mood of this one." : "The same ad, one to one, with your real product in it."}</p>
          </div>

          <div ref={panelRef} className={`mt-8 flex flex-col ${ad ? "gap-7" : ""}`}>
            {err && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{err}</p>}

            {!ad ? (
              <>
                <Step n="01" done={photos.length > 0} title="Photos of your product" hint="1 to 3, plain background works best">
                  <div className="flex flex-wrap gap-3">
                    {photos.map((p, i) => (
                      <span key={i} className="sx-thumb relative h-24 w-24 overflow-hidden rounded-xl">
                        <img src={p.src} alt={p.name} className="h-full w-full object-cover" />
                        <button onClick={() => setPhotos((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${p.name}`} className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-slate-700 shadow transition hover:text-rose-600"><Icon.Close className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {photos.length < 3 && (
                      <button
                        type="button" id="make-upload" onClick={() => fileRef.current && fileRef.current.click()}
                        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}
                        className={`sx-drop group flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 text-center focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10 ${photos.length ? "h-24 w-24" : "w-full px-6 py-9"}`}
                      >
                        <Icon.Upload className="h-5 w-5 text-slate-900 transition duration-500 group-hover:-translate-y-0.5" />
                        {!photos.length && <><span className="mt-3 block text-sm font-semibold text-slate-900">Drop a photo here, or <span className="underline decoration-slate-300 underline-offset-4 group-hover:decoration-slate-900">browse</span></span><span className="mt-1 block max-w-xs text-xs leading-snug text-slate-500">The ad will show this exact product: same shape, colour and logo.</span></>}
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} id="make-file" type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
                </Step>
                {!fashion && (
                  <Step n="02" done={!!headline.trim()} title="Headline on the image" hint="Leave empty for no text" htmlFor="make-headline">
                    <input id="make-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} className={`${field} !rounded-xl !py-3`} placeholder="e.g. Made to move in" />
                  </Step>
                )}
                {fashion && (
                  <Step n="02" done={!!placement.trim()} title="Where should the logo go?" hint="Optional. Say where and how big. Without it, a logo goes small on the chest" htmlFor="make-place">
                    <input id="make-place" value={placement} onChange={(e) => setPlacement(e.target.value)} maxLength={120} className={`${field} !rounded-xl !py-3`} placeholder="e.g. small, on the left chest" />
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {placeIdeas.map((s) => <button key={s} type="button" onClick={() => setPlacement(s)} className="sx-chip rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-600">{s}</button>)}
                    </div>
                  </Step>
                )}
                <Step n="03" done={!!note.trim()} title="About your product" hint="Optional, facts only. To change the ad, use “Change something” after it is made" htmlFor="make-note">
                  <input id="make-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${field} !rounded-xl !py-3`} placeholder="e.g. a sticker with a silver logo, not a shirt" />
                </Step>
                <div className="sx-step flex items-center gap-4">
                  <div className="min-w-0 flex-1 sm:pl-[34px]">
                    <p className="text-sm font-semibold text-slate-950">Best quality</p>
                    <p className="mt-0.5 text-xs text-slate-400">Slower, and costs more to generate.</p>
                  </div>
                  <Switch on={premium} onChange={setPremium} label="Best quality" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="make-fix" className="mb-3 block text-[15px] font-semibold text-slate-950">Change something</label>
                  <div className="sx-compose flex items-center gap-2 rounded-2xl p-1.5 pl-4">
                    <input id="make-fix" value={fix} onChange={(e) => setFix(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") edit(fix); }} maxLength={500} className="min-w-0 flex-1 !border-0 !bg-transparent py-2 text-[15px] text-slate-900 outline-none !ring-0 !shadow-none placeholder:text-slate-400" placeholder="Make the background a gym…" />
                    <button id="make-apply" onClick={() => edit(fix)} disabled={!fix.trim() || !!busy} className="shrink-0 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">Apply</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ideas.map((s) => <button key={s} onClick={() => setFix(s)} className="sx-chip rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-600">{s}</button>)}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Only what you ask for changes. Your product stays as it is in your photos.{" "}
                    {grant && (freeLeft > 0
                      ? <b className="font-semibold text-emerald-700">{freeLeft} free {freeLeft === 1 ? "change" : "changes"} left on this ad.</b>
                      : <span>Free changes used. Each change now costs {makeCost(premium)} credits.</span>)}</p>
                </div>

                {review && (
                  <div id="make-review" className="sx-card rounded-2xl p-5">
                    <div className="flex items-center gap-4">
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${scoreHex} ${review.score}%, #ece9e4 0)` }}>
                        <span className="grid h-[56px] w-[56px] place-items-center rounded-full bg-white text-xl font-bold tabular-nums" style={{ color: scoreHex }}>{review.score}</span>
                      </span>
                      <p className="text-[13.5px] font-medium leading-snug text-slate-700">{review.verdict}</p>
                    </div>
                    {review.strengths.length > 0 && <ul className="mt-4 space-y-2 text-[13px] text-slate-600">{review.strengths.map((s) => <li key={s} className="flex gap-2.5"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>{s}</span></li>)}</ul>}
                    {review.fixes.length > 0 && <ul className="mt-2.5 space-y-2 text-[13px] text-slate-600">{review.fixes.map((s) => <li key={s} className="flex gap-2.5"><Icon.Alert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span>{s}</span></li>)}</ul>}
                    {review.regen && <button id="make-autofix" onClick={() => edit(review.regen)} disabled={!!busy} className="mt-4 inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50">Apply these fixes</button>}
                  </div>
                )}

                {(!review || !panelOpen) && (
                  <div className="sx-actions">
                    {!review && (
                      <button id="make-check" onClick={check} disabled={!!busy} className="sx-action disabled:opacity-50">
                        <span><b>Score this ad</b><small>Check it before you run it</small></span><i aria-hidden="true">→</i>
                      </button>
                    )}
                    {!panelOpen && (
                      <button id="make-size" onClick={() => setSizeOpen((o) => !o)} disabled={!!busy} aria-expanded={sizeOpen} className="sx-action disabled:opacity-50">
                        <span><b>Get it for Stories, Reels and more</b><small>The same ad in another size, made when you ask</small></span><i aria-hidden="true">{sizeOpen ? "−" : "→"}</i>
                      </button>
                    )}
                    {!panelOpen && sizeOpen && (
                      <div className="py-4">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Other sizes">
                          {SIZES.map(([r, name, v]) => {
                            const here = sizeKey(ar) === r;
                            return <button key={r} onClick={() => resizeTo(r)} disabled={here || !!busy} className="sx-chip rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40">{name} {r}{here ? " (this one)" : sizes[r] ? " · open" : ""}</button>;
                          })}
                        </div>
                        <p className="mt-3 text-xs text-slate-400">Your current ad stays as it is. The scene is extended, your product and people stay the same. Make sizes before adding a logo or text. {grant && freeLeft > 0 ? "Each new size uses one of your free changes." : `Each new size costs ${makeCost(premium)} credits.`}</p>
                      </div>
                    )}
                    {!panelOpen && (
                      <button id="make-logo" onClick={() => { setTextOpen(false); setLogoOpen(true); }} disabled={!!busy} className="sx-action disabled:opacity-50">
                        <span><b>Add your logo</b><small>Place it anywhere on the ad</small></span><i aria-hidden="true">→</i>
                      </button>
                    )}
                    {!panelOpen && (
                      <button id="make-text" onClick={openText} disabled={!!busy} className="sx-action disabled:opacity-50">
                        <span><b>Write your own text</b><small>Typed exactly as you write it, no AI</small></span><i aria-hidden="true">→</i>
                      </button>
                    )}
                  </div>
                )}

                {logoOpen && (
                  <div id="make-logo-panel" className="sx-card space-y-5 rounded-2xl p-5">
                    <span className="block text-[15px] font-semibold text-slate-950">Add your logo</span>
                    <LogoDrop logo={logo} onLogo={setLogo} notify={notify} quiet />
                    {logo && (
                      <>
                        <p className="text-xs text-slate-500">Drag the logo on the image to put it anywhere.</p>
                        <div className="flex items-center gap-4">
                          <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-slate-900">Remove the logo's background</p><p className="text-xs text-slate-400">Plain backgrounds work best.</p></div>
                          <Switch id="make-logo-cut" on={logoCut} onChange={setLogoCut} label="Remove the logo's background" />
                        </div>
                        {logoCut && (
                          <div>
                            <label htmlFor="make-logo-tol" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Strength<span className="sx-val">{cutTol}</span></label>
                            <input id="make-logo-tol" type="range" min="10" max="140" step="1" value={cutTol} onChange={(e) => setCutTol(+e.target.value)} className="rng mt-2.5 w-full" style={{ "--p": pct(cutTol, 10, 140) }} />
                            <p className="mt-1.5 text-xs text-slate-400">Raise it if background is left, lower it if the logo gets eaten.</p>
                          </div>
                        )}
                        <div>
                          <label htmlFor="make-logo-size" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Size<span className="sx-val">{Math.round(lp.s * 100)}%</span></label>
                          <input id="make-logo-size" type="range" min="0.06" max="0.7" step="0.01" value={lp.s} onChange={(e) => setLp((p) => ({ ...p, s: +e.target.value }))} className="rng mt-2.5 w-full" style={{ "--p": pct(lp.s, 0.06, 0.7) }} />
                        </div>
                        <div>
                          <label htmlFor="make-logo-rot" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Rotate<span className="sx-val">{lp.r || 0}°</span></label>
                          <input id="make-logo-rot" type="range" min="-180" max="180" step="1" value={lp.r || 0} onChange={(e) => setLp((p) => ({ ...p, r: +e.target.value }))} className="rng mt-2.5 w-full" style={{ "--p": pct((lp.r || 0) + 180, 0, 360) }} />
                        </div>
                      </>
                    )}
                    <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-4 rounded-b-2xl border-t border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
                      <button id="make-logo-apply" onClick={applyLogo} disabled={!logo || !!busy} className={primaryBtn}>Add to my ad</button>
                      <button onClick={() => { setLogoOpen(false); setLogo(null); setLogoCut(false); }} className="text-xs font-semibold text-slate-500 transition hover:text-slate-900">Cancel</button>
                    </div>
                  </div>
                )}
                {textOpen && cur && (
                  <div id="make-text-panel" className="sx-card space-y-5 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[15px] font-semibold text-slate-950">Your text</span>
                      <button onClick={() => addText()} className="text-xs font-semibold text-slate-900 transition hover:text-slate-600">+ Add another text</button>
                    </div>
                    {texts.length > 1 && (
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Texts on the ad">
                        {texts.map((l, i) => (
                          <button key={l.id} onClick={() => setActiveText(l.id)} aria-pressed={cur.id === l.id} className={`max-w-[10rem] truncate rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${cur.id === l.id ? "bg-slate-950 text-white" : "sx-chip text-slate-600"}`}>{l.val.trim() ? l.val.trim() : `Text ${i + 1}`}</button>
                        ))}
                      </div>
                    )}
                    <div>
                      <label htmlFor="make-text-input" className="mb-2.5 block text-[13px] font-semibold text-slate-900">The words</label>
                      <textarea id="make-text-input" rows={3} value={cur.val} onChange={(e) => setCur({ val: e.target.value })} maxLength={160} className={`${field} !rounded-xl !py-3`} placeholder="e.g. 50% off this weekend only" />
                      <p className="mt-1.5 text-xs text-slate-400">Press Enter for a new line. The AI does not change these words.</p>
                    </div>
                    <div>
                      <p className="mb-2.5 text-[13px] font-semibold text-slate-900">Quick offers</p>
                      <div className="flex flex-wrap gap-2">
                        {TEXT_OFFERS.map((o) => (
                          <button key={o} onClick={() => addText(o)} className="sx-chip rounded-full px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:text-slate-950">{o}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2.5 text-[13px] font-semibold text-slate-900">Style</p>
                      <div className="flex flex-wrap gap-2">
                        {TEXT_THEMES.map((t) => (
                          <button key={t.id} onClick={() => setCur({ theme: t.id })} aria-pressed={cur.theme === t.id} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${cur.theme === t.id ? "bg-slate-950 text-white" : "sx-chip text-slate-600"}`}>{t.name}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2.5 text-[13px] font-semibold text-slate-900">Font</p>
                      <div className="flex flex-wrap gap-2">
                        {TEXT_FONTS.map((f) => (
                          <button key={f.id} onClick={() => setCur({ font: f.id })} aria-pressed={cur.font === f.id} style={{ fontFamily: f.family || undefined, fontWeight: f.weight, fontStyle: f.style }} className={`rounded-full px-3.5 py-1.5 text-xs transition ${cur.font === f.id ? "bg-slate-950 text-white" : "sx-chip text-slate-600"}`}>{f.name}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2.5 text-[13px] font-semibold text-slate-900">Colour</p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {TEXT_COLORS.map((c) => (
                          <button key={c} onClick={() => setCur({ color: c })} aria-label={`Text colour ${c}`} aria-pressed={cur.color === c} style={{ background: c }} className={`h-7 w-7 rounded-full border border-slate-200 ring-2 ring-offset-2 transition ${cur.color === c ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`} />
                        ))}
                        <input type="color" aria-label="Your own text colour" value={cur.color || curTheme.ink} onChange={(e) => setCur({ color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                      </div>
                    </div>
                    <div>
                      <p className="mb-2.5 text-[13px] font-semibold text-slate-900">Background</p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button onClick={() => setCur({ box: false })} aria-pressed={cur.box === false} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${cur.box === false ? "bg-slate-950 text-white" : "sx-chip text-slate-600"}`}>None</button>
                        {TEXT_COLORS.map((c) => (
                          <button key={c} onClick={() => setCur({ box: c })} aria-label={`Background colour ${c}`} aria-pressed={cur.box === c} style={{ background: c }} className={`h-7 w-7 rounded-full border border-slate-200 ring-2 ring-offset-2 transition ${cur.box === c ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`} />
                        ))}
                        <input type="color" aria-label="Your own background colour" value={typeof cur.box === "string" ? cur.box : curTheme.box || "#e11d48"} onChange={(e) => setCur({ box: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                      </div>
                    </div>
                    {cur.val.trim() && <p className="text-xs text-slate-500">Drag the text on the image to put it anywhere. Drag its corners to resize, its sides to make the box longer or shorter, and the curved arrow above it to rotate.</p>}
                    {cur.w && <button onClick={() => setCur({ w: null })} className="text-xs font-semibold text-slate-500 transition hover:text-slate-900">Fit the box to the text</button>}
                    <div>
                      <label htmlFor="make-text-size" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Size<span className="sx-val">{Math.round(cur.s * 100)}%</span></label>
                      <input id="make-text-size" type="range" min="0.03" max="0.18" step="0.005" value={cur.s} onChange={(e) => setCur({ s: +e.target.value })} className="rng mt-2.5 w-full" style={{ "--p": pct(cur.s, 0.03, 0.18) }} />
                    </div>
                    <div>
                      <label htmlFor="make-text-curve" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Curve<span className="sx-val">{Math.round(cur.bend * 100)}</span></label>
                      <input id="make-text-curve" type="range" min="-1" max="1" step="0.02" value={cur.bend} onChange={(e) => setCur({ bend: +e.target.value })} className="rng mt-2.5 w-full" style={{ "--p": pct(cur.bend, -1, 1) }} />
                    </div>
                    <div>
                      <label htmlFor="make-text-rot" className="flex items-center justify-between text-[13px] font-semibold text-slate-900">Rotate<span className="sx-val">{cur.r || 0}°</span></label>
                      <input id="make-text-rot" type="range" min="-180" max="180" step="1" value={cur.r || 0} onChange={(e) => setCur({ r: +e.target.value })} className="rng mt-2.5 w-full" style={{ "--p": pct((cur.r || 0) + 180, 0, 360) }} />
                    </div>
                    <button onClick={removeCur} className="text-xs font-semibold text-rose-600 transition hover:text-rose-700">Remove this text</button>
                    <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-4 rounded-b-2xl border-t border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
                      <button id="make-text-apply" onClick={applyText} disabled={!texts.some((l) => l.val.trim()) || !!busy} className={primaryBtn}>Add to my ad</button>
                      <button onClick={closeText} className="text-xs font-semibold text-slate-500 transition hover:text-slate-900">Cancel</button>
                    </div>
                  </div>
                )}
                <button onClick={() => { setPast([]); setAd(""); setReview(null); setLogoOpen(false); setLogo(null); closeText(); }} disabled={!!busy} className="w-fit text-xs font-semibold text-slate-500 transition hover:text-slate-900">← Change the photos or the headline</button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

export { BrandModal, InspireModal, ProductModal, cutBackground };
