import { useState, useRef } from "react";
import { nameTokens, ratioInfo } from "./analysis.js";

/* ---------------- Creative asset: read, measure, samples ---------------- */

function measurePixels(src, sw, sh) {
  const scale = Math.min(1, 96 / Math.max(sw, sh));
  const w = Math.max(8, Math.round(sw * scale));
  const h = Math.max(8, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let n = 0, sum = 0, sumSq = 0, sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += L;
    sumSq += L * L;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx ? (mx - mn) / mx : 0;
    n += 1;
  }
  const mean = sum / n;
  return {
    lumMean: Math.round(mean),
    lumStd: Math.round(Math.sqrt(Math.max(0, sumSq / n - mean * mean))),
    sat: Math.round((sat / n) * 100) / 100,
  };
}

function makeThumb(src, sw, sh) {
  const tw = 200;
  const th = Math.max(40, Math.round((tw * sh) / sw));
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(src, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.8);
}

function readAsset(file) {
  return new Promise((resolve, reject) => {
    const isImg = file.type.startsWith("image/");
    const isVid = file.type.startsWith("video/");
    if (!isImg && !isVid) return reject(new Error("Choose a JPG, PNG or WEBP image, or an MP4 or MOV video."));
    const url = URL.createObjectURL(file);
    let finished = false;
    const finish = (fn, v) => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      fn(v);
    };
    const fail = (msg) => finish(reject, new Error(msg));
    if (isImg) {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          finish(resolve, {
            name: file.name, kind: "image", w, h, dur: null, thumb: makeThumb(img, w, h),
            ...measurePixels(img, w, h), tags: nameTokens(file.name), tagSource: "filename", sample: false,
          });
        } catch (e) {
          fail("That image could not be read. Try a JPG or PNG.");
        }
      };
      img.onerror = () => fail("That image could not be read. Try a JPG or PNG.");
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      const timer = setTimeout(() => fail("This browser cannot read that video. Upload a thumbnail image instead."), 8000);
      v.onloadedmetadata = () => {
        try { v.currentTime = Math.min(0.5, (isFinite(v.duration) && v.duration ? v.duration : 1) / 2); } catch (e) {}
      };
      v.onseeked = () => {
        clearTimeout(timer);
        try {
          const w = v.videoWidth, h = v.videoHeight;
          finish(resolve, {
            name: file.name, kind: "video", w, h, dur: isFinite(v.duration) && v.duration ? Math.round(v.duration * 10) / 10 : null, thumb: makeThumb(v, w, h),
            ...measurePixels(v, w, h), tags: nameTokens(file.name), tagSource: "filename", sample: false,
          });
        } catch (e) {
          fail("This browser cannot read that video. Upload a thumbnail image instead.");
        }
      };
      v.onerror = () => { clearTimeout(timer); fail("This browser cannot read that video. Upload a thumbnail image instead."); };
      v.src = url;
    }
  });
}

/* ---- Sample creatives, painted on a canvas so they are real pixels ---- */

