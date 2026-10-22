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
  free: { top: "from-white", border: "border border-slate-200", accent: "text-slate-400" },
  starter: { top: "from-slate-100", border: "border border-slate-200", accent: "text-slate-600", btn: "bg-[#09090B] hover:bg-zinc-800", cta: "Get Starter", current: "border border-slate-300 bg-slate-100 text-slate-600" },
  pro: { top: "from-blue-100", border: "border-2 border-[#2563EB] shadow-blue-600/10", accent: "text-blue-600", btn: "bg-[#2563EB] hover:bg-blue-700", cta: "Get Pro", current: "border border-[#2563EB] bg-blue-50 text-blue-700" },
  agency: { top: "from-indigo-50", border: "border border-indigo-100", accent: "text-indigo-600", btn: "bg-[#4F46E5] hover:bg-indigo-700", cta: "Choose Agency", current: "border border-indigo-300 bg-indigo-50 text-indigo-700" },
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

export default function PlansView({ user, onSignIn, notify }) {
  const bill = useBilling(user);
  const [yearly, setYearly] = useState(false);
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
          <div className="inline-flex rounded-full bg-slate-100 p-1" role="group" aria-label="Billing period">
            {[[false, "Monthly"], [true, "Yearly · 2 months free"]].map(([y, l]) => (
              <button key={String(y)} onClick={() => setYearly(y)} aria-pressed={yearly === y} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${ring} ${yearly === y ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}{y && <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[10px] font-bold uppercase text-white">Save 17%</span>}</button>
            ))}
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
                  <h3 className="text-base font-extrabold uppercase tracking-tight text-slate-950">{p.name}</h3>
                  {p.popular ? <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Most popular</span>
                    : paid && yearly ? <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Save 17%</span> : null}
                </div>
                {p.popular && paid && yearly && <span className="mt-1 self-start rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Save 17% · 2 months free</span>}
                <p className="mt-1 min-h-[2.5rem] text-xs leading-snug text-slate-500">{p.who}</p>

                <div className="mt-3 rounded-xl bg-slate-100/80 p-3 ring-1 ring-slate-200/70">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Icon.Sparkle className={`h-4 w-4 ${t.accent}`} />{p.credits.toLocaleString("en-US")} credits / mo</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li>≈ {ads} static ads</li>
                    <li>≈ {runs} competitor {runs === 1 ? "analysis" : "analyses"}</li>
                  </ul>
                </div>

                <div className="mt-4 min-h-[3.25rem]">
                  {yearly && paid && <p className="text-sm font-semibold text-red-500 line-through decoration-red-500/70">{money(p.month)}</p>}
                  <p className="flex items-baseline gap-1 text-4xl font-extrabold tracking-tight text-slate-950">{money(perMonth)}<span className="text-sm font-medium text-slate-500">/month</span></p>
                  {yearly && paid && <p className="text-[11px] text-slate-500">billed annually</p>}
                </div>

                <div className="mt-3">
                  {p.id === "free" ? (
                    <button disabled className="h-11 w-full rounded-xl bg-slate-100 text-sm font-bold text-slate-400">{current ? "Current" : "Included"}</button>
                  ) : current ? (
                    <button disabled className={`h-11 w-full rounded-xl text-sm font-bold ${t.current}`}>Your plan</button>
                  ) : (
                    <button onClick={() => buy(key)} disabled={busy === key || !bill.on} className={`h-11 w-full rounded-xl text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${ring} ${t.btn}`}>{busy === key ? "Opening…" : user ? t.cta : "Sign in to choose"}</button>
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
