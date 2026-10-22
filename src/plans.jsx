import { useState } from "react";
import { Icon } from "./ui";
import { useBilling, openCheckout, saveSegment, PLANS, PLAN_NAME, TOPUP, COSTS } from "./billing.js";
import { track } from "./track.js";

/* Plans & credits: what each plan includes, what a credit buys, and the checkout. In AdDoctor's usual white design. */

const SEGMENTS = [["shop", "Shop owner"], ["freelancer", "Freelancer or marketer"], ["agency", "Agency"]];
const money = (n) => "$" + n.toLocaleString("en-US");
const date = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const TIERS = {
  free: { top: "from-white", border: "border border-slate-200", accent: "text-slate-400", box: "bg-slate-100/80 ring-slate-200/70" },
  starter: {
    top: "from-lime-200 via-lime-50 dark:from-[#4b5a0c] dark:via-[#1b2108]", border: "border border-[#8DB00E] shadow-lg shadow-lime-600/20 dark:border-[#A6C41C] dark:shadow-[#E3FD2B]/10", accent: "text-lime-700 dark:text-[#E3FD2B]",
    box: "bg-white/75 ring-lime-300 dark:bg-black/30 dark:ring-[#7d9418]/60",
    btn: "border-2 border-[#8DB00E] bg-transparent text-lime-900 hover:bg-lime-100 dark:border-[#A6C41C] dark:text-[#E3FD2B] dark:hover:bg-[#E3FD2B]/10 shadow-none", cta: "Get Starter",
    current: "border border-[#8DB00E] bg-lime-100 text-lime-900 dark:border-[#A6C41C] dark:bg-[#26300a] dark:text-[#E3FD2B]",
  },
  pro: {
    top: "from-pink-200 via-rose-50 dark:from-[#6a1243] dark:via-[#250a19]", border: "border-2 border-[#E0207F] shadow-xl shadow-pink-600/25 dark:border-[#F02D8E] dark:shadow-[#FF2F97]/15 lg:-translate-y-2 lg:scale-[1.02]", accent: "text-pink-600 dark:text-[#FF63B5]",
    box: "bg-white/75 ring-pink-200 dark:bg-black/30 dark:ring-[#a3205f]/60",
    btn: "bg-[#FF2F97] text-[#0b0a09] hover:bg-[#f0208a] shadow-pink-500/40 dark:shadow-[#FF2F97]/25", cta: "Get Pro",
    current: "border border-[#E0207F] bg-pink-100 text-pink-800 dark:border-[#F02D8E] dark:bg-[#3a0f27] dark:text-[#FF63B5]",
  },
  agency: {
    top: "from-blue-200 via-sky-50 dark:from-[#1f3fa6] dark:via-[#0f1b4a]", border: "border border-blue-300 shadow-lg shadow-blue-500/20 dark:border-[#3566f0] dark:shadow-[#2C5EF4]/20", accent: "text-blue-600 dark:text-[#7f9fff]",
    box: "bg-white/75 ring-blue-200 dark:bg-black/30 dark:ring-[#2c4cc4]/60",
    btn: "bg-[#2C5EF4] text-white hover:bg-[#2250e0] shadow-blue-600/40", cta: "Get For Teams",
    current: "border border-blue-300 bg-blue-50 text-blue-700 dark:border-[#3566f0] dark:bg-[#12205a] dark:text-[#9db6ff]",
  },
};
const PILL = { green: "bg-emerald-100 text-emerald-800", blue: "bg-blue-100 text-blue-700", slate: "bg-slate-200/80 text-slate-700" };
const FeatureRow = ({ label, pill, tone }) => (
  <li className="flex items-center justify-between gap-2"><span>{label}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PILL[tone]}`}>{pill}</span></li>
);

const BUYS = [
  ["Open a creative's breakdown", COSTS.breakdown],
  ["Ask a question about a brand's ads", COSTS.ask],
  ["Load a brand's best Instagram and TikTok posts", COSTS.organic],
  ["Make one ad image with your product", COSTS.image],
  ["A post for your 30-Day Drop (image)", COSTS.image],
  ["Best-quality image", COSTS.imagePremium],
  ["Analyze a competitor's ads (up to 1,000)", COSTS.analyze],
];

const GOALS = [["ads", "Static ads & 30-Day Drop posts"], ["spy", "Competitor analyses"], ["breakdown", "Creative breakdowns"], ["ask", "Questions about brands' ads"]];
const Slider = ({ label, hint, value, max, step = 1, onChange, tone = "#2563EB" }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2"><label className="text-[13px] font-semibold text-slate-900">{label}</label><span className="text-xs tabular-nums text-slate-500">{hint}</span></div>
    <input type="range" min="0" max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} aria-label={label}
      className={`mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full ${ring}`}
      style={{ accentColor: tone, background: `linear-gradient(to right, ${tone} ${(value / max) * 100}%, #e2e8f0 ${(value / max) * 100}%)` }} />
    <p className="mt-1 text-right text-sm font-bold tabular-nums text-slate-900">{value}<span className="ml-1 text-xs font-medium text-slate-500">/ mo</span></p>
  </div>
);

