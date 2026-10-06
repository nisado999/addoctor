import { useState, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { field, copyText, SPY_API, SPY_KEY } from "./shared.js";
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-900/20 sm:rounded-3xl"
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

function LogoDrop({ logo, onLogo, notify }) {
  const fileRef = useRef(null);
  const take = async (file) => { const l = await readLogo(file, notify); if (l) onLogo(l); };
  return (
    <>
      <button
        type="button" onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-left transition hover:border-blue-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon.Upload className="h-5 w-5" /></span>
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

const MAKE_COST = 2;

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

async function makeCall(path, body, signal) {
  const r = await fetch(SPY_API + path, { method: "POST", signal, headers: { "Content-Type": "application/json", ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 404 ? "The AdDoctor server has not been updated for this yet." : j.error || "Request failed (" + r.status + ")");
  return j;
}

function ProductModal({ tpl, onClose, notify, onSpend }) {
  useModal(onClose);
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
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
  const fileRef = useRef(null);
  const ctrl = useRef(null);
  useEffect(() => () => { if (ctrl.current) ctrl.current.abort(); }, []);

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
      const out = await makeCall("/make/ad", { refs: photos.map((p) => p.src), headline: headline.trim(), quality: premium ? "premium" : "standard", ...body }, c.signal);
      if (ad) setPast((p) => [...p, ad].slice(-6));
      setAd(`data:${out.mime};base64,${out.data}`);
      setReview(null); setFix("");
      if (spendNow && onSpend) onSpend(MAKE_COST);
    } catch (e) { if (!c.signal.aborted) setErr(e.message || "Something went wrong. Try again."); }
    setBusy("");
  };

  const generate = async () => {
    const template = await shrinkPhoto(TEMPLATE_IMGS[tpl.id], 1000);
    run("Building the scene around your product…", { template, about: tpl.desc || "", note: note.trim() }, true);
  };
  const edit = async (text) => { const t = (text || "").trim(); if (t && ad && !busy) run("Applying your change…", { base: await shrinkPhoto(ad, 1600, 0.92), fix: t }, true); };
  const undo = () => { if (!past.length || busy) return; setAd(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setReview(null); };

  const check = async () => {
    if (busy || !ad) return;
    setBusy("Scoring this ad…"); setErr("");
    try {
      const small = await shrinkPhoto(ad, 900, 0.85);
      setReview(await makeCall("/make/review", { image: small, headline: headline.trim(), refs: photos.slice(0, 2).map((p) => p.src) }));
    } catch (e) { setErr(e.message || "The check failed. Try again."); }
    setBusy("");
  };

  const download = async () => {
    const blob = await (await fetch(ad)).blob();
    saveBlob(blob, `${tpl.id}-my-product.${blob.type.includes("png") ? "png" : "jpg"}`);
  };

  const tone = review ? (review.score >= 75 ? "text-emerald-600" : review.score >= 55 ? "text-amber-600" : "text-rose-600") : "";

  return (
    <Shell
      title="Make it with my product" sub={`${tpl.title} · a new ad in this style, with your real product in it.`}
      icon={<Icon.Wand className="h-5 w-5" />} onClose={onClose}
      footer={
        <>
          {busy && <span className="mr-auto text-xs font-medium text-slate-500">{busy} This can take up to a minute.</span>}
          {ad && !busy && past.length > 0 && <button onClick={undo} className="mr-auto text-xs font-semibold text-slate-500 hover:text-slate-800">Undo last change</button>}
          {ad && <button onClick={download} disabled={!!busy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:opacity-50"><Icon.Download className="h-4 w-4" /> Download</button>}
          <button id="make-go" onClick={generate} disabled={!photos.length || !!busy} className={primaryBtn}>
            <Icon.Sparkle className="h-4 w-4" /> {busy ? "Working…" : ad ? "Make another version" : `Generate my ad · ${MAKE_COST} credits`}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
        <div className="mx-auto w-full max-w-[260px]">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-sm">
            <img id="make-result" src={ad || TEMPLATE_IMGS[tpl.id]} alt={ad ? "Your ad" : tpl.title} className={`absolute inset-0 h-full w-full object-cover transition ${busy ? "opacity-50" : ""}`} />
            {busy && <span className="absolute inset-0 grid place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/60 border-t-blue-600" /></span>}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">{ad ? "Your ad" : isVideo ? "The look your ad will copy (first frame of the video)" : "The look your ad will copy"}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {err && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{err}</p>}

          {!ad ? (
            <>
              <div>
                <span className={lab}>1. Photos of your product <span className="font-normal text-slate-400">(1 to 3, plain background works best)</span></span>
                <div className="flex flex-wrap gap-2.5">
                  {photos.map((p, i) => (
                    <span key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <img src={p.src} alt={p.name} className="h-full w-full object-cover" />
                      <button onClick={() => setPhotos((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${p.name}`} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-600 shadow hover:text-rose-600"><Icon.Close className="h-3 w-3" /></button>
                    </span>
                  ))}
                  {photos.length < 3 && (
                    <button
                      type="button" id="make-upload" onClick={() => fileRef.current && fileRef.current.click()}
                      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}
                      className={`flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 text-left transition hover:border-blue-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${photos.length ? "h-20" : "w-full py-4"}`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon.Upload className="h-5 w-5" /></span>
                      {!photos.length && <span><span className="block text-sm font-semibold text-slate-900">Upload a product photo</span><span className="block text-xs text-slate-500">The ad will show this exact product: same shape, colour and logo.</span></span>}
                    </button>
                  )}
                </div>
                <input ref={fileRef} id="make-file" type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </div>
              <div>
                <label htmlFor="make-headline" className={lab}>2. Headline on the image <span className="font-normal text-slate-400">(leave empty for no text)</span></label>
                <input id="make-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} className={field} placeholder="e.g. Made to move in" />
              </div>
              <div>
                <label htmlFor="make-note" className={lab}>3. Anything to know? <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="make-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={field} placeholder="e.g. women's running top, worn by a woman in her 30s" />
              </div>
              <label className="flex items-center gap-2.5 text-[13px] text-slate-600">
                <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                Best quality <span className="text-slate-400">(slower, costs more to generate)</span>
              </label>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="make-fix" className={lab}>Change something</label>
                <div className="flex gap-2">
                  <input id="make-fix" value={fix} onChange={(e) => setFix(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") edit(fix); }} maxLength={500} className={field} placeholder="e.g. make the background a gym · change the headline to Run further" />
                  <button id="make-apply" onClick={() => edit(fix)} disabled={!fix.trim() || !!busy} className="shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">Apply</button>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Only what you ask for changes. Your product stays as it is in your photos.</p>
              </div>

              {!review ? (
                <button id="make-check" onClick={check} disabled={!!busy} className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50">
                  <Icon.Stethoscope className="h-4 w-4" /> Score this ad before you run it
                </button>
              ) : (
                <div id="make-review" className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-baseline gap-3">
                    <span className={`text-3xl font-bold tabular-nums ${tone}`}>{review.score}</span>
                    <p className="text-[13px] leading-snug text-slate-700">{review.verdict}</p>
                  </div>
                  {review.strengths.length > 0 && <ul className="mt-3 space-y-1.5 text-[13px] text-slate-600">{review.strengths.map((s) => <li key={s} className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>{s}</span></li>)}</ul>}
                  {review.fixes.length > 0 && <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600">{review.fixes.map((s) => <li key={s} className="flex gap-2"><Icon.Alert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /><span>{s}</span></li>)}</ul>}
                  {review.regen && <button id="make-autofix" onClick={() => edit(review.regen)} disabled={!!busy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"><Icon.Wand className="h-3.5 w-3.5" /> Apply these fixes</button>}
                </div>
              )}
              <button onClick={() => { setPast([]); setAd(""); setReview(null); }} disabled={!!busy} className="w-fit text-xs font-semibold text-slate-500 hover:text-slate-800">← Change the photos or the headline</button>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

export { BrandModal, InspireModal, ProductModal };
