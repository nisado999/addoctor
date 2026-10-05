import React, { useState, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { field, copyText } from "./modal";
import { TEMPLATE_IMGS, TEMPLATE_VIDS } from "./templateImgs.js";

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

function Shell({ title, sub, icon, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-900/20 sm:rounded-3xl"
      >
        <header className="flex items-start gap-3.5 border-b border-slate-100 px-6 py-5 md:px-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">{icon}</span>
          <div className="min-w-0 flex-1 pr-8">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">{sub}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
            <Icon.Close className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-6 md:px-8">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4 md:px-8">{footer}</footer>}
      </div>
    </div>
  );
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

function BrandModal({ tpl, onClose, notify }) {
  useModal(onClose);
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
  const [logo, setLogo] = useState(null); // { src, img, ratio, name }
  const [spot, setSpot] = useState("br");
  const [size, setSize] = useState(0.26);
  const [busy, setBusy] = useState(null); // null | 0..1
  const fileRef = useRef(null);

  const onFile = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { notify("Use a PNG, JPG, WEBP or SVG logo."); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const img = await loadImage(reader.result);
        setLogo({ src: reader.result, img, ratio: (img.naturalWidth || 300) / (img.naturalHeight || 150), name: file.name });
      } catch (e) { notify("That logo file could not be read."); }
    };
    reader.readAsDataURL(file);
  };

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
            <button
              onClick={() => fileRef.current && fileRef.current.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-left transition hover:border-blue-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon.Upload className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{logo ? logo.name : "Upload your logo"}</span>
                <span className="block text-xs text-slate-500">{logo ? "Click to choose a different file." : "PNG with a transparent background works best. It never leaves your browser."}</span>
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onFile(e.target.files[0])} />
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

const PLACEMENTS = ["on the product or packaging", "on the clothing, small, on the chest", "as a small corner mark in the last two seconds", "on a sign or surface in the scene"];

function inspirePrompt(tpl, f) {
  const brand = f.brand.trim() || "[your brand]";
  const product = f.product.trim() || "[your product]";
  const scene = (tpl.desc || tpl.primary || "").replace(/^A[n]? [^.]*? clip for [^.]*\.\s*/i, "");
  return [
    "Vertical 9:16 video, 8 seconds, no on-screen text, no captions, no music.",
    `Scene and style to follow: ${scene}`,
    `Make it for ${brand}. The product shown is ${product}.`,
    `Show the ${brand} logo ${f.place}, exactly as in the attached logo file, sharp and correctly spelled. No other logos or lettering anywhere.`,
    "Keep the same lighting, mood, framing and camera movement as the reference. It must look like real footage: natural light, true-to-life colours, realistic physics.",
    f.notes.trim() ? `Also: ${f.notes.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function InspireModal({ tpl, onClose, notify }) {
  useModal(onClose);
  const [f, setF] = useState({ brand: "", product: "", place: PLACEMENTS[0], notes: "" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const prompt = inspirePrompt(tpl, f);
  const ready = f.brand.trim().length > 1 && f.product.trim().length > 1;

  const copy = async () => {
    const ok = await copyText(prompt);
    notify(ok ? "Brief copied" : "Copy failed. Select the text and copy it by hand.", 2400);
  };

  return (
    <Shell
      title="Make a new one inspired by it" sub={`${tpl.title} · a new video in this style, with your brand, product and logo.`}
      icon={<Icon.Wand className="h-5 w-5" />} onClose={onClose}
      footer={<button onClick={copy} disabled={!ready} className={primaryBtn}><Icon.Copy className="h-4 w-4" /> Copy the brief</button>}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,200px)_1fr]">
        <div className="mx-auto w-full max-w-[200px]">
          <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-sm">
            <video src={TEMPLATE_VIDS[tpl.id]} poster={TEMPLATE_IMGS[tpl.id]} muted loop autoPlay playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Reference</p>
        </div>

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
            <label htmlFor="in-place" className={lab}>Where the logo goes</label>
            <select id="in-place" value={f.place} onChange={set("place")} className={field}>
              {PLACEMENTS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="in-notes" className={lab}>Anything to change <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="in-notes" value={f.notes} onChange={set("notes")} maxLength={160} placeholder="e.g. shoot it at night, use a female model" className={field} />
          </div>

          <div>
            <span className={lab}>Your brief</span>
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3.5 text-xs leading-relaxed text-slate-700">{prompt}</pre>
          </div>

          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
            Video generation is not built into this preview yet. Copy the brief and paste it into your video generator together with your logo file and a frame from this template.
          </p>
        </div>
      </div>
    </Shell>
  );
}

export { BrandModal, InspireModal };
