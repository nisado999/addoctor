import { useMemo, useRef, useState } from "react";
import { Icon } from "./ui";
import { readJSON, writeJSON } from "./storage.js";
import { track } from "./track.js";
import { QUESTIONS, CURRENCIES, visibleQuestions, optionsOf, textOf, buildPlan, planText, money, num } from "./metaPlan.js";

/* Meta Ads Plan: an interview about the brand, the goal and the numbers, then a campaign plan worked out in the
   browser (src/metaPlan.js), then an offer to have the owner's agency run it. Answers stay in this browser. */

const KEY = "addoctor.metaplan.v1";
// Who the "work with me" box is for. Set these in .env to change them without touching code.
const AGENCY = {
  name: import.meta.env.VITE_AGENCY_NAME || "Nisado",
  email: import.meta.env.VITE_AGENCY_EMAIL || "nisado9999@gmail.com",
  booking: /^https:\/\//.test(import.meta.env.VITE_AGENCY_BOOKING || "") ? import.meta.env.VITE_AGENCY_BOOKING : "",
};

const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10";
const btnDark = "inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:opacity-40";
const btnLight = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15";
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const TONE = {
  good: { box: "border-emerald-100 bg-emerald-50/60", dot: "bg-emerald-500", label: "Ready" },
  warn: { box: "border-amber-100 bg-amber-50/60", dot: "bg-amber-500", label: "Fix soon" },
  bad: { box: "border-rose-100 bg-rose-50/60", dot: "bg-rose-500", label: "Fix first" },
};
const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

