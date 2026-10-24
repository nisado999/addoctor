import { useRef, useState } from "react";
import { Icon } from "./ui";
import { useBilling, openCheckout, saveSegment, PLANS, PLAN_NAME, PRO_PLANS, PRO_FEATURE, TOPUP, COSTS } from "./billing.js";
import { useDialog } from "./dialog.jsx";
import { track } from "./track.js";

/* Plans & credits: what each plan includes, what a credit buys, and the checkout. The page is built to sell yearly
   Pro: yearly is the default view, Starter is monthly only, Pro is the only plan with a yearly bonus, and the
   Pro-only features are shown as missing on the cheaper plans. */

const SEGMENTS = [["shop", "Shop owner"], ["freelancer", "Freelancer or marketer"], ["agency", "Agency"]];
const money = (n) => "$" + n.toLocaleString("en-US");
const cents = (n) => (n < 1 ? Math.round(n * 100) + "¢" : "$" + n.toFixed(2));
const date = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

const yearOf = (p, yearly) => yearly && p.year > 0;
const perMonth = (p, yearly) => (yearOf(p, yearly) ? Math.round(p.year / 12) : p.month);
const keyOf = (p, yearly) => `${p.id}_${yearOf(p, yearly) ? "year" : "month"}`;
const adsOf = (p) => Math.floor(p.credits / COSTS.image);
const saveOf = (p) => p.month * 12 - p.year;
const pctOf = (p) => Math.round((saveOf(p) / (p.month * 12)) * 100);
const isProPlan = (p) => PRO_PLANS.includes(p.id);
const PRO = PLANS.find((p) => p.id === "pro");
const BEST_PCT = Math.max(...PLANS.filter((p) => p.year > 0).map(pctOf));

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

// What each card adds over the plan before it.
const ADDS = {
  free: { head: "Includes", items: ["Examine your own ads, unlimited", "Meta competitor ads", "Idea Engine, templates, 30-Day Drop"] },
  starter: { head: "Everything in Free, plus", items: [`${PLANS[1].credits / PLANS[0].credits}× the credits`, "Top-ups when you run out"] },
  pro: { head: "Everything in Starter, plus", items: [PRO_FEATURE.platforms, PRO_FEATURE.pptx, PRO_FEATURE.premium, `${PRO.credits / PLANS[1].credits}× Starter's credits`] },
  agency: { head: "Everything in Pro, plus", items: [`${+(PLANS[3].credits / PRO.credits).toFixed(1)}× Pro's credits`, "Team seats (coming soon)"] },
};

const ROWS = [
  ["Credits every month", (p) => p.credits.toLocaleString("en-US")],
  ["Ads you can make, about", (p) => adsOf(p).toLocaleString("en-US")],
  ["Competitor analyses, about", (p) => Math.floor(p.credits / COSTS.analyze)],
  ["Examine your own ads", () => "Unlimited"],
  ["Idea Engine, templates, 30-Day Drop", () => true],
  ["Meta competitor ads", () => true],
  [PRO_FEATURE.platforms, isProPlan],
  [PRO_FEATURE.pptx, isProPlan],
  [PRO_FEATURE.premium, isProPlan],
  ["Top-ups", (p) => p.id !== "free"],
  ["Bonus credits each year", (p) => (p.bonus ? "+" + p.bonus.toLocaleString("en-US") : false)],
  ["Team seats", (p) => (p.id === "agency" ? "Coming soon" : false)],
];

const BUYS = [
  ["Open a creative's breakdown", COSTS.breakdown],
  ["Ask a question about a brand's ads", COSTS.ask],
  ["Load a brand's best Instagram and TikTok posts", COSTS.organic],
  ["Make one ad image with your product", COSTS.image],
  ["A post for your 30-Day Drop (image)", COSTS.image],
  ["Best-quality image (Pro)", COSTS.imagePremium],
  ["Analyze a competitor's ads (up to 1,000)", COSTS.analyze],
];

