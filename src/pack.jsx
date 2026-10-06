import { useState, useRef } from "react";
import { Icon } from "./ui";
import { copyText, SPY_API, SPY_KEY } from "./shared.js";

/* ------------------------------ Social Pack ------------------------------ */

const PACK_SIZES = [
  { n: 6, label: "Starter", note: "A quick test" },
  { n: 12, label: "Two weeks", note: "Posting every other day" },
  { n: 30, label: "Full month", note: "A post a day" },
];
const PACK_TONES = ["Warm and friendly", "Premium and calm", "Bold and playful", "Clear and expert"];
const PACK_IDEAS = [
  "Handmade soy candles in recycled glass jars, hand-poured in small batches. For people who want a cozy home without harsh perfumes.",
  "A lightweight daily mineral sunscreen for sensitive skin. No white cast, no strong smell, works under makeup.",
  "Organic cotton basics for kids: soft, durable, made in Portugal. For parents who want fewer, better things.",
];

function packHeaders() { return { "Content-Type": "application/json", ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) }; }
async function packCall(path, body, signal) {
  const r = await fetch(SPY_API + path, { method: "POST", signal, headers: packHeaders(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "Request failed (" + r.status + ")"); e.status = r.status; throw e; }
  return j;
}

/* Shrink an image to a small JPEG for the post check. */
function packShrink(src, maxW = 900) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, maxW / im.width);
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    im.onerror = () => rej(new Error("Could not read the image"));
    im.src = src;
  });
}