function PlanFinder({ yearly, user, acct, bill, busy, buy }) {
  const [goals, setGoals] = useState(["ads"]);
  const [n, setN] = useState({ ads: 60, spy: 2, breakdown: 30, ask: 10 });
  const [premium, setPremium] = useState(false);
  const [why, setWhy] = useState(false);
  const toggle = (g) => setGoals((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));
  const unit = { ads: premium ? COSTS.imagePremium : COSTS.image, spy: COSTS.analyze, breakdown: COSTS.breakdown, ask: COSTS.ask };
  const need = goals.reduce((t, g) => t + n[g] * unit[g], 0);
  const top = PLANS[PLANS.length - 1];
  const rec = need <= PLANS[0].credits ? PLANS[0] : PLANS.slice(1).find((p) => p.credits >= need) || top;
  const over = Math.max(0, need - rec.credits);
  const topups = Math.ceil(over / TOPUP.credits);
  const t = TIERS[rec.id];
  const paid = rec.id !== "free";
  const perMonth = yearly ? Math.round(rec.year / 12) : rec.month;
  const key = `${rec.id}_${yearly ? "year" : "month"}`;
  const current = acct && acct.plan === rec.id;
  const pct = Math.min(100, (need / rec.credits) * 100);
  return (
    <section aria-label="Find the best plan for you">
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Find the best plan for you</h2>
      <p className="mt-1 text-sm text-slate-500">Tell us what you make, and we'll pick the plan that fits.</p>
      <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-7 p-5 sm:p-7">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-xs text-white">1</span>What do you want to do?</h3>
            <p className="mt-1 text-xs text-slate-500">Multiple options can be selected</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {GOALS.map(([id, label]) => { const on = goals.includes(id); return (
                <button key={id} onClick={() => toggle(id)} aria-pressed={on} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${ring} ${on ? "border-[#2563EB] bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                  {label}<span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${on ? "bg-[#2563EB] text-white" : "border border-slate-300"}`}>{on && <Icon.Check className="h-3 w-3" />}</span>
                </button>); })}
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-xs text-white">2</span>How much per month?</h3>
            <div className="mt-4 space-y-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
              {goals.length === 0 && <p className="text-xs text-slate-500">Pick at least one thing above.</p>}
              {goals.includes("ads") && <Slider label="Static ads & posts" hint={`${unit.ads} credits each`} value={n.ads} max={500} step={5} onChange={(v) => setN({ ...n, ads: v })} />}
              {goals.includes("spy") && <Slider label="Competitor analyses" hint={`${COSTS.analyze} credits each`} value={n.spy} max={40} onChange={(v) => setN({ ...n, spy: v })} tone="#7C3AED" />}
              {goals.includes("breakdown") && <Slider label="Creative breakdowns" hint={`${COSTS.breakdown} credit each`} value={n.breakdown} max={300} step={5} onChange={(v) => setN({ ...n, breakdown: v })} tone="#F59E0B" />}
              {goals.includes("ask") && <Slider label="Questions about brands' ads" hint={`${COSTS.ask} credits each`} value={n.ask} max={100} onChange={(v) => setN({ ...n, ask: v })} tone="#10B981" />}
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-xs text-white">3</span>Quality</h3>
            <label className="mt-3 flex cursor-pointer items-center gap-3 text-xs font-semibold text-slate-700">
              <button role="switch" aria-checked={premium} onClick={() => setPremium(!premium)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${ring} ${premium ? "bg-[#2563EB]" : "bg-slate-300"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${premium ? "translate-x-5" : ""}`} /></button>
              Best-quality images <span className="font-normal text-slate-500">({COSTS.imagePremium} credits instead of {COSTS.image})</span>
            </label>
          </div>
        </div>

        <div className={`flex flex-col items-center justify-center bg-gradient-to-b ${t.top} to-white p-5 sm:p-7`}>
          <p className="text-sm font-semibold text-slate-600">We recommend the <span className="text-slate-950">{rec.name}</span> plan</p>
          <button onClick={() => setWhy(!why)} aria-expanded={why} className={`mt-2 rounded-full bg-white/80 px-3 py-1 text-xs font-bold ${t.accent} ring-1 ring-slate-200 ${ring}`}>See why</button>
          {why && <p className="mt-2 max-w-xs text-center text-xs leading-relaxed text-slate-600">You'd use about {need.toLocaleString("en-US")} credits a month. {rec.name} includes {rec.credits.toLocaleString("en-US")}{over > 0 ? `, and ${topups} top-up${topups === 1 ? "" : "s"} of ${TOPUP.credits} (${money(topups * TOPUP.price)}) covers the rest.` : ", so you're covered."}</p>}
          <div className={`mt-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ${t.border.includes("border-2") ? "border-2 border-[#E0207F] dark:border-[#F02D8E]" : "border border-slate-200"}`}>
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-slate-950">{rec.name}{paid && yearly && <span className="ml-2 align-middle rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">17% off</span>}</h3>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-slate-900"><Icon.Sparkle className={`h-4 w-4 ${t.accent}`} />{rec.credits.toLocaleString("en-US")} credits / mo</p>
            <div className="mt-3 flex items-baseline justify-between text-xs"><span className="text-slate-500">Expected monthly usage</span><span className={`font-bold tabular-nums ${over > 0 ? "text-rose-600" : "text-emerald-600"}`}>{need.toLocaleString("en-US")}/{rec.credits.toLocaleString("en-US")} credits</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${over > 0 ? "bg-rose-500" : "bg-emerald-500"} transition-all`} style={{ width: `${pct}%` }} /></div>
            <p className="mt-4 flex items-baseline gap-2 text-3xl font-extrabold tracking-tight text-slate-950">
              {yearly && paid && <span className="text-base font-semibold text-red-500 line-through">{money(rec.month)}</span>}{money(perMonth)}<span className="text-sm font-medium text-slate-500">/month{yearly && paid ? ", billed annually" : ""}</span>
            </p>
            {rec.id === "free" ? <button disabled className="mt-3 h-11 w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-400">Included with an account</button>
              : current ? <button disabled className={`mt-3 h-11 w-full rounded-xl text-sm font-bold ${t.current}`}>Your plan</button>
              : <button onClick={() => buy(key)} disabled={busy === key || !bill.on} className={`mt-3 h-11 w-full rounded-xl text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${ring} ${t.btn}`}>{busy === key ? "Opening…" : user ? t.cta : "Sign in to choose"}</button>}
            {paid && <p className="mt-2 text-center text-[11px] text-slate-500">{yearly ? `Save ${money(rec.month * 12 - rec.year)}/year compared to monthly` : "Flexible monthly billing"}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PlansView({ user, onSignIn, notify }) {
  const bill = useBilling(user);
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState("");
  const acct = bill.account;

  const buy = async (key) => {
    if (!user) { onSignIn(); return; }
    setBusy(key);
    try { await openCheckout(key, user, notify); track("checkout_open", { item: key }); }
    catch (e) { notify(e.message || "Couldn't open the checkout. Try again.", 4200); }
    setBusy("");
  };
  const chooseSegment = async (id) => { try { await saveSegment(id); } catch (e) { notify("Couldn't save that. Try again."); } };

  if (bill.ready && !bill.on) {
    return <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">Plans are not open yet. Everything you see in AdDoctor is free to try for now.</p>;
  }

  return (
    <div className="mt-6 space-y-8">
      {/* Where you stand */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Your account">
        {!user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Sign in to get your <span className="font-semibold text-slate-900">25 free credits</span> every month, and to buy a plan.</p>
            <button onClick={onSignIn} className={`rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 ${ring}`}>Sign in</button>
          </div>
        ) : !acct ? (
          <p className="text-sm text-slate-500" role="status">Loading your balance…</p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Your plan</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{PLAN_NAME[acct.plan] || acct.plan}
                {acct.status === "canceled" && <span className="ml-2 align-middle text-xs font-semibold text-amber-700">ends {date(acct.periodEnd)}</span>}
                {acct.status === "past_due" && <span className="ml-2 align-middle text-xs font-semibold text-rose-700">payment failed</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{acct.total}<span className="ml-1 text-sm font-medium text-slate-500">credits</span></p>
              <p className="text-xs text-slate-500">{acct.planCredits} from your plan{acct.extraCredits > 0 ? ` · ${acct.extraCredits} from top-ups` : ""}{acct.refillAt ? ` · plan credits renew ${date(acct.refillAt)}` : ""}</p>
            </div>
          </div>
        )}
        {user && acct && !acct.segment && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700">Which describes you best? <span className="font-normal text-slate-500">It helps us decide what to build next.</span></p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEGMENTS.map(([id, label]) => <button key={id} onClick={() => chooseSegment(id)} className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 ${ring}`}>{label}</button>)}
            </div>
          </div>
        )}
      </section>

      {/* Plans */}
      <section aria-label="Plans">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Choose a plan</h2>
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm" role="group" aria-label="Billing period">
            <span className={`text-xs font-semibold ${yearly ? "text-slate-500" : "text-slate-900"}`}>Monthly</span>
            <button role="switch" aria-checked={yearly} aria-label="Annual billing" onClick={() => setYearly(!yearly)} className={`relative h-6 w-11 rounded-full transition ${ring} ${yearly ? "bg-[#2563EB]" : "bg-slate-300"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${yearly ? "translate-x-5" : ""}`} /></button>
            <span className={`text-xs font-semibold ${yearly ? "text-slate-900" : "text-slate-500"}`}>Annual</span>
            <span className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">17% off</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const t = TIERS[p.id];
            const current = acct && acct.plan === p.id;
            const paid = p.id !== "free";
            const perMonth = yearly ? Math.round(p.year / 12) : p.month;
            const saved = p.month * 12 - p.year;
            const key = `${p.id}_${yearly ? "year" : "month"}`;
            const ads = Math.floor(p.credits / COSTS.image);
            const runs = Math.floor(p.credits / COSTS.analyze);
            return (
              <article key={p.id} className={`flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b ${t.top} to-white to-45% p-5 shadow-sm ${t.border}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-lg font-extrabold uppercase tracking-tight text-slate-950">{p.name}</h3>
                    {paid && yearly && <span className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">17% off</span>}
                  </div>
                  {p.popular ? <span className="shrink-0 rounded-full bg-[#FF2F97] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0b0a09] shadow-sm">Most popular</span>
                    : p.id === "agency" ? <span className="shrink-0 rounded-full bg-[#2C5EF4] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Best value</span> : null}
                </div>
                <p className="mt-1 min-h-[2.5rem] text-xs leading-snug text-slate-500">{p.who}</p>

                <div className={`mt-3 rounded-xl ${t.box} p-3 ring-1`}>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Icon.Sparkle className={`h-4 w-4 ${t.accent}`} />{p.credits.toLocaleString("en-US")} credits / mo</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li>≈ {ads} static ads</li>
                    <li>≈ {runs} competitor {runs === 1 ? "analysis" : "analyses"}</li>
                  </ul>
                  {paid && p.id !== "starter" && <p className={`mt-2 text-[11px] font-bold ${t.accent}`}>{+(p.credits / PLANS[1].credits).toFixed(1)}× Starter's credits</p>}
                </div>

                <div className="mt-4 min-h-[3.25rem]">
                  {yearly && paid && <p className="text-sm font-semibold text-red-500 line-through decoration-red-500/70">{money(p.month)}</p>}
                  <p className="flex items-baseline gap-1 text-4xl font-extrabold tracking-tight text-slate-950">{money(perMonth)}<span className="text-sm font-medium text-slate-500">/month</span></p>
                  {yearly && paid && <p className="text-[11px] text-slate-500">per month, billed annually</p>}
                </div>

                <div className="mt-3">
                  {p.id === "free" ? (
                    <button disabled className="h-11 w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-400">{current ? "Current" : "Included"}</button>
                  ) : current ? (
                    <button disabled className={`h-11 w-full rounded-xl text-sm font-bold ${t.current}`}>Your plan</button>
                  ) : (
                    <button onClick={() => buy(key)} disabled={busy === key || !bill.on} className={`h-11 w-full rounded-xl text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${ring} ${t.btn}`}>{busy === key ? "Opening…" : user ? t.cta : "Sign in to choose"}</button>
                  )}
                  <p className="mt-2 text-center text-[11px] text-slate-500">{!paid ? "No card needed" : yearly ? `Save ${money(saved)}/year compared to monthly` : "Flexible monthly billing"}</p>
                </div>

                <div className="mt-4 border-t border-slate-200/80 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">What's included</p>
                  <ul className="mt-2 space-y-2 text-[13px] text-slate-700">
                    <FeatureRow label="Examine your own ads" pill="Unlimited free" tone="green" />
                    <FeatureRow label="Team seats" pill={`${p.seats} ${p.seats === 1 ? "seat" : "seats"}`} tone="slate" />
                    <FeatureRow label="30-Day Drop access" pill="Included" tone="blue" />
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">Prices are in US dollars. Taxes such as VAT are added at checkout where they apply. Paddle is the seller of record and handles the payment. You can cancel any time from the link in your receipt, and your plan keeps working until the period you paid for ends.</p>
      </section>

      <PlanFinder yearly={yearly} user={user} acct={acct} bill={bill} busy={busy} buy={buy} />

      {/* Top-up + what credits buy */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Credits">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Need more? Top up</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{TOPUP.credits} extra credits for {money(TOPUP.price)}, once. They are used after your plan credits, and last 12 months.</p>
          <button onClick={() => buy("topup")} disabled={busy === "topup" || !bill.on} className={`mt-4 h-11 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${ring}`}>{busy === "topup" ? "Opening…" : user ? `Buy ${TOPUP.credits} credits · ${money(TOPUP.price)}` : "Sign in to top up"}</button>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">What a credit buys</h3>
          <dl className="mt-3 divide-y divide-slate-100 text-[13px]">
            {BUYS.map(([what, n]) => (
              <div key={what} className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-slate-600">{what}</dt><dd className="shrink-0 font-semibold tabular-nums text-slate-900">{n} {n === 1 ? "credit" : "credits"}</dd></div>
            ))}
            <div className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-slate-600">Examine your own ad, brand search</dt><dd className="shrink-0 font-semibold text-emerald-700">Free</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">If an action fails, the credits come back automatically.</p>
        </article>
      </section>

      <p className="text-xs text-slate-500">
        <a href="./terms/" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Terms</a> · <a href="./refunds/" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Refunds</a> · <a href="./privacy.html" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Privacy</a>
      </p>
    </div>
  );
}

export { PlansView };
