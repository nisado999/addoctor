import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { SAMPLES } from "./data";
import { Icon, Creative, pill } from "./ui";
import { readAsset, renderSampleAsset, AssetZone } from "./asset";
import { headline } from "./studio";
import { alignment, analyze, prescriptionText } from "./analysis.js";

/* --------------------------- Helpers ---------------------------------- */

const TONE = {
  good: { text: "text-emerald-600", bg: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", hex: "#10B981" },
  warn: { text: "text-amber-600", bg: "bg-amber-500", chip: "bg-amber-50 text-amber-700", hex: "#F59E0B" },
  bad: { text: "text-rose-600", bg: "bg-rose-500", chip: "bg-rose-50 text-rose-700", hex: "#F43F5E" },
};

function useMounted(delay = 60) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return on;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

const inputKey = (i) => JSON.stringify([i.brand.trim(), i.headline.trim(), i.copy.trim(), i.type, i.asset ? [i.asset.name, i.asset.w, i.asset.h, i.asset.lumMean, i.asset.lumStd] : null]);

function ScoreRing({ score, tone }) {
  const on = useMounted();
  const r = 52, C = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90" role="img" aria-label={`Ad health score ${score} out of 100`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E2E8F0" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={TONE[tone].hex} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={on ? C * (1 - score / 100) : C}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-slate-900">{score}</span>
        <span className="text-xs font-medium text-slate-400">out of 100</span>
      </div>
    </div>
  );
}

/* ------------------------------ Report --------------------------------- */