function paintText(ctx, str, x, y, o) {
  ctx.font = `${o.weight || 600} ${o.size}px "Inter Tight", system-ui, sans-serif`;
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align || "center";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = (o.spacing || 0) + "px";
  ctx.fillText(str, x, y);
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const SAMPLE_PAINT = {
  // Low-contrast beige, small headline: a weak stop-rate creative.
  skin(ctx, W, H) {
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#f1e9df"); g.addColorStop(1, "#e6dbcd");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(540, 660, 40, 540, 660, 430);
    g.addColorStop(0, "rgba(250,245,236,.95)"); g.addColorStop(1, "rgba(250,245,236,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#cdb89a"; rrect(ctx, 500, 340, 80, 110, 34); ctx.fill();
    ctx.fillStyle = "#f0e7da"; rrect(ctx, 468, 440, 144, 90, 14); ctx.fill();
    ctx.fillStyle = "#f8f3ea"; ctx.strokeStyle = "#d8cbb8"; ctx.lineWidth = 6;
    rrect(ctx, 390, 520, 300, 480, 54); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fffaf1"; rrect(ctx, 428, 700, 224, 190, 12); ctx.fill();
    paintText(ctx, "LUMEN GLOW", 540, 782, { size: 27, weight: 700, color: "#bcae96", spacing: 4 });
    paintText(ctx, "Vitamin C Serum", 540, 828, { size: 22, weight: 500, color: "#c8baa4" });
    paintText(ctx, "Glowing skin starts with vitamin C", 540, 1150, { size: 46, weight: 500, color: "#b9a992" });
    paintText(ctx, "Shop now", 540, 1230, { size: 28, weight: 500, color: "#c9baa4" });
  },
  // High contrast, big type, but generic claim and a long video.
  gym(ctx, W, H) {
    ctx.fillStyle = "#0b0b0f"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,61,46,.92)";
    ctx.beginPath(); ctx.moveTo(0, 1210); ctx.lineTo(W, 900); ctx.lineTo(W, 1300); ctx.lineTo(0, 1620); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2a2a33"; rrect(ctx, 350, 720, 380, 100, 22); ctx.fill();
    ctx.fillStyle = "#1c1c22"; ctx.strokeStyle = "#454552"; ctx.lineWidth = 6;
    rrect(ctx, 330, 800, 420, 520, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e11d1d"; ctx.fillRect(330, 950, 420, 210);
    paintText(ctx, "IRONPEAK", 540, 1050, { size: 66, weight: 800, color: "#ffffff", spacing: 3 });
    paintText(ctx, "PRE-WORKOUT", 540, 1106, { size: 34, weight: 700, color: "#ffffff", spacing: 6 });
    ["BEST PRE-WORKOUT", "ON THE MARKET"].forEach((l, i) => paintText(ctx, l, 540, 360 + i * 110, { size: 92, weight: 800, color: "#ffffff" }));
    paintText(ctx, "300MG CAFFEINE  ·  6G CITRULLINE", 540, 1700, { size: 38, weight: 600, color: "#e4e4ea", spacing: 2 });
  },
  // Landscape, mid-contrast, busy: wrong shape for the feed.
  apparel(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#7c8594"); g.addColorStop(1, "#4f5867");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cols = ["#9a8a72", "#6f8797", "#8a7397", "#a07272", "#78927a", "#a08f6a"];
    cols.forEach((c, i) => {
      const x = 90 + i * 176;
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + 66, 250); ctx.lineTo(x + 66, 290); ctx.stroke();
      ctx.fillStyle = c; rrect(ctx, x, 290, 132, 330, 26); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(x + 62, 290, 8, 330);
    });
    paintText(ctx, "NEW FALL COLLECTION", 70, 130, { size: 62, weight: 700, color: "#eef0f4", align: "left", spacing: 2 });
    paintText(ctx, "Comfortable  ·  Stylish  ·  Made to last", 70, 190, { size: 28, weight: 500, color: "#d9dde5", align: "left" });
    paintText(ctx, "Free shipping over $75", 70, 730, { size: 30, weight: 600, color: "#eef0f4", align: "left" });
  },
};

const SAMPLE_META = {
  skin: { w: 1080, h: 1350, kind: "image", name: "lumen-glow-serum.jpg", tags: ["serum", "vitamin", "skin", "glow"] },
  gym: { w: 1080, h: 1920, kind: "video", dur: 38, name: "ironpeak-preworkout-thumb.jpg", tags: ["workout", "caffeine", "tub", "energy"] },
  apparel: { w: 1200, h: 800, kind: "image", name: "nordvik-fall-collection.jpg", tags: ["fall", "collection", "styl", "apparel"] },
};

function renderSampleAsset(id) {
  const m = SAMPLE_META[id];
  if (!m) return null;
  try {
    const c = document.createElement("canvas");
    c.width = m.w;
    c.height = m.h;
    const ctx = c.getContext("2d");
    SAMPLE_PAINT[id](ctx, m.w, m.h);
    return {
      name: m.name, kind: m.kind, w: m.w, h: m.h, dur: m.dur || null, thumb: makeThumb(c, m.w, m.h),
      ...measurePixels(c, m.w, m.h), tags: m.tags, tagSource: "sample", sample: true,
    };
  } catch (e) {
    return null;
  }
}

/* ------------------------------ Upload zone ---------------------------- */

function AssetZone({ asset, busy, error, onFile, onClear }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const pick = () => inputRef.current && inputRef.current.click();
  const take = (f) => f && onFile(f);
  const ri = asset ? ratioInfo(asset.w, asset.h) : null;
  const drag = {
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files && e.dataTransfer.files[0]); },
  };
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400" id="ex-asset-label">Upload Ad Creative (Image or Video thumbnail)</p>
      <input ref={inputRef} id="ex-file" type="file" accept="image/*,video/*" className="sr-only" tabIndex={-1} aria-labelledby="ex-asset-label" onChange={(e) => { take(e.target.files[0]); e.target.value = ""; }} />
      {asset ? (
        <div {...drag} className={`mt-2 flex items-center gap-4 rounded-2xl border-2 border-dashed bg-white p-3.5 transition ${over ? "border-blue-500 bg-blue-50/70" : "border-slate-200"}`}>
          <img src={asset.thumb} alt="Creative preview" className="h-20 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{asset.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{asset.w}×{asset.h}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ri.good ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ri.label}{ri.land ? " landscape" : ""}</span>
              {asset.kind === "video" && asset.dur ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">{Math.round(asset.dur)}s video</span> : null}
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">{asset.sample ? "Sample creative" : "Your upload"}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
            <button onClick={pick} className="rounded-full px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Replace</button>
            <button onClick={onClear} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Remove</button>
          </div>
        </div>
      ) : (
        <div
          {...drag} role="button" tabIndex={0} onClick={pick}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
          aria-describedby="ex-asset-label"
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-7 text-center transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 ${over ? "border-blue-500 bg-blue-50/70" : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"}`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
            {busy ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3" /></svg>
            )}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-900">{busy ? "Reading your creative…" : "Drag a creative here, or click to browse"}</p>
          <p className="mt-1 text-xs text-slate-500">JPG, PNG, WEBP, MP4 or MOV. It never leaves your browser.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
    </section>
  );
}

export { measurePixels, makeThumb, readAsset, paintText, rrect, SAMPLE_PAINT, SAMPLE_META, renderSampleAsset, AssetZone };
