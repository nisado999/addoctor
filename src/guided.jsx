import { useState, useRef, useEffect } from "react";
import { Icon } from "./ui";
import { SPY_API, hasFeature } from "./shared.js";
import { apiFetch } from "./api.js";
import { metaAds } from "./metaQueue.js";
import { imageCost, billingOn, COSTS } from "./billing.js";
import { packShrink, packB64, packExt, packSave, XRayLoader } from "./pack";
import { Matches, NICHES, STATIC, rank } from "./matches.jsx";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import { useDialog } from "./dialog.jsx";
import { saveMyAd } from "./myads.jsx";
import { draftGet, draftSet } from "./draft.js";

/* ---------------------- Guided builder: an interview, then an ad made for this customer ---------------------- */

const VIDEO_KEY = "addoctor.videobrief.v1";
const VERSIONS = 3;
const MAX_PHOTOS = 6;    // keep in step with makeAd and planScratch in api/worker.js
const PASS_SCORE = 80;   // an ad under this review score is remade
const MAX_TRIES = 4;     // first render plus three remakes
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
  { id: "niche", label: "What's your niche?", hint: "It picks the templates we can show you.", type: "choice", options: NICHES, custom: "Or type yours" },
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
const TONES = SHARED_START.find((x) => x.id === "tone").options;
const TPL = new Map(STATIC.map((t) => [t.id, t]));
const absUrl = (u) => { try { return new URL(u, window.location.href).href; } catch (e) { return u; } };
const READ_STEPS = ["Reading your home page…", "Finding your products and photos…", "Reading your about and shop pages…", "Working out your audience and tone…", "Picking out your colours and style…"];
// What a proven layout looks like to the planner: its name, niche, headline and what the picture shows.
const candOf = (t) => ({ id: t.id, title: t.title, label: t.label, headline: t.headline || "", format: t.format || "", shows: (t.primary || "").replace(/The brand shown is a made-up placeholder.*$/, "").slice(0, 200) });

const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10";
const btnDark = "rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40";
const btnLight = "rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900";

const read = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

function Spinner() { return <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />; }

function CopyRow({ label, text, onCopy }) {
  if (!text) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs text-slate-700"><span className="font-semibold text-slate-400">{label} </span>{text}</p>
      <button onClick={() => onCopy(text)} aria-label={`Copy ${label}`} className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-slate-900">Copy</button>
    </div>
  );
}