function HookParts({ parts, asset }) {
  const on = useMounted();
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        Scored on the creative and the copy · {asset ? "40% asset, 35% headline, 25% alignment" : "70% headline, 30% alignment"}
      </p>
      <div className="mt-3 flex gap-3.5">
        {asset && <img src={asset.thumb} alt="Inspected creative" className="h-20 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover" />}
        <ul className="flex min-w-0 flex-1 flex-col gap-3.5">
          {parts.map((p, i) => {
            const tone = p.value == null ? null : p.value < 40 ? "bad" : p.value < 70 ? "warn" : "good";
            return (
              <li key={p.key}>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-semibold text-slate-800">{p.label}</span>
                  {p.value == null ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Not inspected</span>
                  ) : (
                    <span className={`font-semibold tabular-nums ${TONE[tone].text}`}>{p.value}%</span>
                  )}
                </div>
                {p.value != null && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${TONE[tone].bg}`} style={{ width: on ? `${p.value}%` : "0%", transition: `width .8s cubic-bezier(.2,.8,.2,1) ${300 + i * 120}ms` }} />
                  </div>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{p.note}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Report({ input, r }) {
  const on = useMounted();
  const tone = TONE[r.tone];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,300px)_1fr]">
        <section className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Ad Health Score</p>
          <div className="mt-4"><ScoreRing score={r.score} tone={r.tone} /></div>
          <span className={`mt-4 rounded-full px-3 py-1 text-xs font-semibold ${tone.chip}`}>{r.status}</span>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            Weakest vital sign: <span className="font-semibold text-slate-700">{r.weakest.label}</span> at {r.weakest.value}%. Fix that first.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Vital signs</h3>
            <span className="text-xs text-slate-400">{input.type === "video" ? "Short-form video" : "Static image"}{input.brand.trim() ? ` · ${input.brand.trim()}` : ""}</span>
          </div>
          <ul className="mt-5 flex flex-col gap-5">
            {r.vitals.map((v, i) => (
              <li key={v.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-slate-700">{v.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[v.tone].chip}`}>{v.status}</span>
                    <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-900">{v.value}%</span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={v.value} aria-valuemin={0} aria-valuemax={100} aria-label={v.label}>
                  <div
                    className={`h-full rounded-full ${TONE[v.tone].bg}`}
                    style={{ width: on ? `${v.value}%` : "0%", transition: `width .9s cubic-bezier(.2,.8,.2,1) ${i * 120}ms` }}
                  />
                </div>
                {v.parts && <HookParts parts={v.parts} asset={input.asset} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Icon.Alert className="h-[18px] w-[18px] text-rose-500" />
          <h3 className="text-sm font-semibold text-slate-900">Conversion leaks: the diagnosis</h3>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {r.leaks.map((l, i) => (
            <li key={l.title} className="flex gap-3.5 rounded-xl bg-slate-50/80 p-4">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-100 text-xs font-bold tabular-nums text-rose-600">{i + 1}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  {l.title}
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200">{l.area}</span>
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{l.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs font-bold text-white">Rx</span>
          <h3 className="text-base font-semibold tracking-tight text-slate-900">The Doctor's Prescription</h3>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Rewritten headlines</p>
        <ul className="mt-2 grid gap-3 sm:grid-cols-2">
          {r.headlines.map((h) => (
            <li key={h.text} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[15px] font-semibold leading-snug text-slate-900">{h.text}</span>
              <span className="mt-3 flex items-center justify-between text-[11px]">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">{h.tag}</span>
                <span className="font-medium tabular-nums text-slate-400">{h.text.length}/40</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Scroll-stopping opening hooks</p>
        <ul className="mt-2 grid gap-3">
          {r.hooks.map((h) => (
            <li key={h.text} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm leading-relaxed text-slate-800">“{h.text}”</p>
              <span className="mt-3 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{h.tag}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Visual layout recommendation</p>
        <div className="mt-2 flex gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Icon.Layout className="h-[18px] w-[18px]" /></span>
          <p className="text-sm leading-relaxed text-slate-700">{r.layout}</p>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Rewrites are starting points. Swap in claims and numbers you can substantiate before you publish.
        </p>
      </section>
    </div>
  );
}

/* ----------------------------- Scan view ------------------------------- */

const SCAN_STEPS = ["Analyzing hook stop-rate…", "Checking offer friction…", "Scoring value proposition…", "Reading CTA urgency…"];
const SCAN_STEPS_ASSET = ["Inspecting creative asset…", "Analyzing hook stop-rate…", "Checking offer friction…", "Scoring value proposition…", "Reading CTA urgency…"];

function ScanView({ steps, step, template, asset }) {
  const chips = steps.length > 4 ? ["Creative", "Hook", "Offer", "Clarity", "CTA"] : ["Hook", "Offer", "Clarity", "CTA"];
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative h-60 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {asset ? (
          <img src={asset.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : template ? (
          <div className="absolute inset-0"><Creative t={template} /></div>
        ) : (
          <div className="flex h-full flex-col gap-3 p-5">
            <span className="h-3 w-2/3 rounded-full bg-slate-200" />
            <span className="h-2 w-full rounded-full bg-slate-100" />
            <span className="h-2 w-11/12 rounded-full bg-slate-100" />
            <span className="h-2 w-4/5 rounded-full bg-slate-100" />
            <span className="mt-auto h-8 w-24 rounded-full bg-blue-100" />
          </div>
        )}
        <span className="scan-line" />
      </div>
      <p className="mt-8 text-base font-semibold text-slate-900" role="status" aria-live="polite">{steps[step]}</p>
      <div className="mt-4 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-slate-200"><i className="scan-fill block h-full rounded-full bg-blue-600" /></div>
      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {chips.map((s, i) => (
          <li key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${i <= step ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-400"}`}>
            {i < step ? <Icon.Check className="h-3 w-3" /> : <span className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-blue-600" : "bg-slate-300"}`} />}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------- Modal --------------------------------- */

const LIM = { headline: 40 };
const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10";

function ExamineModal({ init, onClose, credits, onSpend, onSave, savedKeys, notify }) {
  const tpl = init.template || null;
  const start = init.input || null;
  const [brand, setBrand] = useState(start ? start.brand : "");
  const [headline, setHeadline] = useState(start ? start.headline : "");
  const [copy, setCopy] = useState(start ? start.copy : "");
  const [type, setType] = useState(start ? start.type : tpl ? (tpl.type === "video" ? "video" : "static") : init.type || "static");
  const [sampleId, setSampleId] = useState(null);
  const [applied, setApplied] = useState(false);
  const [asset, setAsset] = useState(start ? start.asset || null : null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetErr, setAssetErr] = useState("");
  const [stage, setStage] = useState(start ? "report" : "input");
  const [step, setStep] = useState(0);
  const [snap, setSnap] = useState(start || null);
  const [report, setReport] = useState(start ? analyze(start) : null);
  const [copied, setCopied] = useState(false);
  const timers = useRef([]);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      timers.current.forEach((t) => (clearTimeout(t), clearInterval(t)));
    };
  }, [onClose]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [stage]);

  const touch = (fn) => (e) => (setSampleId(null), setApplied(false), fn(e.target.value));
  const applyTemplate = () => {
    if (!tpl) return;
    setSampleId(null);
    setHeadline(tpl.headline);
    setCopy(tpl.primary);
    setType(tpl.type === "video" ? "video" : "static");
    setApplied(true);
    notify("Template structure applied");
  };
  const loadSample = (s) => {
    setSampleId(s.id);
    setApplied(false);
    setAssetErr("");
    setAsset(renderSampleAsset(s.id));
    setBrand(s.brand);
    setHeadline(s.headline);
    setCopy(s.copy);
    setType(s.type);
  };

  const onFile = (file) => {
    setAssetErr("");
    setAssetBusy(true);
    readAsset(file)
      .then((a) => {
        setAsset(a);
        setSampleId(null);
        setApplied(false);
        if (a.kind === "video") setType("video");
      })
      .catch((e) => setAssetErr(e.message))
      .finally(() => setAssetBusy(false));
  };

  const hasContent = !!(headline.trim() || copy.trim() || asset);
  const canRun = hasContent && credits > 0 && stage === "input" && !assetBusy;

  const run = () => {
    if (!canRun) return;
    const input = { brand, headline, copy, type, asset };
    onSpend();
    setSnap(input);
    setStage("scan");
    setStep(0);
    let i = 0;
    const n = (asset ? SCAN_STEPS_ASSET : SCAN_STEPS).length;
    const tick = setInterval(() => {
      i += 1;
      setStep(Math.min(i, n - 1));
    }, Math.round(1500 / n));
    const done = setTimeout(() => {
      clearInterval(tick);
      setReport(analyze(input));
      setStage("report");
    }, 1500);
    timers.current.push(tick, done);
  };

  const saved = snap ? savedKeys.includes(inputKey(snap)) : false;

  const doCopy = async () => {
    const ok = await copyText(prescriptionText(snap, report));
    if (ok) {
      setCopied(true);
      const t = setTimeout(() => setCopied(false), 2000);
      timers.current.push(t);
      notify("Copied to clipboard!");
    } else {
      notify("Copy was blocked here. Select the text and copy it manually.", 4500);
    }
  };

  const title = stage === "report" ? "The Doctor's Prescription" : "Ad Clinical Examination";
  const sub =
    stage === "report" ? "Your diagnostic report is ready." : stage === "scan" ? "Running the scan…" : "Load a sample or enter your ad. The scan takes about two seconds.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="ex-title" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-900/20 sm:rounded-3xl"
      >
        <header className="flex items-start gap-3.5 border-b border-slate-100 px-6 py-5 md:px-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30"><Icon.Stethoscope className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 pr-8">
            <h2 id="ex-title" className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">{sub}</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
            <Icon.Close className="h-4 w-4" />
          </button>
        </header>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          {stage === "input" && (
            <div className={`grid gap-6 px-6 py-6 md:px-8 ${tpl ? "md:grid-cols-[minmax(0,280px)_1fr]" : ""}`}>
              {tpl && (
                <aside className="flex flex-col gap-5">
                  <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm">
                    <Creative t={tpl} />
                    <div className="pointer-events-none absolute left-2.5 top-2.5 z-[2]">
                      <span className={pill}>{tpl.type === "video" ? "VIDEO" : "STATIC"}</span>
                    </div>
                  </div>
                  <button
                    onClick={applyTemplate}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 ${applied ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700"}`}
                  >
                    {applied ? <Icon.Check className="h-4 w-4" /> : <Icon.Sparkle className="h-4 w-4" />}
                    {applied ? "Structure applied" : "Apply Template Structure"}
                  </button>
                  {applied && (
                    <p className="-mt-2 text-center text-xs leading-relaxed text-slate-500">
                      Filled with the {tpl.framework.toLowerCase()} headline and copy for {tpl.format.split(" · ").slice(0, 2).join(" · ")}. Edit anything, then run the scan.
                    </p>
                  )}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{tpl.label}</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">{tpl.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{tpl.framework}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{tpl.format}</span>
                    </div>
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Why this converts</p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {tpl.why.map((w) => (
                        <li key={w} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
                          <span className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Icon.Check className="h-2.5 w-2.5" /></span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              )}

              <div className="flex min-w-0 flex-col gap-6">
                <AssetZone asset={asset} busy={assetBusy} error={assetErr} onFile={onFile} onClear={() => { setAsset(null); setAssetErr(""); setSampleId(null); }} />
                <section>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Quick sample loaders · 1-click test</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SAMPLES.map((s) => {
                      const on = sampleId === s.id;
                      return (
                        <button
                          key={s.id} onClick={() => loadSample(s)} aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"}`}
                        >
                          <Icon.Bolt className="h-3.5 w-3.5" />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Manual input</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="ex-brand" className="mb-1.5 block text-sm font-medium text-slate-700">Brand / Product Name</label>
                      <input id="ex-brand" className={field} value={brand} onChange={touch(setBrand)} placeholder="e.g. Lumen Glow vitamin C serum" />
                    </div>
                    <div>
                      <label htmlFor="ex-type" className="mb-1.5 block text-sm font-medium text-slate-700">Ad Creative Type</label>
                      <div className="relative">
                        <select id="ex-type" className={`${field} appearance-none pr-10`} value={type} onChange={touch(setType)}>
                          <option value="static">Static Image</option>
                          <option value="video">Short-Form Video</option>
                        </select>
                        <Icon.Chevron className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="ex-headline" className="text-sm font-medium text-slate-700">Headline</label>
                      <span className={`text-[11px] font-medium tabular-nums ${headline.length > LIM.headline ? "text-amber-600" : "text-slate-400"}`}>{headline.length}/{LIM.headline}</span>
                    </div>
                    <input id="ex-headline" className={field} value={headline} onChange={touch(setHeadline)} placeholder="The one outcome your buyer wants" />
                  </div>
                  <div>
                    <label htmlFor="ex-copy" className="mb-1.5 block text-sm font-medium text-slate-700">Primary Copy / Caption</label>
                    <textarea id="ex-copy" rows={5} className={`${field} resize-none leading-relaxed`} value={copy} onChange={touch(setCopy)} placeholder="Paste the caption or primary text that runs above your creative" />
                  </div>
                </section>
              </div>
            </div>
          )}

          {stage === "scan" && <ScanView steps={snap && snap.asset ? SCAN_STEPS_ASSET : SCAN_STEPS} step={step} template={tpl} asset={snap && snap.asset} />}

          {stage === "report" && report && (
            <div className="px-6 py-6 md:px-8"><Report input={snap} r={report} /></div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-white px-6 py-4 md:px-8">
          {stage === "input" && (
            <>
              <p className="flex-1 text-xs text-slate-500">
                {credits > 0 ? (
                  <>Uses <span className="font-semibold tabular-nums text-slate-700">1 credit</span> · {credits} left</>
                ) : (
                  <span className="font-medium text-rose-600">You are out of credits.</span>
                )}
                {credits > 0 && !hasContent && <span className="ml-2 text-slate-400">Add a creative, headline or copy to scan.</span>}
              </p>
              <button
                onClick={run} disabled={!canRun}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none sm:w-auto"
              >
                <Icon.Stethoscope className="h-4 w-4" />
                Run Diagnostic Scan
              </button>
            </>
          )}
          {stage === "scan" && <p className="flex-1 text-center text-xs text-slate-500">Scanning your ad…</p>}
          {stage === "report" && (
            <>
              <button onClick={() => setStage("input")} className="mr-auto rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
                Edit ad
              </button>
              <button onClick={doCopy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
                {copied ? <Icon.Check className="h-4 w-4 text-emerald-600" /> : <Icon.Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy Prescription"}
              </button>
              <button
                onClick={() => !saved && onSave(snap, report)} disabled={saved}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 ${saved ? "cursor-default bg-emerald-50 text-emerald-700 shadow-none" : "bg-blue-600 text-white shadow-blue-600/25 hover:bg-blue-700"}`}
              >
                {saved ? <Icon.Check className="h-4 w-4" /> : <Icon.Bookmark className="h-4 w-4" />}
                {saved ? "Saved to Vault" : "Save to Vault"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

export { TONE, useMounted, copyText, inputKey, ScoreRing, HookParts, Report, SCAN_STEPS, SCAN_STEPS_ASSET, ScanView, LIM, field, ExamineModal };
