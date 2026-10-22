import { useState, useRef, useEffect } from "react";
import { Icon } from "./ui";
import { SPY_API } from "./shared.js";
import { apiFetch } from "./api.js";
import { imageCost } from "./billing.js";
import { packShrink, packB64, packExt, packSave } from "./pack";

/* ---------------------- Guided builder: an interview, then an ad made for this customer ---------------------- */

const VIDEO_KEY = "addoctor.videobrief.v1";
const VERSIONS = 3;
const call = (path, body, signal) => apiFetch(path, { body, signal, timeout: 180000 });   // one image can take a while

// type: text | area | choice. "site" marks what a website reading can answer. "custom" lets a choice be typed instead.
const SHARED_START = [
  { id: "brand", site: true, label: "What is your brand called?", type: "text", ph: "e.g. Nova Skincare" },
  { id: "sells", site: true, label: "What do you sell, in a sentence?", type: "area", ph: "e.g. A lightweight daily sunscreen for sensitive skin" },
  { id: "offer", label: "Do you have an offer?", hint: "Optional. We only print an offer you give us.", type: "text", ph: "e.g. 20% off your first order", optional: true },
  { id: "audience", label: "Who is it for?", type: "text", ph: "e.g. Women 25-40 with sensitive skin", optional: true },
  { id: "goal", label: "What should the ad get people to do?", type: "choice", options: ["Buy now", "Sign up or get a lead", "Install an app", "Get to know the brand"] },
  { id: "tone", label: "What should it feel like?", type: "choice", options: ["Clean and premium", "Bold and loud", "Warm and friendly", "Playful and fun"] },
];
const STATIC_QUESTIONS = [
  ...SHARED_START,
  { id: "wording", label: "Words on the image?", type: "choice", options: ["Write a headline for me", "No text, picture only"], custom: "Or type your own headline" },
  { id: "ratio", label: "Where will it run?", type: "choice", options: ["Feed (4:5)", "Square (1:1)", "Story or Reel (9:16)"] },
];
const VIDEO_QUESTIONS = [
  ...SHARED_START,
  { id: "style", label: "What kind of video?", type: "choice", options: ["Real person talking (UGC)", "Product in use", "Cinematic and clean", "Text and motion only"] },
  { id: "hook", label: "Any hook or idea in mind?", hint: "Optional. The first line people should see.", type: "text", ph: "e.g. Stop wasting money on sunscreen that leaves a white cast", optional: true },
  { id: "length", label: "How long?", type: "choice", options: ["Around 6 seconds", "Around 15 seconds", "Around 30 seconds"] },
];
const RATIO_OF = { "Feed (4:5)": "4:5", "Square (1:1)": "1:1", "Story or Reel (9:16)": "9:16" };

const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10";
const btnDark = "rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40";
const btnLight = "rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900";

const read = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

function Spinner() { return <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />; }