const FAQ = [
  ["What is a credit?", `Each action uses a few credits: an ad image uses ${COSTS.image}, a competitor analysis ${COSTS.analyze}, a creative breakdown ${COSTS.breakdown}. Examining your own ads and searching for a brand are free. If an action fails, its credits come back automatically.`],
  ["Why is yearly Pro the better deal?", `You pay ${money(PRO.year)} instead of ${money(PRO.month * 12)} (you save ${money(saveOf(PRO))}), and every yearly payment adds ${PRO.bonus.toLocaleString("en-US")} bonus credits, about ${Math.floor(PRO.bonus / COSTS.image)} more ads. That works out to about ${cents(perMonth(PRO, true) / adsOf(PRO))} an ad.`],
  ["Do unused credits carry over?", "Plan credits renew every month and do not carry over. Top-up and bonus credits last 12 months and are used after your plan credits."],
  ["Why is Starter monthly only?", "Starter is for trying AdDoctor on one shop. If you already know you'll use it all year, Pro yearly costs less per ad and has every feature."],
  ["Can I cancel?", "Any time, from the link in your Paddle receipt. Your plan keeps working until the end of the period you paid for."],
  ["Can I get a refund?", "Within 14 days of your first payment, if you've used fewer than 10% of its credits. The Refunds page has the details."],
  ["Who handles the payment?", "Paddle is the seller of record. Prices are in US dollars, and taxes such as VAT are added at checkout where they apply."],
];

function Price({ p, yearly, big = true }) {
  const paid = p.id !== "free";
  const y = yearOf(p, yearly);
  return (
    <div>
      {y && <p className="text-sm font-semibold text-red-500 line-through decoration-red-500/70">{money(p.month)}</p>}
      <p className={`flex items-baseline gap-1 font-extrabold tracking-tight text-slate-950 ${big ? "text-4xl" : "text-3xl"}`}>{money(perMonth(p, yearly))}<span className="text-sm font-medium text-slate-500">/month</span></p>
      <p className="mt-0.5 text-[11px] text-slate-500">{!paid ? "Free, no card needed" : y ? `${money(p.year)} billed yearly · save ${money(saveOf(p))}` : yearly ? "Monthly only" : "Billed monthly"}</p>
    </div>
  );
}

function BuyButton({ p, yearly, acct, user, busy, bill, onBuy, className = "" }) {
  const t = TIERS[p.id];
  const key = keyOf(p, yearly);
  if (p.id === "free") return <button disabled className={`h-11 w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-400 ${className}`}>{acct && acct.plan === "free" ? "Your plan" : "Included with an account"}</button>;
  if (acct && acct.plan === p.id && (!acct.interval || acct.interval === (yearOf(p, yearly) ? "year" : "month"))) return <button disabled className={`h-11 w-full rounded-xl text-sm font-bold ${t.current} ${className}`}>Your plan</button>;
  return (
    <button onClick={() => onBuy(key)} disabled={busy === key || !bill.on} className={`h-11 w-full rounded-xl text-sm font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${ring} ${t.btn} ${className}`}>
      {busy === key ? "Opening…" : !user ? "Sign in to choose" : yearOf(p, yearly) ? `${t.cta} yearly` : t.cta}
    </button>
  );
}

