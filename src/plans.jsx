import { useState } from "react";
import { Icon } from "./ui";
import { useBilling, openCheckout, saveSegment, PLANS, PLAN_NAME, TOPUP, COSTS } from "./billing.js";
import { track } from "./track.js";

/* Plans & credits: what each plan includes, what a credit buys, and the checkout. In AdDoctor's usual white design. */

const SEGMENTS = [["shop", "Shop owner"], ["freelancer", "Freelancer or marketer"], ["agency", "Agency"]];
const money = (n) => "$" + n.toLocaleString("en-US");
const date = (iso) => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

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
            <button onClick={onSignIn} className={`rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 ${ring}`}>Sign in</button>
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
              <button key={String(y)} onClick={() => setYearly(y)} aria-pressed={yearly === y} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${ring} ${yearly === y ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const current = acct && acct.plan === p.id;
            const price = yearly ? p.year : p.month;
            const key = `${p.id}_${yearly ? "year" : "month"}`;
            return (
              <article key={p.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${p.popular ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
                  {p.popular && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">Most popular</span>}
                </div>
                <p className="mt-1 min-h-[2.5rem] text-xs leading-snug text-slate-500">{p.who}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{p.id === "free" ? "$0" : money(price)}<span className="ml-1 text-sm font-medium text-slate-500">{p.id === "free" ? "" : yearly ? "/year" : "/month"}</span></p>
                <ul className="mt-4 space-y-2 text-[13px] text-slate-700">
                  <li className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span><b className="font-semibold">{p.credits.toLocaleString("en-US")}</b> credits every month</span></li>
                  <li className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>About <b className="font-semibold">{Math.floor(p.credits / COSTS.image)}</b> images, or {Math.floor(p.credits / COSTS.analyze)} competitor {Math.floor(p.credits / COSTS.analyze) === 1 ? "analysis" : "analyses"}</span></li>
                  <li className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>{p.seats} {p.seats === 1 ? "seat" : "seats"}</span></li>
                  <li className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>Examine your own ads, free</span></li>
                </ul>
                <div className="mt-auto pt-5">
                  {p.id === "free" ? (
                    <button disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">{user ? "Included" : "Included with an account"}</button>
                  ) : current ? (
                    <button disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500">Your plan</button>
                  ) : (
                    <button onClick={() => buy(key)} disabled={busy === key || !bill.on} className={`h-11 w-full rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${ring} ${p.popular ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700" : "border border-slate-200 bg-white text-slate-800 hover:border-slate-300"}`}>{busy === key ? "Opening…" : user ? `Choose ${p.name}` : "Sign in to choose"}</button>
                  )}
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
          <button onClick={() => buy("topup")} disabled={busy === "topup" || !bill.on} className={`mt-4 h-11 rounded-xl border border-blue-200 bg-white px-5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 ${ring}`}>{busy === "topup" ? "Opening…" : user ? `Buy ${TOPUP.credits} credits · ${money(TOPUP.price)}` : "Sign in to top up"}</button>
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