// The whole ad, as large as the screen allows, uncropped. Escape, the backdrop or the button close it.
function ZoomView({ src, title, onClose }) {
  const ref = useRef(null);
  const { overlayProps, requestClose } = useDialog({ onClose, panelRef: ref });
  return (
    <div {...overlayProps} className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={ref} className="relative">
        <img src={src} alt={title} className="max-h-[92vh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
        <button type="button" onClick={requestClose} aria-label="Close the preview" className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-900 shadow-lg"><Icon.Close className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function AdCard({ v, onDownload, onMeta, onVault, onChange, onRetry, onCopy, unit, busy }) {
  const [zoom, setZoom] = useState(false);
  const [vaulted, setVaulted] = useState("");   // the picture already saved to the Vault, so a changed ad can be saved again
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rv = v.review, cp = v.copy;
  const tone = rv ? (rv.score >= 80 ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : rv.score >= 60 ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-rose-50 text-rose-700 ring-rose-100") : "";
  const apply = async () => { if (await onChange(v, text)) { setOpen(false); setText(""); } };
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="relative bg-slate-100" style={{ aspectRatio: v.ratio.replace(":", " / ") }}>
        {v.src ? <button type="button" onClick={() => setZoom(true)} aria-label={`Zoom in on ${v.title}`} className="block h-full w-full cursor-zoom-in"><img src={v.src} alt={v.title} className="h-full w-full object-cover" /></button> : (
          <div className="grid h-full w-full place-items-center p-6 text-center">
            {v.error ? (
              <div>
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600"><Icon.Alert className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-slate-900">Not generated</p>
                <p className="mt-1 text-xs text-slate-500">{v.error}</p>
                <button onClick={() => onRetry(v)} className="mt-3 rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Retry</button>
              </div>
            ) : <XRayLoader title={v.title} />}
          </div>
        )}
        {v.src && busy && <XRayLoader title={v.title} over />}
        {rv && <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone}`}>{rv.score}/100</span>}
        {v.src && !busy && <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white">Click to zoom</span>}
        {zoom && <ZoomView src={v.src} title={v.title} onClose={() => setZoom(false)} />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-slate-900">{v.title}</p>
        <p className="text-xs text-slate-500">{v.angle}</p>
        {v.tpl && <p className="text-[11px] font-semibold text-slate-400">Built on a proven layout: {v.tpl.title}</p>}
        {v.src && cp && (cp.primary || cp.headline) && (
          <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ad copy</p>
            <CopyRow label="Text" text={cp.primary} onCopy={onCopy} />
            <CopyRow label="Headline" text={cp.headline} onCopy={onCopy} />
            <CopyRow label="Description" text={cp.description} onCopy={onCopy} />
            <p className="text-xs text-slate-700"><span className="font-semibold text-slate-400">Button </span>{cp.cta}</p>
          </div>
        )}
        {v.src && open && (
          <div className="rounded-lg bg-slate-50 p-2.5">
            <label className="text-xs font-semibold text-slate-700" htmlFor={`chg-${v.i}`}>What should change?</label>
            <textarea id={`chg-${v.i}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Make the background lighter" className={field + " mt-1 !py-2 text-xs"} />
            <div className="mt-2 flex gap-2">
              <button disabled={busy || !text.trim()} onClick={apply} className="rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40">Apply change</button>
              <button onClick={() => setOpen(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
            </div>
          </div>
        )}
        {v.src && (
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <button onClick={() => onDownload(v)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Icon.Download className="h-3.5 w-3.5" />Download</button>
            <button onClick={() => onMeta(v)} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><Icon.Arrow className="h-3.5 w-3.5" />Add to my Meta ad</button>
            <button disabled={busy || vaulted === v.src} onClick={async () => { if (await onVault(v)) setVaulted(v.src); }} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50"><Icon.Bookmark className="h-3.5 w-3.5" />{vaulted === v.src ? "Saved to Vault" : "Save to Vault"}</button>
            <button disabled={busy} onClick={() => setOpen(!open)} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50">{v.edits ? `Change again (${unit} credit${unit > 1 ? "s" : ""})` : "Change something (free)"}</button>
            <button disabled={busy} onClick={() => onRetry(v)} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 disabled:opacity-50">New version</button>
          </div>
        )}
      </div>
    </article>
  );
}

/* inline: shown inside Create an ad, so a finished ad is added to that flow's list (no "open Create an ad" hint) and siteUrl is already known. */
export function GuidedView({ kind = "static", notify, credits, onSpend, seed = "", onUseTemplate, onBrowse, inline = false, siteUrl = "" }) {
  const video = kind === "video";
  const questions = video ? VIDEO_QUESTIONS : STATIC_QUESTIONS;
  const [phase, setPhase] = useState("source");   // source | questions | matches | making | done | brief
  const [source, setSource] = useState("site");    // site | photo | none: the website is the main way in
  const [files, setFiles] = useState([]);          // [{id, src}]
  const [url, setUrl] = useState(siteUrl);
  const [site, setSite] = useState(null);          // {name, description, images, pages, niche, audience, tone, offer, usps, ...}
  const [profile, setProfile] = useState(null);    // the same reading, when the server read the whole site
  const [known, setKnown] = useState({});          // answers filled in from the site: {niche: "Fashion", ...}
  const [picked, setPicked] = useState([]);
  const [reading, setReading] = useState(false);
  const [readStep, setReadStep] = useState(0);
  useEffect(() => {
    if (!reading) { setReadStep(0); return; }
    const t = setInterval(() => setReadStep((n) => Math.min(n + 1, READ_STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, [reading]);
  const [answers, setAnswers] = useState(() => (seed ? { sells: seed } : {}));   // seed: what was typed on Home
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [ads, setAds] = useState([]);
  const [busy, setBusy] = useState({});
  const adsRef = useRef([]);
  const ctxRef = useRef({});
  const life = useRef(new AbortController());
  useEffect(() => { const l = life.current; return () => l.abort(); }, []);

  // The whole page is kept in the browser until "Make another set": answers, picked photos, the site reading and the finished ads,
  // so a refresh or leaving the page loses nothing. A run that was still painting comes back with the ads that had finished.
  const DRAFT = `guided-${kind}`;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    draftGet(DRAFT).then((d) => {
      if (!live) return;
      // Not when this page was opened with its own start (text from Home, or another website than the saved one).
      if (!video && d && d.v === 1 && Date.now() - d.t < 7 * 864e5 && !seed && (!siteUrl || !d.url || d.url === siteUrl)) {
        const done = (Array.isArray(d.ads) ? d.ads : []).filter((a) => a && (a.src || a.error));
        adsRef.current = done; ctxRef.current = d.ctx || {};
        setSource(d.source || "site"); setFiles(d.files || []); setUrl(d.url || siteUrl); setSite(d.site || null); setProfile(d.profile || null);
        setKnown(d.known || {}); setPicked(d.picked || []); setAnswers(d.answers || {}); setStep(d.step || 0); setAds(done);
        setPhase(d.phase === "making" || d.phase === "done" ? (done.some((a) => a.src) ? "done" : "questions") : (d.phase || "source"));
      }
      setReady(true);
    });
    return () => { live = false; };
    // Runs once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready || video) return;
    const t = setTimeout(() => {
      const empty = phase === "source" && !site && !files.length && !ads.length;
      draftSet(DRAFT, empty ? null : { v: 1, t: Date.now(), phase, source, url, site, profile, known, picked, answers, step, files, ads, ctx: ctxRef.current });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, phase, source, url, site, profile, known, picked, answers, step, files, ads]);

  const unit = imageCost(false);
  // One ad per product photo the customer picked, never fewer than VERSIONS.
  const nAds = Math.min(MAX_PHOTOS, Math.max(VERSIONS, source === "photo" ? files.length : source === "site" ? picked.length : 0));
  // With billing on, planning the ads (/make/plan) is charged too.
  const total = unit * nAds + (billingOn() ? COSTS.packText : 0);
  const setAd = (i, patch) => { adsRef.current = adsRef.current.map((a) => (a.i === i ? { ...a, ...patch } : a)); setAds(adsRef.current); };

  // Questions the website reading already answered are skipped. Worked out once, when the questions start, so
  // typing an answer by hand can't make the question vanish under the cursor.
  const val = (id) => String(answers[id] || "");
  const [skip, setSkip] = useState([]);
  const pending = questions.filter((x) => !skip.includes(x.id));
  const q = pending[step];

  const addFiles = async (list) => {
    const arr = Array.from(list || []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, Math.max(0, MAX_PHOTOS - files.length));
    if (!arr.length) { setErr(`Choose JPG, PNG or WebP photos (up to ${MAX_PHOTOS}).`); return; }
    const out = [];
    for (const f of arr) { try { out.push({ id: Math.random().toString(36).slice(2), src: await packShrink(await read(f), 1000) }); } catch (e) { /* skip unreadable file */ } }
    if (out.length) { setFiles((p) => p.concat(out)); setErr(""); } else setErr("Those photos could not be read.");
  };

  const readSite = async () => {
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (url.trim().length < 4) { setErr("Paste your website link first."); return; }
    setErr(""); setReading(true);
    try {
      // The whole site (several pages) when the server can do it; just the page's products on an older server.
      const deep = await hasFeature("brandread");
      const r = deep ? await call("/brand/read", { url: url.trim(), niches: NICHES, tones: TONES }) : await call("/pack/store", { url: url.trim() });
      setSite(r); setProfile(deep ? r : null); setPicked((r.images || []).slice(0, 2).map((i) => i.url));
      const fill = { brand: r.name, sells: r.description, ...(deep ? { niche: r.niche, audience: r.audience, tone: r.tone, offer: r.offer } : {}) };
      const got = Object.fromEntries(Object.entries(fill).filter(([, v]) => v && String(v).trim()));
      setAnswers((a) => ({ ...a, ...got }));
      setKnown(got);
    } catch (e) { setErr((e && e.message) || "We could not read that site. You can answer the questions by hand instead."); }
    setReading(false);
  };

  const begin = () => {
    if (source === "photo" && !files.length) { setErr("Add at least one product photo, or choose another option."); return; }
    if (source === "site" && !site) { setErr("Read your website first, or choose another option."); return; }
    setSkip(site ? questions.filter((x) => x.site && val(x.id).trim()).map((x) => x.id) : []);
    setErr(""); setStep(0); setPhase("questions");
  };

  const refsNow = () => ({ refs: source === "photo" ? files.map((f) => f.src) : [], refUrls: source === "site" ? picked : [] });
  // With several photos each ad is about one of them (v.concept.photo, 1-based): it and its review see only that photo, so a hoodie ad is never checked against the beanie.
  const photosFor = (v) => {
    const all = refsNow(), k = v && v.concept && v.concept.photo;
    if (!(k > 0) || all.refs.length + all.refUrls.length < 2) return all;
    return { refs: all.refs.slice(k - 1, k), refUrls: all.refUrls.slice(k - 1, k) };
  };

  // The product, the brand and the offer, in the few words the ad maker needs when it rebuilds a proven layout for this customer.
  const noteFor = () => {
    const a = ctxRef.current.answers || {};
    return [a.sells, a.audience && `For ${a.audience}`, a.tone && `Tone: ${a.tone}`,
      a.brand && `The brand is "${a.brand}": wherever the layout shows a brand name, write exactly "${a.brand}" as text, never a made-up logo`,
      a.offer ? `Offer: ${a.offer}` : "No offer: show no price, discount or deadline"].filter(Boolean).join(". ");
  };
  // With a proven layout and a real product photo the ad is rebuilt on that layout; otherwise it is designed from the concept alone.
  const render = async (v, signal) => {
    const t = v.templateId && TPL.get(v.templateId), photos = photosFor(v);
    const onLayout = t && TEMPLATE_IMGS[t.id] && (photos.refs.length || photos.refUrls.length) && !ctxRef.current.noText;
    const r = onLayout
      ? await call("/make/ad", { mode: "inspired", template: await packShrink(TEMPLATE_IMGS[t.id], 1000), about: t.desc || "", note: noteFor(), headline: v.concept.headline || "", ratio: v.ratio, quality: "standard", ...photos }, signal)
      : await call("/make/ad", { mode: "scratch", concept: v.concept, answers: ctxRef.current.answers, ratio: v.ratio, quality: "standard", ...photos }, signal);
    return { src: `data:${r.mime};base64,${r.data}`, mime: r.mime, b64: r.data, grant: r.grant || "" };
  };
  // The full analysis: the same rubric as Check score, run on every ad before the customer sees it.
  const review = async (src, v, signal) => call("/make/review", { image: await packShrink(src, 900), headline: v.concept.headline || "", refs: photosFor(v).refs.slice(0, 2), refUrls: photosFor(v).refUrls.slice(0, 2), note: [val("sells"), val("offer") && `Offer: ${val("offer")}`].filter(Boolean).join(". ") }, signal);

  const finish = async () => {
    if (video) {
      const brief = { ...answers, savedAt: Date.now(), source };
      try { localStorage.setItem(VIDEO_KEY, JSON.stringify(brief)); } catch (e) { /* storage blocked */ }
      setPhase("brief"); return;
    }
    if (!SPY_API) { setErr("This needs the AdDoctor server. Open the published page, not the preview."); return; }
    if (credits < total) { setErr(`Making ${nAds} ads needs ${total} credits and you have ${credits}.`); return; }
    const a = answers;
    const ratio = RATIO_OF[a.ratio] || "4:5";
    const noText = a.wording === "No text, picture only";
    const typed = a.wording && a.wording !== "Write a headline for me" && !noText ? a.wording : "";
    const sent = { brand: a.brand, sells: a.sells, offer: a.offer, audience: a.audience, goal: a.goal, tone: a.tone, wording: noText ? "No text on the image" : typed };
    ctxRef.current = { answers: sent, noText };
    setErr(""); setPhase("making"); setAds([]); adsRef.current = [];
    const c = new AbortController(); const onLife = () => c.abort(); life.current.signal.addEventListener("abort", onLife, { once: true });
    try {
      setStatus(`Designing ${nAds} different ads for you…`);
      // The planner sees the best-fitting proven layouts from the gallery and builds each concept on a different one.
      const cand = rank({ niche: a.niche, sells: a.sells, offer: a.offer }).out.slice(0, 8).map((r) => r.t);
      const plan = await call("/make/plan", {
        answers: sent, site: site ? { name: site.name, description: site.description } : null,
        profile: profile ? { usps: profile.usps, products: profile.products, voice: profile.voice, palette: profile.palette, look: profile.look, language: profile.language } : null,
        candidates: cand.map(candOf), candidateUrls: cand.map((t) => absUrl(TEMPLATE_IMGS[t.id])),
        photos: source !== "none", count: nAds, ...refsNow(),
      }, c.signal);
      adsRef.current = plan.concepts.map((cn, i) => ({
        i, title: cn.title, angle: cn.angle, ratio,
        templateId: TPL.has(cn.templateId) ? cn.templateId : "", tpl: TPL.has(cn.templateId) ? { id: cn.templateId, title: TPL.get(cn.templateId).title } : null,
        concept: noText ? { ...cn, headline: "", sub: "" } : typed ? { ...cn, headline: typed, sub: "" } : cn,
        copy: { ...cn.copy, ...(typed ? { headline: typed } : {}) },
        src: "", error: "", review: null, edits: 0,
      }));
      setAds(adsRef.current);
      let done = 0, n = 0;
      // An ad under PASS_SCORE is remade, up to MAX_TRIES times, and no ad ever disappears: if none of the tries passes, the best one is shown with its score.
      const worker = async () => {
        while (n < adsRef.current.length && !c.signal.aborted) {
          const v = adsRef.current[n++];
          let ok = false, best = null, lastErr = "";
          for (let t = 0; t < MAX_TRIES && !ok; t++) {
            try {
              setStatus(t ? `Remaking "${v.title}", it scored ${best ? best.rv.score : "under " + PASS_SCORE}/100…` : `Creating and checking your ads… ${done} of ${adsRef.current.length} done`);
              const im = await render(v, c.signal); onSpend(unit);
              const rv = await review(im.src, v, c.signal);
              // A wrong product fails the ad whatever its score: the review's product point must be clean.
              if (rv.score >= PASS_SCORE && !(rv.pillars || []).some((p) => p.id === "product" && !p.na && p.score < 80)) { setAd(v.i, { ...im, review: rv }); ok = true; }
              else if (!best || rv.score > best.rv.score) best = { im, rv };
            } catch (e) { if (c.signal.aborted) return; lastErr = (e && e.message) || ""; }
          }
          if (!ok && best) setAd(v.i, { ...best.im, review: best.rv });
          else if (!ok) setAd(v.i, { error: lastErr || "This ad could not be made. Try again." });
          done++;
        }
      };
      await Promise.all([worker(), worker()]);
      if (c.signal.aborted) return;
      setStatus(""); setPhase("done");
      const made = adsRef.current.filter((a) => a.src).length;
      notify(made ? `Your ${made} ad${made > 1 ? "s are" : " is"} ready.` : "The ads could not be made. Try again.", 3200);
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
    try {
      const im = await render(v, life.current.signal); onSpend(unit);
      const rv = await review(im.src, v, life.current.signal).catch(() => null);
      setAd(v.i, { ...im, error: "", review: rv, edits: 0 });
    }
    catch (e) { if (life.current.signal.aborted) return; if (!v.src) setAd(v.i, { error: (e && e.message) || "Image failed" }); notify((e && e.message) || "The image failed", 3200); }
    setBusy((b) => ({ ...b, [v.i]: false }));
  };
  // Every ad gets one free change; later ones cost a credit (with billing on the server decides, through the ad's grant).
  const change = async (v, text) => {
    const t = text.trim(); if (!t) return false;
    const free = !v.edits;
    if (!free && credits < unit) { notify(`This needs ${unit} credit${unit > 1 ? "s" : ""} and you have ${credits}.`, 3200); return false; }
    setBusy((b) => ({ ...b, [v.i]: true }));
    let ok = false;
    try {
      const r = await call("/make/ad", { base: await packShrink(v.src, 1600), fix: t, grant: v.grant, ratio: v.ratio, quality: "standard", ...photosFor(v) }, life.current.signal);
      if (!free && r.freeLeft === undefined) onSpend(unit);
      const src = `data:${r.mime};base64,${r.data}`;
      setAd(v.i, { src, mime: r.mime, b64: r.data, edits: v.edits + 1, review: null });
      ok = true;
      setAd(v.i, { review: await review(src, v, life.current.signal).catch(() => null) });
    } catch (e) { if (!life.current.signal.aborted) notify((e && e.message) || "The change failed", 3200); }
    setBusy((b) => ({ ...b, [v.i]: false }));
    return ok;
  };
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); notify("Copied"); } catch (e) { notify("Could not copy. Select the text instead."); } };
  // The ad and its written copy go to the Create an ad flow, which turns them into a ready-to-post set.
  const addToMeta = (v) => notify(metaAds.add({ src: v.src, name: v.title || "Ad", copy: v.copy }) ? (inline ? "Added to your ads." : "Added. Open Create an ad (top of the menu) to continue.") : "That ad is already added.", 3200);
  // Keeps the finished picture under My ads in the Vault, the same save the template studio uses.
  const saveVault = async (v) => {
    try {
      await saveMyAd({ dataUrl: v.src, title: v.title || "Ad", category: val("niche") || "", templateId: v.templateId || "" });
      notify("Saved to your Vault, under My ads");
      return true;
    } catch (e) { notify((e && e.message) || "The ad could not be saved."); return false; }
  };
  const download = (v) => packSave(new Blob([packB64(v.b64)], { type: v.mime }), `${(val("brand") || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${v.i + 1}.${packExt(v.mime)}`);

  const restart = () => { setPhase("source"); setStep(0); setAds([]); adsRef.current = []; setErr(""); setStatus(""); };

  const pct = phase === "questions" ? Math.round(((step + 1) / Math.max(1, pending.length)) * 100) : 0;

  return (
    <section className="mx-auto mt-6 max-w-3xl" aria-label={video ? "Create Video Ads" : "Create Static Ads"}>
      {phase === "source" && (
        <div>
          <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em] text-slate-950">{video ? "Let's make a video for you" : "Paste your website. We'll make ads that fit your brand."}</h2>
          <p className="mt-1 text-sm text-slate-500">{video ? "Answer a few questions and we will build your video brief." : "We read your pages, learn your brand, ask a few quick questions, then build three ads on layouts that already work."}</p>
          <p className="mt-6 text-sm font-semibold text-slate-900">Where should we learn about your brand?</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[["site", "My website", "We read your whole site", Icon.Search], ["photo", "A product photo", "Upload your product", Icon.Upload], ["none", "Neither", "We design it from your answers", Icon.Wand]].map(([id, t, s, I]) => (
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
                <span className="text-xs">JPG, PNG or WebP, up to {MAX_PHOTOS}</span>
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
                <button onClick={readSite} disabled={reading} className={btnDark + " whitespace-nowrap"}>{reading ? "Reading…" : site ? "Read again" : "Read my site"}</button>
              </div>
              {reading && <p aria-live="polite" className="mt-3 text-sm text-slate-500">{READ_STEPS[readStep]}</p>}
              {site && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-900">{site.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{site.description}</p>
                  {profile && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">What we learned{site.pages && site.pages.length > 1 ? ` from ${site.pages.length} pages` : ""}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {[profile.niche, profile.tone, profile.voice].filter(Boolean).map((x) => <span key={x} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{x}</span>)}
                        {(profile.hexes || []).map((h) => <span key={h} title={h} className="h-5 w-5 rounded-full ring-1 ring-slate-200" style={{ background: h }} />)}
                      </div>
                      {profile.audience && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-400">For </span>{profile.audience}</p>}
                      {profile.usps && profile.usps.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">{profile.usps.map((u) => <li key={u}>{u}</li>)}</ul>}
                      {profile.offer && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-400">Offer on your site </span>{profile.offer}</p>}
                    </div>
                  )}
                  {(site.images || []).length > 0 && <p className="mt-3 text-xs font-semibold text-slate-700">We found {site.images.length} product photo{site.images.length === 1 ? "" : "s"}. Pick up to {MAX_PHOTOS} to use in your ads</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(site.images || []).map((im) => {
                      const on = picked.includes(im.url);
                      return (
                        <button key={im.url} onClick={() => setPicked((p) => (p.includes(im.url) ? p.filter((x) => x !== im.url) : p.length >= MAX_PHOTOS ? p : p.concat(im.url)))} aria-pressed={on}
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
          {known[q.id] && val(q.id) === known[q.id] && <p className="mt-1 text-xs font-semibold text-emerald-700">Filled in from your website. Change it if it is wrong.</p>}
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
            {!video && <button onClick={() => { setErr(""); setPhase("matches"); }} className="text-sm font-semibold text-blue-700 hover:text-blue-800">Show matching templates (free)</button>}
            {q.optional && <button onClick={() => { setAnswers({ ...answers, [q.id]: "" }); setErr(""); if (step + 1 < pending.length) setStep(step + 1); else finish(); }} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Skip</button>}
          </div>
        </div>
      )}

      {phase === "matches" && (
        <div>
          <Matches answers={{ niche: val("niche"), sells: val("sells"), offer: val("offer"), brand: val("brand") }}
            photos={source === "photo" ? files.map((f) => ({ src: f.src, name: "Product photo" })) : []}
            onUse={onUseTemplate} onBrowse={onBrowse} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => setPhase(ads.length ? "done" : "questions")} className={btnLight}>Back</button>
            <button onClick={restart} className={btnLight}>Start over</button>
          </div>
        </div>
      )}

      {(phase === "making" || phase === "done") && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[26px] font-extrabold tracking-[-0.03em] text-slate-950">{phase === "making" ? "Making your ads" : "Your ads"}</h2>
            {phase === "done" && <div className="flex gap-2"><button onClick={() => setPhase("matches")} className={btnLight}>Start from a template</button><button onClick={restart} className={btnLight}>Make another set</button></div>}
          </div>
          {status && <p aria-live="polite" className="mt-1 text-sm text-slate-500">{status}</p>}
          {err && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{err}</p>}
          {phase === "making" && !ads.length && <div className="mt-10"><Spinner /></div>}
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {ads.map((v) => <AdCard key={v.i} v={v} busy={!!busy[v.i]} unit={unit} onDownload={download} onMeta={addToMeta} onVault={saveVault} onChange={change} onRetry={retry} onCopy={copyText} />)}
          </div>
          {phase === "done" && ads.some((v) => v.review && v.review.score < PASS_SCORE) && <p className="mt-4 text-sm text-slate-500">An ad that scored under {PASS_SCORE}/100 was remade up to {MAX_TRIES - 1} times and this is the best version. Use “Change something” or “New version” to improve it.</p>}
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