function PlanCard(props) {
  const { p, yearly } = props;
  const t = TIERS[p.id];
  const paid = p.id !== "free";
  const y = yearOf(p, yearly);
  const adds = ADDS[p.id];
  return (
    // One or two columns (phones, tablets): the recommended plan comes first instead of third.
    <article className={`flex flex-col overflow-hidden rounded-2xl bg-gradient-to-b ${t.top} to-white to-45% p-5 shadow-sm ${t.border} ${p.popular ? "max-xl:order-first" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-lg font-extrabold uppercase tracking-tight text-slate-950">{p.name}</h3>
          {y && <span className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Save {pctOf(p)}%</span>}
        </div>
        {p.popular && <span className="shrink-0 rounded-full bg-[#FF2F97] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0b0a09] shadow-sm">Most popular</span>}
      </div>
      <p className="mt-1 min-h-[2.5rem] text-xs leading-snug text-slate-500">{p.who}</p>

      <div className="mt-3 min-h-[4.75rem]"><Price p={p} yearly={yearly} /></div>

      {p.bonus && (
        <p className={`mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold ${y ? "bg-[#FF2F97] text-[#0b0a09]" : "bg-white/70 text-pink-700 ring-1 ring-pink-200"}`}>
          <Icon.Sparkle className="h-3.5 w-3.5 shrink-0" />{y ? `+${p.bonus.toLocaleString("en-US")} bonus credits included` : `Yearly adds ${p.bonus.toLocaleString("en-US")} bonus credits`}
        </p>
      )}

      <div className={`mt-3 rounded-xl ${t.box} p-3 ring-1`}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Icon.Sparkle className={`h-4 w-4 ${t.accent}`} />{p.credits.toLocaleString("en-US")} credits / mo</p>
        <p className="mt-1.5 text-xs text-slate-600">≈ {adsOf(p)} ads a month{paid && <> · <span className="font-semibold text-slate-800">{cents(perMonth(p, yearly) / adsOf(p))} an ad</span></>}</p>
      </div>

      <div className="mt-4">
        <BuyButton {...props} />
        <p className="mt-2 text-center text-[11px] text-slate-500">{paid ? "14-day refund if you've used under 10%" : "No card needed"}</p>
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{adds.head}</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700">
          {adds.items.map((x) => <li key={x} className="flex gap-2"><Icon.Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${t.accent}`} />{x}</li>)}
        </ul>
      </div>
    </article>
  );
}