function Section({ title, sub, children }) {
  return (
    <section className="mt-8">
      <h3 className="font-display text-xl font-extrabold tracking-[-0.02em] text-slate-950">{title}</h3>
      {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------- the questions ------------------------------------------- */

function Question({ q, a, set, onNext }) {
  const v = a[q.id] || "";
  const label = textOf(q, a, "label");
  const hint = textOf(q, a, "hint");
  return (
    <div>
      <h2 className="font-display mt-1 text-2xl font-extrabold tracking-[-0.03em] text-slate-950">{label}</h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-5">
        {q.type === "text" && <input autoFocus value={v} onChange={(e) => set(q.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onNext(); }} placeholder={q.ph} className={field} aria-label={label} />}
        {q.type === "area" && <textarea autoFocus rows={3} value={v} onChange={(e) => set(q.id, e.target.value)} placeholder={q.ph} className={field} aria-label={label} />}
        {q.type === "money" && (
          <div className="flex gap-2">
            <input autoFocus inputMode="decimal" value={v} onChange={(e) => set(q.id, e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} onKeyDown={(e) => { if (e.key === "Enter") onNext(); }} placeholder={q.ph} className={field} aria-label={label} />
            <select value={a.cur || "EUR"} onChange={(e) => set("cur", e.target.value)} aria-label="Currency" className="rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10">
              {CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
          </div>
        )}
        {q.type === "choice" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {optionsOf(q, a).map(([id, l, sub]) => (
              <button key={id} onClick={() => { set(q.id, id); setTimeout(onNext, 140); }} aria-pressed={v === id}
                className={`rounded-xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15 ${v === id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                <span className="block text-sm font-semibold">{l}</span>
                {sub && <span className={`mt-0.5 block text-xs ${v === id ? "text-slate-300" : "text-slate-500"}`}>{sub}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------- the plan --------------------------------------------- */

function CampaignCard({ c, i, cur }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <p className={eyebrow}>Campaign {i + 1} · {c.objective}</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{c.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{c.type}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-950">{money(c.daily, cur)}<span className="text-xs font-medium text-slate-500"> /day</span></p>
          <p className="text-xs font-semibold text-blue-700">{Math.round(c.share * 100)}% of budget</p>
        </div>
      </div>
      <p className="px-5 pt-4 text-[13px] leading-relaxed text-slate-600">{c.why}</p>
      <ul className="space-y-3 p-5">
        {c.adsets.map((s, j) => (
          <li key={j} className="relative rounded-xl bg-slate-50 p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-blue-600">
            <p className="text-sm font-semibold text-slate-900">Ad set: {s.name}</p>
            <dl className="mt-2 grid gap-1.5 text-[13px] leading-relaxed">
              <div><dt className="inline font-semibold text-slate-500">Audience · </dt><dd className="inline text-slate-700">{s.audience}</dd></div>
              <div><dt className="inline font-semibold text-slate-500">Optimise for · </dt><dd className="inline text-slate-700">{s.optimise}</dd></div>
              <div><dt className="inline font-semibold text-slate-500">Ads · </dt><dd className="inline text-slate-700">{s.ads}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
    </article>
  );
}

function AgencyBox({ plan, answers, user }) {
  const [f, setF] = useState({ name: "", email: (user && user.email) || "", phone: "", message: "", ok: false });
  const [state, setState] = useState("idle");   // idle | sending | sent | error
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const text = () => planText(plan, answers);
  const mailto = () => {
    const body = `Hi ${AGENCY.name},\n\nI made a Meta ads plan on AdDoctor and would like to talk about working together.\n\nName: ${f.name}\nEmail: ${f.email}${f.phone ? `\nPhone: ${f.phone}` : ""}${f.message ? `\n\n${f.message}` : ""}\n\n---\n${text()}`;
    return `mailto:${AGENCY.email}?subject=${encodeURIComponent(`Meta ads for ${plan.brand}`)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
  };
  const send = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Add your name.");
    if (!emailOk(f.email)) return setErr("Add an email we can reply to.");
    if (!f.ok) return setErr(`Tick the box so ${AGENCY.name} may contact you.`);
    setErr(""); setState("sending");
    try {
      const { saveLead } = await import("./auth.js");
      await saveLead({
        name: f.name.trim().slice(0, 120), email: f.email.trim().slice(0, 200), phone: f.phone.trim().slice(0, 40) || null,
        message: f.message.trim().slice(0, 2000) || null, brand: plan.brand.slice(0, 200), site: String(answers.site || "").slice(0, 300) || null,
        monthly_budget: num(answers.budget) || null, currency: plan.cur, answers, plan: text().slice(0, 12000), user_id: (user && user.id) || null,
      });
      setState("sent");
      track("agency_lead", { method: "form", budget: num(answers.budget) || 0, model: answers.model || "" });
    } catch (er) {
      setState("error");
      track("agency_lead_failed", {});
    }
  };

  if (state === "sent") return (
    <div className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8" role="status">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-300"><Icon.Check className="h-5 w-5" /></span>
      <h3 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.03em]">Thanks, {f.name.split(" ")[0]}. Your plan is on its way to {AGENCY.name}.</h3>
      <p className="mt-2 text-sm text-white/70">Expect a reply at {f.email} within one working day.{AGENCY.booking ? " Want to skip the wait? Pick a time below." : ""}</p>
      {AGENCY.booking && <a href={AGENCY.booking} target="_blank" rel="noopener noreferrer" onClick={() => track("agency_booking", { from: "sent" })} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100">Book a call now <Icon.Arrow className="h-4 w-4" /></a>}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-3xl bg-slate-950 text-white">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">Done for you</span>
          <h3 className="font-display mt-4 text-[28px] font-extrabold leading-tight tracking-[-0.03em]">Want {AGENCY.name} to run this for you?</h3>
          <p className="mt-3 text-sm leading-relaxed text-white/70">A plan is the easy part. Building it in Ads Manager, making the ads, reading the numbers every day and knowing when to scale is the work. Send your plan and get a free review of your account and this strategy.</p>
          <ul className="mt-5 space-y-2.5 text-sm text-white/85">
            {["Account and tracking check, free", "Campaigns built exactly to this plan", "New ads made and tested every week", "A clear report: what you spent and what it made"].map((t) => (
              <li key={t} className="flex items-start gap-2.5"><Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{t}</li>
            ))}
          </ul>
          {AGENCY.booking && <a href={AGENCY.booking} target="_blank" rel="noopener noreferrer" onClick={() => track("agency_booking", { from: "box" })} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">Or book a free 20-minute call <Icon.Arrow className="h-4 w-4" /></a>}
        </div>
        <form onSubmit={send} className="rounded-2xl bg-white p-5 text-slate-900 sm:p-6" noValidate>
          <p className="text-sm font-semibold">Send my plan to {AGENCY.name}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoComplete="name" aria-label="Your name" className={field} />
            <input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" type="email" autoComplete="email" aria-label="Email" className={field} />
            <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone or WhatsApp (optional)" type="tel" autoComplete="tel" aria-label="Phone or WhatsApp, optional" className={field + " sm:col-span-2"} />
            <textarea value={f.message} onChange={(e) => set("message", e.target.value)} rows={3} placeholder="Anything we should know? (optional)" aria-label="Message, optional" className={field + " sm:col-span-2"} />
          </div>
          <label className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <input type="checkbox" checked={f.ok} onChange={(e) => set("ok", e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>{AGENCY.name} may contact me about this plan. My answers and plan are sent along. <a href="privacy.html" target="_blank" rel="noopener" className="font-semibold underline">Privacy</a></span>
          </label>
          {err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
          {state === "error" && (
            <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              That didn't go through. <a href={mailto()} onClick={() => track("agency_lead", { method: "email" })} className="font-semibold underline">Send it by email instead</a>, it opens with your plan filled in.
            </p>
          )}
          <button type="submit" disabled={state === "sending"} className={btnDark + " mt-4 w-full"}>{state === "sending" ? "Sending…" : <>Send my plan <Icon.Arrow className="h-4 w-4" /></>}</button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Free, no commitment.</p>
        </form>
      </div>
    </div>
  );
}

function PlanResult({ plan, answers, onEdit, onRestart, onGo, notify, user }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(planText(plan, answers)); notify("Plan copied"); track("plan_copy", {}); }
    catch (e) { notify("Could not copy. Use Download instead."); }
  };
  const download = () => {
    const blob = new Blob([planText(plan, answers)], { type: "text/plain;charset=utf-8" });
    const u = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = u; el.download = `meta-ads-plan-${plan.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand"}.txt`;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
    track("plan_download", {});
  };
  const order = { bad: 0, warn: 1, good: 2 };
  const checks = [...plan.checks].sort((x, y) => order[x.tone] - order[y.tone]);

  return (
    <div>
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={eyebrow}>Your Meta ads plan · {plan.brand}</p>
            <h2 className="font-display mt-2 text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-slate-950">{plan.verdict}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className={btnLight}><Icon.Copy className="h-4 w-4" />Copy</button>
            <button onClick={download} className={btnLight}><Icon.Download className="h-4 w-4" />Download</button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {plan.numbers.map((n) => (
            <div key={n.label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{n.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{n.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{n.note}</p>
            </div>
          ))}
        </div>
      </div>

      <Section title="Before you spend" sub="Fix the red ones first. They decide whether the rest can work.">
        <ul className="grid gap-3 md:grid-cols-2">
          {checks.map((c) => (
            <li key={c.title} className={`rounded-2xl border p-4 ${TONE[c.tone].box}`}>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className={`h-2 w-2 rounded-full ${TONE[c.tone].dot}`} />{c.title}<span className="ml-auto text-[11px] font-semibold text-slate-500">{TONE[c.tone].label}</span></p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{c.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Campaign structure" sub={`${plan.campaigns.length} campaign${plan.campaigns.length > 1 ? "s" : ""}, ${plan.campaigns.reduce((n, c) => n + c.adsets.length, 0)} ad set${plan.campaigns.reduce((n, c) => n + c.adsets.length, 0) > 1 ? "s" : ""}. Build it exactly like this in Ads Manager.`}>
        <div className="grid gap-4">{plan.campaigns.map((c, i) => <CampaignCard key={c.name} c={c} i={i} cur={plan.cur} />)}</div>
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Targeting">
          <ul className="space-y-2.5">
            {plan.targeting.map((t) => <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-slate-700"><Icon.Target className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{t}</li>)}
          </ul>
        </Section>
        <Section title="Rules for running it">
          <ul className="space-y-3">
            {plan.rules.map((r) => <li key={r.title} className="text-[13px] leading-relaxed text-slate-700"><span className="font-semibold text-slate-900">{r.title}</span> {r.text}</li>)}
          </ul>
        </Section>
      </div>

      <Section title="The ads to make" sub={`Aim for ${plan.adCount} ads that look different from each other, not ${plan.adCount} versions of one.`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className={eyebrow}>Concepts</p>
            <ol className="mt-3 space-y-2">
              {plan.concepts.map((c, i) => <li key={c} className="flex gap-3 text-[13px] leading-relaxed text-slate-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-950 text-[10px] font-semibold text-white">{i + 1}</span>{c}</li>)}
            </ol>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className={eyebrow}>Hooks to try</p>
            <ul className="mt-3 space-y-2">{plan.hooks.map((h) => <li key={h} className="text-[13px] font-medium text-slate-800">{h}</li>)}</ul>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => onGo("static")} className={btnDark + " px-4 py-2 text-xs"}><Icon.Wand className="h-3.5 w-3.5" />Make these ads</button>
              <button onClick={() => onGo("explore")} className={btnLight + " px-4 py-2 text-xs"}>Browse templates</button>
              <button onClick={() => onGo("inspiration")} className={btnLight + " px-4 py-2 text-xs"}>More hooks</button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Your first 30 days">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {plan.weeks.map((w) => (
            <li key={w.title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">{w.title}</p>
              <ul className="mt-2 space-y-1.5">{w.items.map((t) => <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-slate-600"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{t}</li>)}</ul>
            </li>
          ))}
        </ol>
      </Section>

      <div className="mt-10"><AgencyBox plan={plan} answers={answers} user={user} /></div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <ul className="space-y-1">{plan.assumptions.map((t) => <li key={t} className="text-xs text-slate-400">{t}</li>)}</ul>
        <div className="flex gap-2">
          <button onClick={onEdit} className={btnLight}>Change answers</button>
          <button onClick={onRestart} className={btnLight}>Start over</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------- screen ---------------------------------------------- */

export function PlanView({ notify, onGo, user }) {
  const [saved] = useState(() => readJSON(KEY, null));
  const [answers, setAnswers] = useState(() => (saved && saved.answers && typeof saved.answers === "object" ? saved.answers : { cur: "EUR" }));
  const [phase, setPhase] = useState(() => (saved && saved.done ? "plan" : "intro"));
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");

  const list = visibleQuestions(answers);
  const q = list[Math.min(step, list.length - 1)];
  const plan = useMemo(() => (phase === "plan" ? buildPlan(answers) : null), [phase, answers]);

  const persist = (a, done) => writeJSON(KEY, { answers: a, done });
  // Choice buttons move on after a short pause, so the latest answers and step are read from refs, not the closure.
  const aRef = useRef(answers); aRef.current = answers;
  const sRef = useRef(step); sRef.current = step;
  const set = (id, v) => {
    const n = { ...aRef.current, [id]: v };
    if (id === "model" && aRef.current.model !== v) delete n.goal;   // a new business type changes which goals make sense
    aRef.current = n;
    setAnswers(n);
    persist(n, false);
  };

  const valid = (qq, a) => {
    if (qq.optional) return true;
    const v = a[qq.id];
    if (qq.type === "money") return num(v) > 0;
    if (qq.type === "choice") return optionsOf(qq, a).some(([id]) => id === v);
    return String(v || "").trim().length >= 2;
  };
  const next = () => {
    const a = aRef.current, at = sRef.current;
    const qs = visibleQuestions(a);
    const cur = qs[Math.min(at, qs.length - 1)];
    if (!valid(cur, a)) { setErr(cur.type === "money" ? "Add a number (a rough one is fine)." : "Pick or type an answer to continue."); return; }
    setErr("");
    if (at + 1 < qs.length) { sRef.current = at + 1; setStep(at + 1); return; }
    persist(a, true);
    setPhase("plan");
    track("plan_made", { model: a.model || "", goal: a.goal || "", budget: num(a.budget) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => { setErr(""); if (step === 0) setPhase("intro"); else setStep(step - 1); };
  const restart = () => { const a = { cur: answers.cur || "EUR" }; aRef.current = a; setAnswers(a); persist(a, false); setStep(0); setPhase("intro"); };

  const parts = [...new Set(QUESTIONS.map((x) => x.part))];
  const pct = Math.round(((step + 1) / Math.max(1, list.length)) * 100);

  return (
    <section className="mx-auto mt-6 max-w-5xl" aria-label="Meta Ads Plan">
      {phase === "intro" && (
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Free · about 3 minutes</span>
          <h2 className="font-display mt-4 text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-slate-950">How should you run Meta ads? Let the doctor write the plan.</h2>
          <p className="mt-2 text-[15px] text-slate-500">Tell us about your brand, your numbers and your account. You get a plan built for your budget, not a generic checklist.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["Which campaigns and objective", "Sales, Leads or App, and when to use Advantage+"],
              ["How many ad sets and ads", "Sized to what your budget can actually teach Meta"],
              ["Targeting and budget split", "Down to the daily budget of each campaign"],
              ["Your numbers", "Break-even ROAS, max cost per sale, when to kill or scale"],
            ].map(([t, s]) => (
              <li key={t} className="flex gap-3 rounded-2xl bg-slate-50 p-4"><Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span><span className="block text-sm font-semibold text-slate-900">{t}</span><span className="block text-xs text-slate-500">{s}</span></span></li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button onClick={() => { setPhase("questions"); setStep(0); track("plan_start", {}); }} className={btnDark}>{saved && saved.answers && saved.answers.brand ? "Continue" : "Start"} <Icon.Arrow className="h-4 w-4" /></button>
            {saved && saved.done && <button onClick={() => setPhase("plan")} className={btnLight}>See my last plan</button>}
          </div>
        </div>
      )}

      {phase === "questions" && q && (
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="flex gap-1.5" aria-hidden="true">
            {parts.map((p) => <span key={p} className={`h-1.5 flex-1 rounded-full ${parts.indexOf(p) < parts.indexOf(q.part) ? "bg-slate-950" : parts.indexOf(p) === parts.indexOf(q.part) ? "bg-blue-600" : "bg-slate-100"}`} />)}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">{q.part} · Question {step + 1} of {list.length}</p>
          <Question key={q.id} q={q} a={answers} set={set} onNext={next} />
          {err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
          <div className="mt-6 flex items-center gap-3">
            <button onClick={back} className={btnLight}>Back</button>
            <button onClick={next} className={btnDark}>{step + 1 === list.length ? "Write my plan" : "Next"}</button>
            {q.optional && <button onClick={() => { set(q.id, ""); next(); }} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Skip</button>}
          </div>
        </div>
      )}

      {phase === "plan" && plan && (
        <PlanResult plan={plan} answers={answers} notify={notify} user={user} onGo={onGo}
          onEdit={() => { setStep(0); setPhase("questions"); }} onRestart={restart} />
      )}
    </section>
  );
}
