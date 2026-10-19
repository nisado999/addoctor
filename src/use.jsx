import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "./ui";
import { field, copyText, SPY_API } from "./shared.js";
import { apiFetch } from "./api.js";
import { makeCost } from "./billing.js";
import { track } from "./track.js";
import { TEMPLATE_IMGS, TEMPLATE_VIDS } from "./templateImgs.js";

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
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 dlg-close rounded-full p-2 text-slate-500 hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
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
const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none";

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

function LogoDrop({ logo, onLogo, notify, quiet }) {
  const fileRef = useRef(null);
  const take = async (file) => { const l = await readLogo(file, notify); if (l) onLogo(l); };
  return (
    <>
      <button
        type="button" onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-left transition hover:border-blue-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"
      >
        <span className={quiet ? "grid h-6 w-6 shrink-0 place-items-center text-slate-900" : "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"}><Icon.Upload className="h-5 w-5" /></span>
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
                <button key={id} onClick={() => setSpot(id)} aria-pressed={spot === id} className={`rounded-xl border px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${spot === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{name}</button>
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
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-sm font-semibold tabular-nums text-blue-700 shadow-lg">{Math.round(p * 100)}%</span>
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
            <button onClick={() => setStage("form")} className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Change and regenerate</button>
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
                    <button key={id} onClick={() => setSpot(id)} aria-pressed={spot === id} className={`rounded-xl border px-2 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${spot === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{name}</button>
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
            <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all duration-150" style={{ width: `${p * 100}%` }} /></div>
            <ul className="space-y-2 text-sm">
              {GEN_STEPS.map((s, i) => (
                <li key={s} className={`flex items-center gap-2 ${i < step ? "text-slate-400" : i === step ? "font-medium text-slate-900" : "text-slate-300"}`}>
                  <span className={`grid h-4 w-4 place-items-center rounded-full ${i < step ? "bg-emerald-500 text-white" : i === step ? "bg-blue-600" : "bg-slate-200"}`}>{i < step && <Icon.Check className="h-2.5 w-2.5" />}</span>
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
                <button onClick={copyCaption} aria-label="Copy caption" className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"><Icon.Copy className="h-4 w-4" /></button>
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

function ProductModal({ tpl, onClose, notify, onSpend }) {
  useModal(onClose);
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
  const inspired = tpl.mode === "inspired";          // a new ad in this mood, not a one-to-one copy
  const [photos, setPhotos] = useState([]);          // [{ src, name }]
  const [headline, setHeadline] = useState(tpl.headline || "");
  const [note, setNote] = useState("");
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState("");              // "" | what is happening now
  const [err, setErr] = useState("");
  const [ad, setAd] = useState("");                  // the current result, a data URL
  const [past, setPast] = useState([]);              // earlier results, newest last, for Undo
  const [fix, setFix] = useState("");
  const [review, setReview] = useState(null);
  const [logo, setLogo] = useState(null);            // the logo being placed on the finished ad
  const [logoOpen, setLogoOpen] = useState(false);
  const [lp, setLp] = useState({ x: 0.82, y: 0.9, s: 0.22 });   // logo centre and width, as shares of the frame
  const fileRef = useRef(null);
  const ctrl = useRef(null);
  const frameRef = useRef(null);
  const dragging = useRef(false);
  const [logoCut, setLogoCut] = useState(false);     // remove the logo's background
  const [cutTol, setCutTol] = useState(45);
  const [cutLogo, setCutLogo] = useState(null);
  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);
  useEffect(() => {
    let off = false;
    if (!logo || !logoCut) { setCutLogo(null); return undefined; }
    cutBackground(logo, cutTol).then((r) => { if (!off) setCutLogo(r); }).catch(() => { if (!off) setCutLogo(null); });
    return () => { off = true; };
  }, [logo, logoCut, cutTol]);
  const shownLogo = logoCut && cutLogo ? cutLogo : logo;

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
    if (calm() || logoOpen) { gsap.to(el, { rotationX: 0, rotationY: 0, duration: 0.6, ease: "power3.out" }); return undefined; }
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
  }, { dependencies: [logoOpen], scope: root });

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

  const startDrag = (e) => { e.preventDefault(); dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); };
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
      ctx.drawImage(shownLogo.img, c.width * lp.x - lw / 2, c.height * lp.y - lh / 2, lw, lh);
      setPast((p) => [...p, ad].slice(-6));
      setAd(c.toDataURL("image/png"));
      setReview(null); setLogoOpen(false); setLogo(null); setLogoCut(false);
      track("ad_logo_added", { template_id: tpl.id, template_category: tpl.category });
    } catch (e) { notify("The logo could not be added. Try another file."); }
  };

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
      const out = await makeCall("/make/ad", { refs: photos.map((p) => p.src), headline: headline.trim(), quality: premium ? "premium" : "standard", mode: inspired ? "inspired" : "exact", ...body }, c.signal);
      if (ad) setPast((p) => [...p, ad].slice(-6));
      setAd(`data:${out.mime};base64,${out.data}`);
      setReview(null); setFix("");
      track(body.base ? "ad_edited" : "ad_generated", { template_id: tpl.id, template_category: tpl.category, quality: premium ? "premium" : "standard", product_photos: photos.length, has_headline: !!headline.trim() });
      if (spendNow && onSpend) onSpend(makeCost(premium));
    } catch (e) { if (!c.signal.aborted) setErr(e.message || "Something went wrong. Try again."); }
    setBusy("");
  };

  const generate = async () => {
    const template = await shrinkPhoto(TEMPLATE_IMGS[tpl.id], 1000);
    run(inspired ? "Creating a new ad around your product…" : "Putting your product into the photo…", { template, about: tpl.desc || "", note: note.trim(), keepText: headline.trim() === (tpl.headline || "").trim() }, true);
  };
  const edit = async (text) => { const t = (text || "").trim(); if (t && ad && !busy) run("Applying your change…", { base: await shrinkPhoto(ad, 1600, 0.92), fix: t }, true); };
  const undo = () => { if (!past.length || busy) return; setAd(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setReview(null); };

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
    const blob = await (await fetch(ad)).blob();
    track("ad_downloaded", { template_id: tpl.id, template_category: tpl.category });
    saveBlob(blob, `${tpl.id}-my-product.${blob.type.includes("png") ? "png" : "jpg"}`);
  };

  const scoreHex = review ? (review.score >= 75 ? "#059669" : review.score >= 55 ? "#d97706" : "#e11d48") : "#059669";
  const pct = (v, lo, hi) => `${((v - lo) / (hi - lo)) * 100}%`;
  const ideas = ["Make the background a gym", "Make it brighter", "Change the headline to Run further"];

  return (
    <Shell
      studio
      title={inspired ? "Create a new ad inspired by this" : "Put my product in this ad"}
      sub={inspired ? `${tpl.title} · a brand new ad with your real product, in the mood of this one.` : `${tpl.title} · the same ad, one to one, with your real product in it.`}
      icon={null} onClose={onClose}
      footer={
        <>
          {busy && <span className="mr-auto inline-flex items-center gap-2.5 text-xs font-medium text-slate-500"><span className="sx-dot" />{busy} This can take up to a minute.</span>}
          {!busy && !ad && !photos.length && <span className="mr-auto text-xs font-medium text-slate-400">Add a product photo to begin</span>}
          {ad && !busy && past.length > 0 && <button onClick={undo} className="mr-auto text-xs font-semibold text-slate-500 transition hover:text-slate-900">Undo last change</button>}
          {ad && <button onClick={download} disabled={!!busy} className="sx-ghost inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"><Icon.Download className="h-4 w-4" /> Download</button>}
          <button id="make-go" ref={goRef} onClick={generate} disabled={!photos.length || !!busy} className={`${primaryBtn} !px-7 !py-3 !text-[15px]`}>
            {busy ? "Working…" : ad ? "Make another version" : `Generate my ad · ${makeCost(premium)} credits`}
          </button>
        </>
      }
    >
      <div ref={root} className="grid md:min-h-[590px] md:grid-cols-[minmax(0,390px)_1fr]">
        <div ref={stageRef} className="sx-stage px-8 pb-12 pt-14 md:px-10 md:pt-24">
          <div className="fx-glow" aria-hidden="true"><span className="sx-blob sx-blob-a" /><span className="sx-blob sx-blob-b" /><span className="sx-blob sx-blob-c" /></div>
          <div className="relative md:sticky md:top-8">
            <div className="fx-ad relative mx-auto w-full max-w-[290px]">
              <span className="fx-pulse sx-pulse" aria-hidden="true" />
              <div ref={frameRef} className="sx-ad relative aspect-[4/5] w-full overflow-hidden">
                <img id="make-result" src={ad || TEMPLATE_IMGS[tpl.id]} alt={ad ? "Your ad" : tpl.title} className={`absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-700 ${busy ? "opacity-60 blur-[3px]" : ""}`} />
                {ad && logoOpen && shownLogo && (
                  <img
                    src={shownLogo.src} alt="Your logo, drag to move" draggable={false}
                    onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
                    className="absolute z-10 cursor-move touch-none select-none outline-dashed outline-2 outline-offset-2 outline-white/90"
                    style={{ left: `${lp.x * 100}%`, top: `${lp.y * 100}%`, width: `${lp.s * 100}%`, transform: "translate(-50%, -50%)" }}
                  />
                )}
                <span className="fx-flash pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden="true" />
                {busy && <span ref={beamRef} className="sx-beam" aria-hidden="true" />}
              </div>
            </div>
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
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">{inspired ? "New ad studio" : "Product studio"}</p>
            <h2 className="mt-2 font-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950">{inspired ? "Create a new ad inspired by this" : "Put my product in this ad"}</h2>
            <p className="mt-2.5 max-w-md text-[13.5px] leading-relaxed text-slate-500">{inspired ? "A brand new ad with your real product, in the mood of this one." : "The same ad, one to one, with your real product in it."}</p>
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
                <Step n="02" done={!!headline.trim()} title="Headline on the image" hint="Leave empty for no text" htmlFor="make-headline">
                  <input id="make-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} className={`${field} !rounded-xl !py-3`} placeholder="e.g. Made to move in" />
                </Step>
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
                  <p className="mt-3 text-xs text-slate-400">Only what you ask for changes. Your product stays as it is in your photos.</p>
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

                {(!review || !logoOpen) && (
                  <div className="sx-actions">
                    {!review && (
                      <button id="make-check" onClick={check} disabled={!!busy} className="sx-action disabled:opacity-50">
                        <span><b>Score this ad</b><small>Check it before you run it</small></span><i aria-hidden="true">→</i>
                      </button>
                    )}
                    {!logoOpen && (
                      <button id="make-logo" onClick={() => setLogoOpen(true)} disabled={!!busy} className="sx-action disabled:opacity-50">
                        <span><b>Add your logo</b><small>Place it anywhere on the ad</small></span><i aria-hidden="true">→</i>
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
                      </>
                    )}
                    <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-4 rounded-b-2xl border-t border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
                      <button id="make-logo-apply" onClick={applyLogo} disabled={!logo || !!busy} className={primaryBtn}>Add to my ad</button>
                      <button onClick={() => { setLogoOpen(false); setLogo(null); setLogoCut(false); }} className="text-xs font-semibold text-slate-500 transition hover:text-slate-900">Cancel</button>
                    </div>
                  </div>
                )}
                <button onClick={() => { setPast([]); setAd(""); setReview(null); setLogoOpen(false); setLogo(null); }} disabled={!!busy} className="w-fit text-xs font-semibold text-slate-500 transition hover:text-slate-900">← Change the photos or the headline</button>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

export { BrandModal, InspireModal, ProductModal, cutBackground };