function Compare({ yearly }) {
  const cell = (v) => v === true ? <Icon.Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Included" />
    : v === false ? <span className="text-slate-300" aria-label="Not included">—</span>
    : <span className="font-semibold tabular-nums text-slate-900">{v}</span>;
  return (
    <section aria-label="Compare plans">
      <h2 className="text-base font-semibold text-slate-900">Compare plans</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500" scope="col"><span className="sr-only">Feature</span></th>
              {PLANS.map((p) => (
                <th key={p.id} scope="col" className={`px-3 py-3 text-center ${p.popular ? "bg-pink-50/70 dark:bg-[#250a19]" : ""}`}>
                  <span className="block text-sm font-extrabold uppercase tracking-tight text-slate-950">{p.name}</span>
                  <span className="text-xs font-medium text-slate-500">{money(perMonth(p, yearly))}/mo</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, f]) => (
              <tr key={label} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-600">{label}</th>
                {PLANS.map((p) => <td key={p.id} className={`px-3 py-2.5 text-center ${p.popular ? "bg-pink-50/70 dark:bg-[#250a19]" : ""}`}>{cell(f(p))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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

function PlanFinder({ yearly, ...buy }) {
  const [goals, setGoals] = useState(["ads"]);
  const [n, setN] = useState({ ads: 40, spy: 2, breakdown: 30, ask: 10 });
  const [premium, setPremium] = useState(false);
  const toggle = (g) => setGoals((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));
  const unit = { ads: premium ? COSTS.imagePremium : COSTS.image, spy: COSTS.analyze, breakdown: COSTS.breakdown, ask: COSTS.ask };
  const need = goals.reduce((t, g) => t + n[g] * unit[g], 0);
  const top = PLANS[PLANS.length - 1];
  // Best-quality images are Pro-only, so asking for them starts the search at Pro.
  const from = premium ? PLANS.findIndex(isProPlan) : 1;
  const rec = need <= PLANS[0].credits && !premium ? PLANS[0] : PLANS.slice(from).find((p) => p.credits >= need) || top;
  const over = Math.max(0, need - rec.credits);
  const topups = Math.ceil(over / TOPUP.credits);
  const t = TIERS[rec.id];
  const pct = Math.min(100, (need / rec.credits) * 100);
  return (
    <section aria-label="Find the best plan for you">
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Find the best plan for you</h2>
      <p className="mt-1 text-sm text-slate-500">Tell us what you make, and we'll pick the plan that fits.</p>
      <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-7 p-5 sm:p-7">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-xs text-white">1</span>What do you want to do?</h3>
            <p className="mt-1 text-xs text-slate-500">Pick as many as you like</p>
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
              <button role="switch" aria-checked={premium} aria-label="Best-quality images" onClick={() => setPremium(!premium)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${ring} ${premium ? "bg-[#2563EB]" : "bg-slate-300"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${premium ? "translate-x-5" : ""}`} /></button>
              Best-quality images <span className="font-normal text-slate-500">(Pro, {COSTS.imagePremium} credits instead of {COSTS.image})</span>
            </label>
          </div>
        </div>

        <div className={`flex flex-col items-center justify-center bg-gradient-to-b ${t.top} to-white p-5 sm:p-7`}>
          <p className="text-sm font-semibold text-slate-600">We recommend <span className="text-slate-950">{rec.name}</span></p>
          <p className="mt-2 max-w-xs text-center text-xs leading-relaxed text-slate-600">You'd use about {need.toLocaleString("en-US")} credits a month. {rec.name} includes {rec.credits.toLocaleString("en-US")}{over > 0 ? `, and ${topups} top-up${topups === 1 ? "" : "s"} of ${TOPUP.credits} (${money(topups * TOPUP.price)}) covers the rest.` : ", so you're covered."}</p>
          <div className={`mt-4 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ${rec.popular ? "border-2 border-[#E0207F] dark:border-[#F02D8E]" : "border border-slate-200"}`}>
            <h3 className="text-lg font-extrabold uppercase tracking-tight text-slate-950">{rec.name}{yearOf(rec, yearly) && <span className="ml-2 align-middle rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Save {pctOf(rec)}%</span>}</h3>
            <div className="mt-3 flex items-baseline justify-between text-xs"><span className="text-slate-500">Expected monthly usage</span><span className={`font-bold tabular-nums ${over > 0 ? "text-rose-600" : "text-emerald-600"}`}>{need.toLocaleString("en-US")}/{rec.credits.toLocaleString("en-US")} credits</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${over > 0 ? "bg-rose-500" : "bg-emerald-500"} transition-all`} style={{ width: `${pct}%` }} /></div>
            <div className="mt-4"><Price p={rec} yearly={yearly} big={false} /></div>
            <BuyButton p={rec} yearly={yearly} {...buy} className="mt-3" />
          </div>
        </div>
      </div>
    </section>
  );
}

function YearToggle({ yearly, setYearly }) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm" role="group" aria-label="Billing period">
      <span className={`text-xs font-semibold ${yearly ? "text-slate-500" : "text-slate-900"}`}>Monthly</span>
      <button role="switch" aria-checked={yearly} aria-label="Yearly billing" onClick={() => setYearly(!yearly)} className={`relative h-6 w-11 rounded-full transition ${ring} ${yearly ? "bg-[#2563EB]" : "bg-slate-300"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${yearly ? "translate-x-5" : ""}`} /></button>
      <span className={`text-xs font-semibold ${yearly ? "text-slate-900" : "text-slate-500"}`}>Yearly</span>
      <span className="rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">Save {BEST_PCT}% + bonus</span>
    </div>
  );
}

export default function PlansView({ user, onSignIn, notify }) {
  const bill = useBilling(user);
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState("");
  const acct = bill.account;
  const paidPlan = acct && acct.plan !== "free";

  const onBuy = async (key) => {
    if (!user) { onSignIn(); return; }
    setBusy(key);
    try { await openCheckout(key, user, notify); track("checkout_open", { item: key }); }
    catch (e) { notify(e.message || "Couldn't open the checkout. Try again.", 4200); }
    setBusy("");
  };
  const chooseSegment = async (id) => { try { await saveSegment(id); } catch (e) { notify("Couldn't save that. Try again."); } };
  const buy = { acct, user, busy, bill, onBuy };

  if (bill.ready && !bill.on) {
    return <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">Plans are not open yet. Everything you see in AdDoctor is free to try for now.</p>;
  }

  return (
    <div className="mt-6 space-y-10">
      {/* Where you stand */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Your account">
        {!user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Sign in to get your <span className="font-semibold text-slate-900">{PLANS[0].credits} free credits</span> every month, and to buy a plan.</p>
            <button onClick={onSignIn} className={`rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 ${ring}`}>Sign in</button>
          </div>
        ) : !acct ? (
          <p className="text-sm text-slate-500" role="status">Loading your balance…</p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Your plan</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{PLAN_NAME[acct.plan] || acct.plan}{acct.interval === "year" ? " yearly" : ""}
                {acct.status === "canceled" && <span className="ml-2 align-middle text-xs font-semibold text-amber-700">ends {date(acct.periodEnd)}</span>}
                {acct.status === "past_due" && <span className="ml-2 align-middle text-xs font-semibold text-rose-700">payment failed</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums text-slate-900">{acct.total}<span className="ml-1 text-sm font-medium text-slate-500">credits</span></p>
              <p className="text-xs text-slate-500">{acct.planCredits} from your plan{acct.extraCredits > 0 ? ` · ${acct.extraCredits} from top-ups and bonuses` : ""}{acct.refillAt ? ` · plan credits renew ${date(acct.refillAt)}` : ""}</p>
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
          <div>
            <h2 className="text-base font-semibold text-slate-900">Choose a plan</h2>
            <p className="text-xs text-slate-500">Yearly Pro: {money(perMonth(PRO, true))} a month, {PRO.bonus.toLocaleString("en-US")} bonus credits, every feature.</p>
          </div>
          <YearToggle yearly={yearly} setYearly={setYearly} />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => <PlanCard key={p.id} p={p} yearly={yearly} {...buy} />)}
        </div>
      </section>

      <Compare yearly={yearly} />

      <PlanFinder yearly={yearly} {...buy} />

      {/* Top-up + what credits buy */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Credits">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Need more? Top up</h3>
          {/* shortcut: top-ups are held back from Free here only; the webhook still credits a top-up bought some other way. Gate it in the Worker if that ever happens. */}
          {paidPlan ? (
            <>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{TOPUP.credits} extra credits for {money(TOPUP.price)}, once. They are used after your plan credits, and last 12 months.</p>
              <button onClick={() => onBuy("topup")} disabled={busy === "topup" || !bill.on} className={`mt-4 h-11 rounded-xl bg-[#2563EB] px-5 text-sm font-bold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 ${ring}`}>{busy === "topup" ? "Opening…" : `Buy ${TOPUP.credits} credits · ${money(TOPUP.price)}`}</button>
            </>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">Top-ups are for Starter, Pro and For Teams: {TOPUP.credits} extra credits for {money(TOPUP.price)} whenever you run out. Yearly Pro already gives you {PRO.credits} a month plus {PRO.bonus.toLocaleString("en-US")} bonus credits.</p>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">What a credit buys</h3>
          <dl className="mt-3 divide-y divide-slate-100 text-[13px]">
            {BUYS.map(([what, n]) => (
              <div key={what} className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-slate-600">{what}</dt><dd className="shrink-0 font-semibold tabular-nums text-slate-900">{n} {n === 1 ? "credit" : "credits"}</dd></div>
            ))}
            <div className="flex items-baseline justify-between gap-3 py-1.5"><dt className="text-slate-600">Examine your own ad, brand search, Idea Engine</dt><dd className="shrink-0 font-semibold text-emerald-700">Free</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">If an action fails, the credits come back automatically.</p>
        </article>
      </section>

      <section aria-label="Questions about plans">
        <h2 className="text-base font-semibold text-slate-900">Questions</h2>
        <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-3.5">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-semibold text-slate-900 ${ring}`}>{q}<Icon.Plus className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-45" /></summary>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        <a href="./terms/" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Terms</a> · <a href="./refunds/" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Refunds</a> · <a href="./privacy.html" className={`rounded font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Privacy</a>
      </p>
    </div>
  );
}

/* The moment a visitor hits a wall (no credits left, or a Pro-only feature): one dialog that leads with yearly Pro,
   offers monthly Pro, and a top-up only to people already on a paid plan. It opens over whatever is on screen, so
   work in an open dialog is kept. Opened by askUpgrade() in billing.js. */
function UpgradeModal({ reason, feature, user, onSignIn, onPlans, onClose, notify }) {
  const panelRef = useRef(null);
  const { overlayProps, requestClose } = useDialog({ onClose, panelRef });
  const bill = useBilling(user);
  const [busy, setBusy] = useState("");
  const acct = bill.account;
  const onPro = acct && PRO_PLANS.includes(acct.plan);
  const paidPlan = acct && acct.plan !== "free";
  const pro = reason === "pro_only";
  const name = PRO_FEATURE[feature] || "This feature";
  const title = pro ? `${name} ${/s$/.test(name) ? "are" : "is"} on Pro` : "You're out of credits";
  const go = async (key) => {
    if (!user) { onClose(); onSignIn(); return; }
    setBusy(key);
    try { await openCheckout(key, user, notify); track("checkout_open", { item: key, from: reason }); onClose(); }
    catch (e) { notify(e.message || "Couldn't open the checkout. Try again.", 4200); }
    setBusy("");
  };
  const btn = `inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${ring}`;
  return (
    <div className="dlg-veil fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" {...overlayProps}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="upgrade-title" className="dlg-panel w-full max-w-md overflow-hidden rounded-t-[28px] sm:rounded-[28px]">
        <div className="dlg-head flex items-start gap-3 px-6 pb-4 pt-6">
          <span className="dlg-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon.Sparkle className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="upgrade-title" className="text-lg font-extrabold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{pro ? `Pro unlocks it, with every other feature and ${PRO.credits / PLANS[1].credits}× Starter's credits.` : onPro ? "Top up to keep going, or wait for your credits to renew." : `Pro gives you ${PRO.credits} credits a month, about ${adsOf(PRO)} ads.`}</p>
          </div>
          <button onClick={requestClose} aria-label="Close" className={`dlg-close grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 ${ring}`}><Icon.Close className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-6 pb-6 pt-4">
          {!onPro && (
            <div className="rounded-2xl border-2 border-[#E0207F] bg-gradient-to-b from-pink-100 via-rose-50 to-white p-4 dark:border-[#F02D8E] dark:from-[#3a0f27] dark:via-[#250a19] dark:to-[#151412]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-extrabold uppercase tracking-tight text-slate-950">Pro yearly <span className="ml-1 rounded-md bg-gradient-to-r from-rose-500 to-pink-500 px-1.5 py-0.5 align-middle text-[10px] text-white">Save {pctOf(PRO)}%</span></p>
                <p className="text-2xl font-extrabold tracking-tight text-slate-950">{money(perMonth(PRO, true))}<span className="text-xs font-medium text-slate-500">/mo</span></p>
              </div>
              <ul className="mt-2 space-y-1 text-[12.5px] text-slate-700">
                <li className="flex gap-2"><Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-600" />{PRO.credits} credits a month (≈ {adsOf(PRO)} ads) + {PRO.bonus.toLocaleString("en-US")} bonus credits now</li>
                <li className="flex gap-2"><Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-600" />{PRO_FEATURE.platforms}, {PRO_FEATURE.pptx}, {PRO_FEATURE.premium.toLowerCase()}</li>
                <li className="flex gap-2"><Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-600" />{money(PRO.year)} billed yearly · 14-day refund if you've used under 10%</li>
              </ul>
              <button onClick={() => go("pro_year")} disabled={busy === "pro_year" || !bill.on} className={`${btn} mt-3 bg-[#FF2F97] text-[#0b0a09] shadow-lg shadow-pink-500/40 hover:bg-[#f0208a]`}>{busy === "pro_year" ? "Opening…" : user ? "Get Pro yearly" : "Sign in to get Pro"}</button>
              <button onClick={() => go("pro_month")} disabled={busy === "pro_month" || !bill.on} className={`mt-2 w-full rounded text-center text-xs font-semibold text-slate-600 hover:text-slate-900 ${ring}`}>{busy === "pro_month" ? "Opening…" : `or ${money(PRO.month)} monthly`}</button>
            </div>
          )}
          {!pro && paidPlan && (
            <button onClick={() => go("topup")} disabled={busy === "topup" || !bill.on} className={`${btn} border border-slate-200 bg-white text-slate-800 hover:border-slate-300`}>{busy === "topup" ? "Opening…" : `Top up ${TOPUP.credits} credits · ${money(TOPUP.price)}`}</button>
          )}
          <button onClick={() => { onClose(); onPlans(); }} className={`w-full rounded text-center text-xs font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>Compare all plans</button>
        </div>
      </div>
    </div>
  );
}

export { PlansView, UpgradeModal };