function AdCard({ v, onDownload, onCheck, onRetry, busy }) {
  const rv = v.review;
  const tone = rv ? (rv.score >= 80 ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : rv.score >= 60 ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-rose-50 text-rose-700 ring-rose-100") : "";
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="relative bg-slate-100" style={{ aspectRatio: v.ratio.replace(":", " / ") }}>
        {v.src ? <img src={v.src} alt={v.title} className="h-full w-full object-cover" /> : (
          <div className="grid h-full w-full place-items-center p-6 text-center">
            {v.error ? (
              <div>
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600"><Icon.Alert className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-900">Not generated</p>
                <p className="mt-1 text-xs text-slate-500">{v.error}</p>
                <button onClick={() => onRetry(v)} className="mt-3 rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Retry</button>
              </div>
            ) : <div><Spinner /><p className="mt-3 text-xs font-medium text-slate-500">{v.title}…</p></div>}
          </div>
        )}
        {v.src && busy && <div className="absolute inset-0 grid place-items-center bg-white/70"><Spinner /></div>}
        {rv && <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone}`}>{rv.score}/100</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-slate-900">{v.title}</p>
        <p className="text-xs text-slate-500">{v.angle}</p>
        {rv && rv.fixes && rv.fixes[0] && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{rv.fixes[0]}</p>}
        {v.src && (
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <button onClick={() => onDownload(v)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Icon.Download className="h-3.5 w-3.5" />Download</button>
            <button disabled={busy} onClick={() => onCheck(v)} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50">Check score</button>
            <button disabled={busy} onClick={() => onRetry(v)} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50">New version</button>
          </div>
        )}
      </div>
    </article>
  );
}

export function GuidedView({ kind = "static", notify, credits, onSpend }) {
  const video = kind === "video";
  const questions = video ? VIDEO_QUESTIONS : STATIC_QUESTIONS;
  const [phase, setPhase] = useState("source");   // source | questions | making | done | brief
  const [source, setSource] = useState("");        // photo | site | none
  const [files, setFiles] = useState([]);          // [{id, src}]
  const [url, setUrl] = useState("");
  const [site, setSite] = useState(null);          // {name, description, images}
  const [picked, setPicked] = useState([]);
  const [reading, setReading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [ads, setAds] = useState([]);
  const [busy, setBusy] = useState({});
  const adsRef = useRef([]);
  const ctxRef = useRef({});
  const life = useRef(new AbortController());
  useEffect(() => { const l = life.current; return () => l.abort(); }, []);

  const unit = imageCost(false);
  const total = unit * VERSIONS;
  const setAd = (i, patch) => { adsRef.current = adsRef.current.map((a) => (a.i === i ? { ...a, ...patch } : a)); setAds(adsRef.current); };

  // Questions the website reading already answered are skipped.
  const val = (id) => String(answers[id] || "");
  const pending = questions.filter((x) => !(x.site && site && val(x.id).trim()));
  const q = pending[step];

  const addFiles = async (list) => {
    const arr = Array.from(list || []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, Math.max(0, 3 - files.length));
    if (!arr.length) { setErr("Choose JPG, PNG or WebP photos (up to 3)."); return; }
    const out = [];
    for (const f of arr) { try { out.push({ id: Math.random().toString(36).slice(2), src: await packShrink(await read(f), 1000) }); } catch (e) { /* skip unreadable file */ } }
    if (out.length) { setFiles((p) => p.concat(out)); setErr(""); } else setErr("Those photos could not be read.");
  };

  const readSite = async () => {
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (url.trim().length < 4) { setErr("Paste your website link first."); return; }
    setErr(""); setReading(true);
    try {
      const r = await call("/pack/store", { url: url.trim() });
      setSite(r); setPicked((r.images || []).slice(0, 2).map((i) => i.url));
      setAnswers((a) => ({ ...a, brand: r.name || a.brand || "", sells: r.description || a.sells || "" }));
    } catch (e) { setErr((e && e.message) || "We could not read that site. You can answer the questions by hand instead."); }
    setReading(false);
  };

  const begin = () => {
    if (source === "photo" && !files.length) { setErr("Add at least one product photo, or choose another option."); return; }
    if (source === "site" && !site) { setErr("Read your website first, or choose another option."); return; }
    setErr(""); setStep(0); setPhase("questions");
  };

  const refsNow = () => ({ refs: source === "photo" ? files.map((f) => f.src) : [], refUrls: source === "site" ? picked : [] });

  const render = async (v, signal) => {
    const r = await call("/make/ad", { mode: "scratch", concept: v.concept, answers: ctxRef.current.answers, ratio: v.ratio, quality: "standard", ...refsNow() }, signal);
    return { src: `data:${r.mime};base64,${r.data}`, mime: r.mime, b64: r.data };
  };

  const finish = async () => {
    if (video) {
      const brief = { ...answers, savedAt: Date.now(), source };
      try { localStorage.setItem(VIDEO_KEY, JSON.stringify(brief)); } catch (e) { /* storage blocked */ }
      setPhase("brief"); return;
    }
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (credits < total) { setErr(`Making ${VERSIONS} ads needs ${total} credits and you have ${credits}.`); return; }
    const a = answers;
    const ratio = RATIO_OF[a.ratio] || "4:5";
    const noText = a.wording === "No text, picture only";
    const typed = a.wording && a.wording !== "Write a headline for me" && !noText ? a.wording : "";
    const sent = { brand: a.brand, sells: a.sells, offer: a.offer, audience: a.audience, goal: a.goal, tone: a.tone, wording: noText ? "No text on the image" : typed };
    ctxRef.current = { answers: sent };
    setErr(""); setPhase("making"); setAds([]); adsRef.current = [];
    const c = new AbortController(); const onLife = () => c.abort(); life.current.signal.addEventListener("abort", onLife, { once: true });
    try {
      setStatus("Designing three different ads for you…");
      const plan = await call("/make/plan", { answers: sent, site: site ? { name: site.name, description: site.description } : null, photos: source !== "none" }, c.signal);
      adsRef.current = plan.concepts.map((cn, i) => ({
        i, title: cn.title, angle: cn.angle, ratio,
        concept: noText ? { ...cn, headline: "", sub: "" } : typed ? { ...cn, headline: typed, sub: "" } : cn,
        src: "", error: "", review: null,
      }));
      setAds(adsRef.current);
      let done = 0, failed = 0, n = 0;
      const worker = async () => {
        while (n < adsRef.current.length && !c.signal.aborted) {
          const v = adsRef.current[n++];
          try { const im = await render(v, c.signal); setAd(v.i, im); done++; onSpend(unit); }
          catch (e) { if (c.signal.aborted) return; setAd(v.i, { error: (e && e.message) || "The image failed" }); failed++; }
          setStatus(`Creating images… ${done + failed} of ${VERSIONS}`);
        }
      };
      await Promise.all([worker(), worker()]);
      if (c.signal.aborted) return;
      setStatus(""); setPhase("done");
      notify(failed ? `${done} ads ready, ${failed} need a retry.` : `Your ${done} ads are ready.`, 3200);
    } catch (e) {
      if (c.signal.aborted) return;
      setErr((e && e.message) || "Something went wrong"); setPhase(adsRef.current.length ? "done" : "questions"); setStatus("");
    }
  };

  const next = () => {
    if (q && !q.optional && !val(q.id).trim()) { setErr("Answer this one to continue."); return; }
    setErr("");
    if (step + 1 < pending.length) setStep(step + 1); else finish();
  };

  const retry = async (v) => {
    if (credits < unit) { notify(`This needs ${unit} credit${unit > 1 ? "s" : ""} and you have ${credits}.`, 3200); return; }
    setBusy((b) => ({ ...b, [v.i]: true })); if (!v.src) setAd(v.i, { error: "" });
    try { const im = await render(v, life.current.signal); setAd(v.i, { ...im, error: "", review: null }); onSpend(unit); }
    catch (e) { if (life.current.signal.aborted) return; if (!v.src) setAd(v.i, { error: (e && e.message) || "Image failed" }); notify((e && e.message) || "The image failed", 3200); }
    setBusy((b) => ({ ...b, [v.i]: false }));
  };
  const check = async (v) => {
    setBusy((b) => ({ ...b, [v.i]: true }));
    try {
      const rv = await call("/make/review", { image: await packShrink(v.src, 900), headline: v.concept.headline || "", refs: refsNow().refs.slice(0, 2), note: val("sells") }, life.current.signal);
      setAd(v.i, { review: rv });
    } catch (e) { if (!life.current.signal.aborted) notify((e && e.message) || "The check failed", 3000); }
    setBusy((b) => ({ ...b, [v.i]: false }));
  };
  const download = (v) => packSave(new Blob([packB64(v.b64)], { type: v.mime }), `${(val("brand") || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${v.i + 1}.${packExt(v.mime)}`);

  const restart = () => { setPhase("source"); setStep(0); setAds([]); adsRef.current = []; setErr(""); setStatus(""); };

  const pct = phase === "questions" ? Math.round(((step + 1) / Math.max(1, pending.length)) * 100) : 0;

  return (
    <section className="mx-auto mt-6 max-w-3xl" aria-label={video ? "Create Video Ads" : "Create Static Ads"}>
      {phase === "source" && (
        <div>
          <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em] text-slate-950">Let's make an ad just for you</h2>
          <p className="mt-1 text-sm text-slate-500">{video ? "Answer a few questions and we will build your video brief." : "Answer a few questions and we design three ads from scratch. No templates."}</p>
          <p className="mt-6 text-sm font-semibold text-slate-900">First, do you have a product photo or a website?</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[["photo", "I have a photo", "Upload your product", Icon.Upload], ["site", "I have a website", "We read it for you", Icon.Search], ["none", "Neither", "We design it from your answers", Icon.Wand]].map(([id, t, s, I]) => (
              <button key={id} onClick={() => { setSource(id); setErr(""); }} aria-pressed={source === id}
                className={`rounded-2xl border p-4 text-left transition ${source === id ? "border-slate-950 bg-white shadow-md ring-2 ring-slate-950" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <I className="h-5 w-5 text-blue-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">{t}</p>
                <p className="mt-0.5 text-xs text-slate-500">{s}</p>
              </button>
            ))}
          </div>
          {source === "photo" && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <label className="flex cursor-pointer flex-col items-center gap-2 text-center text-sm text-slate-600">
                <Icon.Upload className="h-6 w-6 text-slate-400" />
                <span className="font-semibold text-slate-900">Choose product photos</span>
                <span className="text-xs">JPG, PNG or WebP, up to 3</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {files.map((f) => (
                    <div key={f.id} className="relative h-24 w-24 overflow-hidden rounded-xl ring-1 ring-slate-200">
                      <img src={f.src} alt="Product" className="h-full w-full object-cover" />
                      <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} aria-label="Remove photo" className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-slate-700"><Icon.Close className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {source === "site" && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") readSite(); }} placeholder="https://yourbrand.com" className={field} aria-label="Website link" />
                <button onClick={readSite} disabled={reading} className={btnDark + " whitespace-nowrap"}>{reading ? "Reading…" : "Read my site"}</button>
              </div>
              {site && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-900">{site.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{site.description}</p>
                  {(site.images || []).length > 0 && <p className="mt-3 text-xs font-semibold text-slate-700">Pick up to 3 photos to use in your ads</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(site.images || []).map((im) => {
                      const on = picked.includes(im.url);
                      return (
                        <button key={im.url} onClick={() => setPicked((p) => (p.includes(im.url) ? p.filter((x) => x !== im.url) : p.length >= 3 ? p : p.concat(im.url)))} aria-pressed={on}
                          className={`h-20 w-20 overflow-hidden rounded-xl ring-2 ${on ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`}>
                          <img src={im.url} alt={im.label || "Product"} loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
          <div className="mt-6"><button disabled={!source} onClick={begin} className={btnDark}>Start</button></div>
        </div>
      )}

      {phase === "questions" && q && (
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: pct + "%" }} />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Question {step + 1} of {pending.length}</p>
          <h2 className="font-display mt-1 text-2xl font-extrabold tracking-[-0.03em] text-slate-950">{q.label}</h2>
          {q.hint && <p className="mt-1 text-sm text-slate-500">{q.hint}</p>}
          <div className="mt-5">
            {q.type === "text" && <input autoFocus value={val(q.id)} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") next(); }} placeholder={q.ph} className={field} aria-label={q.label} />}
            {q.type === "area" && <textarea autoFocus rows={3} value={val(q.id)} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder={q.ph} className={field} aria-label={q.label} />}
            {q.type === "choice" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o) => (
                  <button key={o} onClick={() => setAnswers({ ...answers, [q.id]: o })} aria-pressed={val(q.id) === o}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${val(q.id) === o ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>{o}</button>
                ))}
                {q.custom && <input value={q.options.includes(val(q.id)) ? "" : val(q.id)} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder={q.custom} className={field + " sm:col-span-2"} aria-label={q.custom} />}
              </div>
            )}
          </div>
          {err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
          <div className="mt-6 flex items-center gap-3">
            <button onClick={() => { setErr(""); if (step === 0) setPhase("source"); else setStep(step - 1); }} className={btnLight}>Back</button>
            <button onClick={next} className={btnDark}>{step + 1 === pending.length ? (video ? "Save my brief" : `Make my ads (${total} credits)`) : "Next"}</button>
            {q.optional && <button onClick={() => { setAnswers({ ...answers, [q.id]: "" }); setErr(""); if (step + 1 < pending.length) setStep(step + 1); else finish(); }} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Skip</button>}
          </div>
        </div>
      )}

      {(phase === "making" || phase === "done") && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em] text-slate-950">{phase === "making" ? "Making your ads" : "Your ads"}</h2>
            {phase === "done" && <button onClick={restart} className={btnLight}>Make another set</button>}
          </div>
          {status && <p aria-live="polite" className="mt-1 text-sm text-slate-500">{status}</p>}
          {err && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{err}</p>}
          {phase === "making" && !ads.length && <div className="mt-10"><Spinner /></div>}
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {ads.map((v) => <AdCard key={v.i} v={v} busy={!!busy[v.i]} onDownload={download} onCheck={check} onRetry={retry} />)}
          </div>
        </div>
      )}

      {phase === "brief" && (
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Brief saved</span>
          <h2 className="font-display mt-3 text-2xl font-extrabold tracking-[-0.03em] text-slate-950">Your video brief is ready</h2>
          <p className="mt-1 text-sm text-slate-500">Video generation is coming soon. Your answers are saved in this browser and will be used to build your video.</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {questions.filter((x) => val(x.id).trim()).map((x) => (
              <div key={x.id} className="rounded-xl bg-slate-50 p-3"><dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{x.label}</dt><dd className="mt-1 text-sm text-slate-900">{val(x.id)}</dd></div>
            ))}
          </dl>
          <div className="mt-6"><button onClick={restart} className={btnLight}>Start over</button></div>
        </div>
      )}
    </section>
  );
}
