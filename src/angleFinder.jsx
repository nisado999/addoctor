import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { apiFetch, isCancel } from "./api.js";
import { copyText } from "./shared.js";
import { readJSON, writeJSON } from "./storage.js";
import { useBillingOn, COSTS } from "./billing.js";
import { track } from "./track.js";
import { cleanResult, hookFor, labelOf, templateOf, asText } from "./angleKit.js";

/* The Angle Finder: say what you sell and it finds the different kinds of buyer you can win (client avatars), then
   the angles that speak to each one, with a ready headline, the argument and the shot. Each angle is one of the nine
   in angles.js, so "Make this ad" opens the template that builds it. The last result stays in this browser. */

const KEY = "addoctor.angles.v1";
const STEPS = ["Reading what you sell", "Working out who buys it and why", "Writing an angle for each buyer", "Checking the hooks are different"];
const EXAMPLE = "Heavyweight organic cotton hoodies, made in Portugal, sized for tall guys.";
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/10";

function Thinking({ step }) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon.Sparkle className="h-4 w-4 animate-pulse text-blue-600" />Thinking…</p>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 text-sm ${i < step ? "text-slate-400" : i === step ? "font-medium text-slate-900" : "text-slate-300"}`}>
            {i < step ? <Icon.Check className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-current" />}{s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm leading-snug text-slate-700">{children}</dd>
    </div>
  );
}

function AngleRow({ g, onCopy, onMake }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <span className="inline-block rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">{labelOf(g.kind)}</span>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{g.hook}</p>
      {g.message && <p className="mt-1.5 text-sm leading-snug text-slate-600">{g.message}</p>}
      {g.visual && <p className="mt-1.5 text-xs leading-snug text-slate-500"><span className="font-semibold text-slate-600">The shot:</span> {g.visual}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onCopy(g.hook)} className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 ${ring}`}><Icon.Copy className="h-3.5 w-3.5" />Copy hook</button>
        {templateOf(g.kind) && <button onClick={() => onMake(g)} className={`inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 ${ring}`}><Icon.Wand className="h-3.5 w-3.5" />Make this ad</button>}
      </div>
    </li>
  );
}

function AvatarCard({ a, n, onCopy, onMake }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Buyer {n}</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{a.name}</h3>
      {a.who && <p className="mt-1 text-sm text-slate-600">{a.who}</p>}
      <dl className="mt-4 grid gap-3">
        <Row label="Their moment">{a.situation}</Row>
        <Row label="What bothers them">{a.pain}</Row>
        <Row label="What they want">{a.desire}</Row>
        <Row label="What holds them back">{a.objection}</Row>
        <Row label="Where to reach them">{a.where}</Row>
      </dl>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Angles for this buyer</p>
      <ul className="mt-2 space-y-3">
        {a.angles.map((g, i) => <AngleRow key={i} g={g} onCopy={onCopy} onMake={onMake} />)}
      </ul>
    </article>
  );
}

export function AngleView({ notify, onMake }) {
  const [saved] = useState(() => readJSON(KEY, null));
  const [desc, setDesc] = useState(saved && typeof saved.desc === "string" ? saved.desc : "");
  const [who, setWho] = useState(saved && typeof saved.who === "string" ? saved.who : "");
  const [res, setRes] = useState(() => cleanResult(saved && saved.res));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const ctl = useRef(null);
  const billingOn = useBillingOn();
  const cost = COSTS.angles || 2;

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);

  const find = async (e) => {
    if (e) e.preventDefault();
    const description = desc.trim();
    if (description.length < 8 || busy) return;
    const ctrl = new AbortController();
    ctl.current = ctrl;
    setBusy(true); setErr("");
    try {
      const j = await apiFetch("/angles/find", { body: { description, audience: who.trim() }, signal: ctrl.signal, timeout: 120000 });
      const clean = cleanResult(j);
      if (!clean) throw new Error("The server sent an answer this page can't read. Try again.");
      setRes(clean);
      writeJSON(KEY, { desc: description, who: who.trim(), res: clean });
      track("angles_found", { avatars: clean.avatars.length });
    } catch (er) {
      if (!isCancel(er)) setErr(er.message || "Could not find angles. Try again.");
    } finally { setBusy(false); }
  };

  const copy = async (text, what) => {
    const ok = await copyText(text);
    notify(ok === false ? "Couldn't copy. Select the text instead." : what);
  };
  const make = (g) => {
    track("angle_make", { kind: g.kind, template_id: templateOf(g.kind) });
    onMake(templateOf(g.kind), hookFor(g.hook));
  };

  return (
    <div className="max-w-5xl">
      <form onSubmit={find} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="angle-desc" className="text-sm font-semibold text-slate-900">What do you sell?</label>
        <textarea id="angle-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={800} placeholder={EXAMPLE} className={`${field} mt-2 resize-y`} />
        <label htmlFor="angle-who" className="mt-4 block text-sm font-semibold text-slate-900">Who do you think buys it? <span className="font-normal text-slate-500">Optional</span></label>
        <input id="angle-who" value={who} onChange={(e) => setWho(e.target.value)} maxLength={300} placeholder="e.g. men 25 to 40 who struggle to find clothes that fit" className={`${field} mt-2`} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={desc.trim().length < 8 || busy} className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-7 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${ring}`}>
            <Icon.Sparkle className="h-4 w-4" />{busy ? "Finding…" : `Find my angles${billingOn ? ` · ${cost} credits` : ""}`}
          </button>
          {!desc && <button type="button" onClick={() => setDesc(EXAMPLE)} className={`rounded-full text-sm font-semibold text-slate-500 hover:text-slate-800 ${ring}`}>Try an example</button>}
        </div>
      </form>

      {busy && <Thinking step={step} />}
      {err && !busy && <p className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700" role="alert">{err}</p>}

      {res && !busy && (
        <section className="mt-8" aria-label="Buyers and angles">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{res.avatars.length} kinds of buyer</p>
              {res.product && <p className="mt-1 text-sm font-semibold text-slate-900">{res.product}</p>}
            </div>
            <button onClick={() => copy(asText(res), "Everything copied")} className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 ${ring}`}><Icon.Copy className="h-3.5 w-3.5" />Copy everything</button>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {res.avatars.map((a, i) => <AvatarCard key={a.name + i} a={a} n={i + 1} onCopy={(t) => copy(t, "Hook copied")} onMake={make} />)}
          </div>
          <p className="mt-5 text-xs text-slate-400">Written by AI from your description, so treat them as strong guesses and test them. Where a hook has [X], put in your own real number.</p>
        </section>
      )}
    </div>
  );
}
