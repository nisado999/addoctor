/* Plans, credit prices, and the signed-in visitor's balance. Everything stays hidden until the server says billing is
   on (GET /billing/config), so this ships safely before Paddle is set up. The server is the only authority on
   balances; this file reads them and opens Paddle's checkout. Credit prices here mirror creditCost() in
   api/worker.js, and the monthly allowances mirror plan_allowance() in supabase/billing.sql. */

import { useEffect, useState } from "react";
import { apiFetch } from "./api.js";

// year 0 = monthly only. Starter is kept small and monthly so the yearly saving, the bonus and the Pro-only
// features all point at Pro. bonus = extra credits on each yearly payment (api/worker.js YEAR_BONUS).
export const PLANS = [
  { id: "free", name: "Free", month: 0, year: 0, credits: 25, who: "Try it with your own account" },
  { id: "starter", name: "Starter", month: 19, year: 0, credits: 100, who: "One shop testing a few ads a month" },
  { id: "pro", name: "Pro", month: 49, year: 468, credits: 900, bonus: 1500, who: "Shops and marketers running ads every week", popular: true },
  { id: "agency", name: "For Teams", month: 129, year: 1236, credits: 2500, who: "Agencies and heavy users" },
];
export const PLAN_NAME = Object.fromEntries(PLANS.map((p) => [p.id, p.name]));
export const PLAN_CREDITS = Object.fromEntries(PLANS.map((p) => [p.id, p.credits]));
export const TOPUP = { price: 15, credits: 200 };

// What one action costs, in credits.
export const COSTS = { breakdown: 1, ask: 3, organic: 3, rivals: 3, analyze: 15, review: 1, packText: 2, image: 5, imagePremium: 12 };

// Pro and For Teams only. The server enforces this too (proOnly in api/worker.js); here it only shows the lock.
export const PRO_PLANS = ["pro", "agency"];
export const PRO_FEATURE = { platforms: "Google and TikTok ads", pptx: "PowerPoint export", premium: "Best-quality images" };
export const isPro = (a) => !!a && (!!a.owner || PRO_PLANS.includes(a.plan));
// Opens the upgrade dialog (App.jsx). reason "pro_only" (with a PRO_FEATURE key) or "no_credits".
export const askUpgrade = (reason, feature) => window.dispatchEvent(new CustomEvent("addoctor:upgrade", { detail: { reason, feature } }));

const EMPTY = { config: null, account: null };
let state = EMPTY;
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f(state)); };

export const billingOn = () => !!(state.config && state.config.enabled);
// Image prices: server credits when billing is on, otherwise the free daily allowance on this device.
export const imageCost = (premium) => (billingOn() ? (premium ? COSTS.imagePremium : COSTS.image) : (premium ? 2 : 1));
export const makeCost = (premium) => imageCost(premium);

let cfgP = null;
export function loadBillingConfig() {
  if (!cfgP) {
    cfgP = apiFetch("/billing/config", { timeout: 15000, retries: 1 })
      .then((c) => { set({ config: c && typeof c === "object" ? c : { enabled: false } }); return state.config; })
      .catch(() => { cfgP = null; set({ config: { enabled: false } }); return state.config; });
  }
  return cfgP;
}

// accountFailed lets the page offer a retry instead of saying "Loading" forever.
export async function loadAccount() {
  try { const a = await apiFetch("/billing/me", { timeout: 20000, retries: 1 }); set({ account: a, accountFailed: false }); return a; }
  catch (e) { if (!state.account) set({ accountFailed: true }); return null; }
}
export const clearAccount = () => set({ account: null });

let timer = 0;
if (typeof window !== "undefined") {
  // A paid action just finished: the balance changed.
  window.addEventListener("addoctor:credits-changed", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (billingOn() && state.account) loadAccount(); }, 700);
  });
}

export function useBilling(user) {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); loadBillingConfig(); return () => { subs.delete(setS); }; }, []);
  const uid = user ? user.id : "";
  useEffect(() => { if (uid) loadAccount(); else clearAccount(); }, [uid]);
  return { ...s, on: !!(s.config && s.config.enabled), ready: !!s.config };
}

// For buttons that only need to know whether to show a credit price.
export function useBillingOn() {
  const [on, setOn] = useState(billingOn());
  useEffect(() => {
    const f = (s) => setOn(!!(s.config && s.config.enabled));
    subs.add(f); loadBillingConfig(); f(state);
    return () => { subs.delete(f); };
  }, []);
  return on;
}

// True when a Pro-only control should show its lock: billing is on and this visitor is not on Pro or For Teams.
export function useProLock() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); loadBillingConfig(); return () => { subs.delete(setS); }; }, []);
  return !!(s.config && s.config.enabled) && !isPro(s.account);
}

export async function saveSegment(segment) {
  await apiFetch("/billing/segment", { body: { segment }, timeout: 15000 });
  set({ account: state.account ? { ...state.account, segment } : state.account });
}

/* ---- Paddle checkout ---- */
let paddleP = null;
let onPaid = () => {};
function loadPaddle(cfg) {
  if (!paddleP) {
    paddleP = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      s.async = true;
      s.onload = () => {
        try {
          if (cfg.paddle.env === "sandbox") window.Paddle.Environment.set("sandbox");
          window.Paddle.Initialize({ token: cfg.paddle.token, eventCallback: (ev) => { if (ev && ev.name === "checkout.completed") onPaid(); } });
          resolve(window.Paddle);
        } catch (e) { paddleP = null; reject(e); }
      };
      s.onerror = () => { paddleP = null; reject(new Error("The checkout could not be loaded. Check your connection or an ad blocker, then try again.")); };
      document.head.appendChild(s);
    });
  }
  return paddleP;
}

// After a payment the webhook may take a few seconds: check the balance until it changes.
function watchPurchase(notify) {
  const before = state.account ? `${state.account.plan}|${state.account.total}` : "";
  let tries = 0;
  const tick = async () => {
    tries += 1;
    const a = await loadAccount();
    if (a && `${a.plan}|${a.total}` !== before) { if (notify) notify("Payment received. Your credits are updated.", 4000); return; }
    if (tries < 20) setTimeout(tick, 2500);
    else if (notify) notify("Payment received. If your credits do not show up in a minute, reload the page.", 6000);
  };
  setTimeout(tick, 2000);
}

export async function openCheckout(priceKey, user, notify) {
  const cfg = state.config || await loadBillingConfig();
  if (!cfg || !cfg.checkout) throw new Error("Payments are not open yet.");
  const priceId = cfg.prices && cfg.prices[priceKey];
  if (!priceId) throw new Error("That option is not available yet.");
  // shortcut: there is no in-place plan change yet, and a second checkout would start a second Paddle subscription
  // that keeps both billing. Upgrade by adding a Worker route that updates the subscription through Paddle's API.
  const a = state.account;
  if (/^(starter|pro|agency)_/.test(priceKey) && a && a.plan !== "free" && a.status !== "canceled") {
    throw new Error(`You're on ${PLAN_NAME[a.plan] || a.plan} now. To switch, cancel it from the link in your Paddle receipt (it keeps working to the end of the period), then choose the new plan here.`);
  }
  const P = await loadPaddle(cfg);
  onPaid = () => watchPurchase(notify);
  P.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: user && user.email ? { email: user.email } : undefined,
    customData: { user_id: user.id },
    settings: { displayMode: "overlay", theme: "light", locale: "en" },
  });
}
