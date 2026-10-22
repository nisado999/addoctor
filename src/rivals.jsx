import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { apiFetch, isCancel } from "./api.js";
import { readJSON, writeJSON } from "./storage.js";
import { useBillingOn, COSTS } from "./billing.js";
import { track } from "./track.js";

/* Type your brand (or paste your site), press Find, and the server researches who competes for the same buyer.
   The last result is kept in this browser so it is still there next time. */

const KEY = "addoctor.rivals.v1";
const STEPS = [
  "Confirming who your brand is",
  "Working out its style and who buys it",
  "Searching for brands with the same look",
  "Scoring each one against your brand",
  "Ranking the closest rivals",
];
const PRICE = { cheaper: "Cheaper than you", similar: "Similar price", pricier: "Pricier than you" };
const adsLink = (id, market) => `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${market || "ALL"}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${encodeURIComponent(id)}`;

// Where the brand sells. Rivals in one country are not the same as rivals worldwide.
const MARKETS = ["GR", "CY", "GB", "US", "CA", "AU", "DE", "FR", "IT", "ES", "PT", "NL", "BE", "AT", "CH", "SE", "DK", "NO", "FI", "IE", "PL", "RO", "BG", "TR", "AE", "SA", "IL", "IN", "BR", "MX", "JP", "KR", "SG", "ZA"];
const regionName = (c) => { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(c) || c; } catch (e) { return c; } };
const MARKET_LIST = MARKETS.map((c) => ({ c, n: regionName(c) })).sort((a, b) => a.n.localeCompare(b.n));

function Thinking({ step }) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon.Sparkle className="h-4 w-4 animate-pulse text-blue-600" />Thinking…</p>
      <ol className="mt-4 space-y-2.5">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-sm transition ${i < step ? "text-slate-400" : i === step ? "font-semibold text-slate-900" : "text-slate-300"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${i < step ? "bg-emerald-100 text-emerald-700" : i === step ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{i < step ? "✓" : i + 1}</span>
            {s}{i === step ? "…" : ""}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-400">This searches the live web and checks each match, so it usually takes about a minute.</p>
    </div>
  );
}

function RivalCard({ c, rank, onSpy, market }) {
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
          {c.avatar ? <img src={c.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-full w-full object-cover" /> : rank}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-slate-900">{c.name}</p>
          {c.site && <a href={`https://${c.site}`} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-slate-400 hover:text-blue-700">{c.site} ↗</a>}
        </div>
        <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${c.type === "direct" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>{c.type === "direct" ? "Direct rival" : "Adjacent"}</span>
      </div>
      {c.why && <p className="mt-3 text-[13px] leading-relaxed text-slate-600">{c.why}</p>}
      {(c.fit || (c.price && PRICE[c.price])) && <p className="mt-2 text-xs font-semibold text-slate-400">{[c.fit ? `Fit ${c.fit}/10` : "", c.price && PRICE[c.price] ? PRICE[c.price] : ""].filter(Boolean).join(" · ")}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button onClick={() => onSpy(c.pageName || c.name)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">
          <Icon.Eye className="h-3.5 w-3.5" />Spy on their ads
        </button>
        {c.pageId && <a href={adsLink(c.pageId, market)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-400 hover:text-slate-700">Meta Ad Library ↗</a>}
      </div>
    </article>
  );
}

export function RivalsView({ onSpy }) {
  const [saved] = useState(() => readJSON(KEY, null));
  const [q, setQ] = useState(saved && typeof saved.q === "string" ? saved.q : "");
  const [market, setMarket] = useState(saved && typeof saved.market === "string" ? saved.market : "");   // "" is global
  const [res, setRes] = useState(saved && saved.res && saved.res.brand && Array.isArray(saved.res.competitors) ? saved.res : null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const ctl = useRef(null);
  const billingOn = useBillingOn();

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);

  const find = async (e) => {
    if (e) e.preventDefault();
    const brand = q.trim();
    if (brand.length < 2 || busy) return;
    const ctrl = new AbortController();
    ctl.current = ctrl;
    setBusy(true); setErr("");
    try {
      const j = await apiFetch("/rivals", { body: { brand, market }, signal: ctrl.signal, timeout: 150000 });
      if (!j || !Array.isArray(j.competitors) || !j.brand) throw new Error("The server sent an answer this page can't read. Try again.");
      setRes(j);
      writeJSON(KEY, { q: brand, market, res: j });
      track("rivals_found", { count: j.competitors.length });
    } catch (er) {
      if (!isCancel(er)) setErr(er.message || "Could not find competitors. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-5xl">
      <form onSubmit={find} className="flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Icon.Target className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Your brand or website, e.g. glossier.com" aria-label="Your brand or website" className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
        </div>
        <select value={market} onChange={(e) => setMarket(e.target.value)} disabled={busy} aria-label="Market" className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10 sm:w-48">
          <option value="">Global</option>
          {MARKET_LIST.map((m) => <option key={m.c} value={m.c}>{m.n}</option>)}
        </select>
        <button type="submit" disabled={q.trim().length < 2 || busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-7 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:opacity-50">
          <Icon.Sparkle className="h-4 w-4" />{busy ? "Finding…" : `Find my competitors${billingOn ? ` · ${COSTS.rivals} credits` : ""}`}
        </button>
      </form>

      {busy && <Thinking step={step} />}

      {err && !busy && <p className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700" role="alert">{err}</p>}

      {res && !busy && (
        <section className="mt-8" aria-label="Competitors">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Your brand · {res.marketName ? `Market: ${res.marketName}` : "Market: Global"}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{res.brand.name}</p>
            {res.brand.sells && <p className="mt-1 text-sm text-slate-600">{res.brand.sells}</p>}
            {res.brand.look && <p className="mt-1 text-sm text-slate-500">Style: {res.brand.look}</p>}
            {res.brand.buyer && <p className="mt-1 text-sm text-slate-500">Buyer: {res.brand.buyer}</p>}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {res.competitors.map((c, i) => <RivalCard key={c.name} c={c} rank={i + 1} onSpy={onSpy} market={res.market} />)}
          </div>
          <p className="mt-5 text-xs text-slate-400">Found by searching the web, so check each one fits before you rely on it.</p>
        </section>
      )}
    </div>
  );
}