/* Tiny store-only ZIP writer so "Download all" needs no library. */
const PACK_CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function packCrc(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = PACK_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function packZip(files) {
  const enc = new TextEncoder(); const parts = []; const cd = []; let off = 0;
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]);
  const push = (a) => { parts.push(a); off += a.length; };
  files.forEach((f) => {
    const name = enc.encode(f.name); const crc = packCrc(f.data); const start = off;
    [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name, f.data].forEach(push);
    cd.push([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(start), name]);
  });
  const cdStart = off; cd.forEach((row) => row.forEach(push));
  [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(off - cdStart), u32(cdStart), u16(0)].forEach(push);
  return new Blob(parts, { type: "application/zip" });
}
function packB64(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
const packExt = (m) => (/jpe?g/.test(m || "") ? "jpg" : /webp/.test(m || "") ? "webp" : "png");
const packSlug = (t) => String(t || "post").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "post";
function packSave(blob, name) {
  const u = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

const PACK_TYPE_LABEL = {
  "product-hero": "Hero shot", lifestyle: "Lifestyle", "quick-tip": "Quick tip", detail: "Detail", "myth-truth": "Myth vs truth",
  "flat-lay": "Flat lay", "benefit-callout": "Benefit", checklist: "Checklist", "brand-quote": "Brand voice", "behind-the-scenes": "Behind the scenes",
};

function PackCard({ post, onCopy, onDownload, onCheck, onFix, busy }) {
  const full = [post.caption, (post.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  const rv = post.review;
  const tone = rv ? (rv.score >= 80 ? "emerald" : rv.score >= 60 ? "amber" : "rose") : "slate";
  const badge = { emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100", amber: "bg-amber-50 text-amber-700 ring-amber-100", rose: "bg-rose-50 text-rose-700 ring-rose-100", slate: "bg-slate-50 text-slate-600 ring-slate-100" }[tone];
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm">
      <div className="relative bg-slate-100" style={{ aspectRatio: "4 / 5" }}>
        {post.src ? (
          <img src={post.src} alt={post.title} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center p-6 text-center">
            {post.error ? (
              <div>
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600"><Icon.Alert className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-900">This image did not render</p>
                <p className="mt-1 text-xs text-slate-500">{post.error}</p>
                <button onClick={() => onFix(post, "")} className="mt-3 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Try again</button>
              </div>
            ) : (
              <div>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                <p className="mt-3 text-xs font-medium text-slate-500">{post.title || "Preparing"}…</p>
              </div>
            )}
          </div>
        )}
        {post.src && busy && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">{PACK_TYPE_LABEL[post.type] || post.type}</span>
        {rv && <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${badge}`}>{rv.score}/100</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-sm font-semibold text-slate-900">{post.title}</p>
        <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-600">{post.caption}</p>
        <p className="mt-2 text-[12px] font-medium leading-relaxed text-blue-600">{(post.hashtags || []).join(" ")}</p>

        {rv && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <p className="text-[13px] font-semibold text-slate-900">{rv.verdict}</p>
            {rv.strengths && rv.strengths.length > 0 && (
              <ul className="mt-2 space-y-1">{rv.strengths.map((t, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-slate-600"><span className="mt-0.5 text-emerald-500"><Icon.Check className="h-3.5 w-3.5" /></span>{t}</li>))}</ul>
            )}
            {rv.fixes && rv.fixes.length > 0 && (
              <ul className="mt-2 space-y-1">{rv.fixes.map((t, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-slate-600"><span className="mt-0.5 text-blue-500"><Icon.Wand className="h-3.5 w-3.5" /></span>{t}</li>))}</ul>
            )}
            {rv.regen && (
              <button disabled={busy} onClick={() => onFix(post, rv.regen)} className="mt-3 w-full rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Apply fixes and regenerate image</button>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button onClick={() => onCopy(full)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"><Icon.Copy className="h-3.5 w-3.5" />Copy caption</button>
          <button disabled={!post.src} onClick={() => onDownload(post)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"><Icon.Download className="h-3.5 w-3.5" />Download</button>
          <button disabled={!post.src || busy} onClick={() => onCheck(post)} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100 disabled:opacity-40"><Icon.Stethoscope className="h-3.5 w-3.5" />{rv ? "Re-check" : "Check this post"}</button>
        </div>
      </div>
    </article>
  );
}

function PackView({ notify, credits, onSpend }) {
  const [desc, setDesc] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(PACK_TONES[0]);
  const [size, setSize] = useState(6);
  const [quality, setQuality] = useState("standard");
  const [mode, setMode] = useState("store"); // store | upload | describe
  const [storeUrl, setStoreUrl] = useState("");
  const [store, setStore] = useState(null);
  const [picked, setPicked] = useState([]);
  const [files, setFiles] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState("form"); // form | working | done
  const [status, setStatus] = useState("");
  const [brief, setBrief] = useState(null);
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState({});
  const [err, setErr] = useState("");
  const ctrl = useRef(null);
  const postsRef = useRef([]);
  const briefRef = useRef(null);
  const qualityRef = useRef("standard");
  const refsRef = useRef([]);

  const unit = quality === "premium" ? 2 : 1;
  const cost = size * unit;
  const setP = (idx, patch) => { postsRef.current = postsRef.current.map((p) => (p.index === idx ? { ...p, ...patch } : p)); setPosts(postsRef.current); };

  const renderImage = async (post, fix, signal) => {
    const refs = refsRef.current.slice(0, 4);
    const r = await packCall("/pack/image", { refs, prompt: post.imagePrompt, overlayText: post.overlayText, brief: briefRef.current, quality: qualityRef.current, fix: fix || "" }, signal);
    return { src: `data:${r.mime};base64,${r.data}`, mime: r.mime, b64: r.data };
  };

  const fetchStore = async () => {
    if (!SPY_API) { setErr("The Social Pack needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (storeUrl.trim().length < 4) { setErr("Paste a link to your shop, a collection or a product first."); return; }
    setErr(""); setFetching(true); setStore(null);
    try {
      const r = await packCall("/pack/store", { url: storeUrl.trim() });
      setStore(r); setDesc(r.description || ""); setPicked((r.images || []).slice(0, 4).map((i) => i.url));
    } catch (e) { setErr(e.message || "Could not read that link"); }
    setFetching(false);
  };
  const togglePick = (u) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : p.length >= 6 ? p : p.concat(u)));
  const addFiles = async (list) => {
    const arr = Array.from(list || []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, Math.max(0, 6 - files.length));
    if (!arr.length) { setErr("Choose JPG, PNG or WebP photos (up to 6)."); return; }
    const out = [];
    for (const f of arr) {
      try {
        const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        out.push({ id: Math.random().toString(36).slice(2), name: f.name, src: await packShrink(url, 900) });
      } catch (e) { /* skip unreadable file */ }
    }
    if (out.length) { setFiles((p) => p.concat(out)); setErr(""); } else setErr("Those photos could not be read.");
  };

  const generate = async () => {
    if (!SPY_API) { setErr("The Social Pack needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (mode === "store" && !picked.length) { setErr("Fetch your store link and keep at least one product photo."); return; }
    if (mode === "upload" && !files.length) { setErr("Add at least one product photo."); return; }
    if (mode === "describe" && desc.trim().length < 20) { setErr("Describe your product in a sentence or two so the posts feel specific."); return; }
    if (credits < cost) { setErr(`This pack needs ${cost} credits and you have ${credits}.`); return; }
    setErr(""); setPhase("working"); setPosts([]); postsRef.current = []; setBrief(null);
    qualityRef.current = quality;
    refsRef.current = mode === "upload" ? files.map((f) => ({ data: f.src })) : mode === "store" ? picked.map((url) => ({ url })) : [];
    const c = new AbortController(); ctrl.current = c;
    try {
      setStatus("Reading your product and setting the visual style…");
      const b = (await packCall("/pack/brief", { description: desc, audience, tone, language: "", images: mode === "upload" ? files.slice(0, 3).map((f) => f.src) : [], imageUrls: mode === "store" ? picked.slice(0, 3) : [] }, c.signal)).brief;
      briefRef.current = b; setBrief(b);
      const all = Array.from({ length: size }, (_, i) => i);
      for (let i = 0; i < all.length; i += 6) {
        const idx = all.slice(i, i + 6);
        setStatus(`Planning posts ${idx[0] + 1}–${idx[idx.length - 1] + 1} of ${size}…`);
        const got = (await packCall("/pack/posts", { brief: b, indexes: idx, total: size, photos: refsRef.current.length > 0 }, c.signal)).posts;
        postsRef.current = postsRef.current.concat(got.map((p) => ({ ...p, src: "", error: "" })));
        setPosts(postsRef.current);
      }
      let done = 0; let failed = 0; let next = 0;
      const total = postsRef.current.length;
      const worker = async () => {
        while (next < total && !c.signal.aborted) {
          const p = postsRef.current[next++];
          try {
            const im = await renderImage(p, "", c.signal);
            setP(p.index, { ...im, error: "" }); done++;
          } catch (e) {
            if (c.signal.aborted) return;
            setP(p.index, { error: e.message || "Image failed" }); failed++;
          }
          setStatus(`Creating images… ${done + failed} of ${total}`);
        }
      };
      await Promise.all([worker(), worker()]);
      if (c.signal.aborted) return;
      onSpend(Math.max(1, (done * unit)));
      setStatus(""); setPhase("done");
      notify(failed ? `${done} posts ready, ${failed} need a retry.` : `All ${done} posts are ready.`, 3200);
    } catch (e) {
      if (c.signal.aborted) return;
      setErr(e.message || "Something went wrong"); setPhase(postsRef.current.length ? "done" : "form"); setStatus("");
    }
  };

  const stop = () => { if (ctrl.current) ctrl.current.abort(); setPhase(postsRef.current.length ? "done" : "form"); setStatus(""); };

  const check = async (p) => {
    setBusy((b) => ({ ...b, [p.index]: true }));
    try {
      const small = await packShrink(p.src);
      const rv = await packCall("/pack/review", { image: small, caption: [p.caption, (p.hashtags || []).join(" ")].join("\n"), overlayText: p.overlayText, brief: briefRef.current, refs: refsRef.current.slice(0, 3) });
      setP(p.index, { review: rv });
    } catch (e) { notify(e.message || "The check failed", 3000); }
    setBusy((b) => ({ ...b, [p.index]: false }));
  };

  const fix = async (p, note) => {
    setBusy((b) => ({ ...b, [p.index]: true }));
    try {
      const im = await renderImage(p, note, null);
      setP(p.index, { ...im, error: "", review: null });
      onSpend(unit);
    } catch (e) { setP(p.index, p.src ? {} : { error: e.message }); notify(e.message || "The image failed", 3200); }
    setBusy((b) => ({ ...b, [p.index]: false }));
  };

  const dl = (p) => packSave(new Blob([packB64(p.b64)], { type: p.mime }), `${String(p.index + 1).padStart(2, "0")}-${packSlug(p.title)}.${packExt(p.mime)}`);
  const dlAll = () => {
    const ready = posts.filter((p) => p.b64);
    if (!ready.length) return;
    const enc = new TextEncoder();
    const files = [];
    ready.forEach((p) => {
      const base = `${String(p.index + 1).padStart(2, "0")}-${packSlug(p.title)}`;
      files.push({ name: `${base}.${packExt(p.mime)}`, data: packB64(p.b64) });
      files.push({ name: `${base}.txt`, data: enc.encode([p.caption, (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n")) });
    });
    packSave(packZip(files), "addoctor-social-pack.zip");
  };
  const copyAll = () => { copyText(posts.map((p, i) => `Post ${i + 1}: ${p.title}\n${p.caption}\n${(p.hashtags || []).join(" ")}`).join("\n\n---\n\n")); notify("All captions copied."); };

  const readyCount = posts.filter((p) => p.src).length;

  if (phase === "form") {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon.Image className="h-5 w-5" /></div>
            <div>
              <p className="text-base font-semibold text-slate-900">Create a month of organic posts</p>
              <p className="text-sm text-slate-500">Paste your store, upload product photos, or just describe it. Each post can be checked and fixed.</p>
            </div>
          </div>

          <div role="tablist" className="mt-6 grid gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-3">
            {[["store", "Store link", "Shop, collection or product page", Icon.Tag, "Best"], ["upload", "Upload photos", "Your own product photos", Icon.Upload], ["describe", "Describe it", "No photos? Tell us what you sell", Icon.Wand]].map(([k, t, d, Ic, tag]) => (
              <button key={k} id={"pack-mode-" + k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setErr(""); }}
                className={`rounded-xl px-4 py-3 text-left transition ${mode === k ? "bg-white shadow-sm ring-1 ring-slate-200" : "hover:bg-white/60"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Ic className={`h-4 w-4 ${mode === k ? "text-blue-600" : "text-slate-400"}`} />{t}{tag && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{tag}</span>}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{d}</span>
              </button>
            ))}
          </div>

          {mode === "store" && (
            <div className="mt-5">
              <label htmlFor="pack-url" className="block text-sm font-semibold text-slate-900">Your store link</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input id="pack-url" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchStore()} placeholder="https://yourstore.com/collections/hoodies"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                <button id="pack-fetch" onClick={fetchStore} disabled={fetching} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{fetching ? "Reading…" : store ? "Read again" : "Fetch details"}</button>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Works best with shop homepages, collections and product pages. We read the product names, text and photos.</p>
              {store && (
                <div id="pack-store" className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-sm font-semibold text-slate-900">Found: {store.name}</p>
                  <label htmlFor="pack-desc" className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">What we understood (edit if needed)</label>
                  <textarea id="pack-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={700}
                    className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Product photos to use <span className="font-normal normal-case text-slate-400">· {picked.length} of up to 6 selected</span></p>
                  {store.images && store.images.length ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {store.images.map((im) => {
                        const on = picked.includes(im.url);
                        return (
                          <button key={im.url} onClick={() => togglePick(im.url)} aria-pressed={on} title={im.label}
                            className={`relative overflow-hidden rounded-xl bg-slate-100 ring-2 transition ${on ? "ring-blue-600" : "ring-transparent opacity-70 hover:opacity-100"}`} style={{ aspectRatio: "1 / 1" }}>
                            <img src={im.url} alt={im.label || "Product"} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                            {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Icon.Check className="h-3 w-3" /></span>}
                          </button>
                        );
                      })}
                    </div>
                  ) : <p className="mt-2 text-sm text-slate-500">No photos found on that page. Try a product link or Upload photos.</p>}
                </div>
              )}
            </div>
          )}

          {mode === "upload" && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-900">Your product photos</p>
              <label htmlFor="pack-files" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                className={`mt-2 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${drag ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-blue-600 ring-1 ring-slate-200"><Icon.Upload className="h-5 w-5" /></span>
                <span className="mt-3 text-sm font-semibold text-slate-900">Drop photos here or click to choose</span>
                <span className="mt-1 text-xs text-slate-500">Flat lays, on-model shots or packaging. JPG, PNG or WebP, up to 6.</span>
                <input id="pack-files" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {files.length > 0 && (
                <div id="pack-thumbs" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {files.map((f) => (
                    <div key={f.id} className="relative overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200" style={{ aspectRatio: "1 / 1" }}>
                      <img src={f.src} alt={f.name} className="h-full w-full object-cover" />
                      <button aria-label={"Remove " + f.name} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-900/80 text-white hover:bg-slate-900"><Icon.Close className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <label htmlFor="pack-desc" className="mt-4 block text-sm font-semibold text-slate-900">Anything we should know? <span className="font-normal text-slate-400">optional</span></label>
              <textarea id="pack-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={700} placeholder="Brand name, what makes it special, who it is for."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </div>
          )}

          {mode === "describe" && (
            <div className="mt-5">
              <label htmlFor="pack-desc" className="block text-sm font-semibold text-slate-900">What do you sell?</label>
              <textarea id="pack-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={700}
                placeholder="Describe the product, who it is for, and what makes it different."
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              <div className="mt-2 flex flex-wrap gap-2">
                {PACK_IDEAS.map((t, i) => (
                  <button key={i} onClick={() => setDesc(t)} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">Example {i + 1}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pack-aud" className="block text-sm font-semibold text-slate-900">Audience <span className="font-normal text-slate-400">optional</span></label>
              <input id="pack-aud" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} placeholder="Women 25–40 who care about…"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="pack-tone" className="block text-sm font-semibold text-slate-900">Tone</label>
              <select id="pack-tone" value={tone} onChange={(e) => setTone(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                {PACK_TONES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <p className="mt-6 text-sm font-semibold text-slate-900">How many posts?</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {PACK_SIZES.map((s) => (
              <button key={s.n} onClick={() => setSize(s.n)} aria-pressed={size === s.n}
                className={`rounded-2xl p-4 text-left ring-1 transition ${size === s.n ? "bg-blue-50 ring-2 ring-blue-600" : "bg-white ring-slate-200 hover:bg-slate-50"}`}>
                <p className="text-lg font-bold text-slate-900">{s.n}</p>
                <p className="text-sm font-semibold text-slate-700">{s.label}</p>
                <p className="text-xs text-slate-500">{s.note}</p>
              </button>
            ))}
          </div>

          <p className="mt-6 text-sm font-semibold text-slate-900">Image quality</p>
          <div className="mt-2 inline-flex rounded-full bg-slate-100 p-1">
            {[["standard", "Standard"], ["premium", "Premium"]].map(([k, l]) => (
              <button key={k} onClick={() => setQuality(k)} aria-pressed={quality === k}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${quality === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Premium uses the best image model: sharper text on images, 2 credits per post.</p>

          {err && <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">{err}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button id="pack-go" onClick={generate} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
              <Icon.Sparkle className="h-4 w-4" />Create {size} posts
            </button>
            <p className="text-sm text-slate-500"><span className="font-semibold text-slate-900">{cost} credits</span> · you have {credits}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm">
        <div className="min-w-0">
          {phase === "working" ? (
            <p id="pack-status" className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />{status}</p>
          ) : (
            <p className="text-sm font-semibold text-slate-900">{readyCount} of {posts.length} posts ready</p>
          )}
          {brief && <p className="mt-0.5 truncate text-xs text-slate-500">{brief.product}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === "working" ? (
            <button onClick={stop} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Stop</button>
          ) : (
            <>
              <button onClick={copyAll} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Copy all captions</button>
              <button id="pack-dlall" onClick={dlAll} disabled={!readyCount} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"><Icon.Download className="h-3.5 w-3.5" />Download all</button>
              <button onClick={() => { setPhase("form"); setErr(""); }} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">New pack</button>
            </>
          )}
        </div>
      </div>
      {err && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">{err}</p>}
      <div id="pack-grid" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {posts.map((p) => <PackCard key={p.index} post={p} busy={!!busy[p.index]} onCopy={(t) => { copyText(t); notify("Caption copied."); }} onDownload={dl} onCheck={check} onFix={fix} />)}
      </div>
    </div>
  );
}

export { PACK_SIZES, PACK_TONES, PACK_IDEAS, packHeaders, packCall, packShrink, PACK_CRC, packCrc, packZip, packB64, packExt, packSlug, packSave, PACK_TYPE_LABEL, PackCard, PackView };
