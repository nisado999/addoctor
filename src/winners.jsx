import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { hasFeature } from "./shared.js";
import { apiFetch, isCancel } from "./api.js";
import { toggleSwipe, useSwipe } from "./swipe.jsx";
import { track } from "./track.js";

/* A library of ads that have run for a month or more. An advertiser keeps paying only for ads that work, so long-running
   ads from well-known brands are the best public sign of a winner. The server reads them once and shares the saved copy. */

const NICHES = [
  ["skincare", "Skincare & beauty"], ["fashion", "Fashion & apparel"], ["health", "Health & supplements"], ["home", "Home & living"],
  ["pets", "Pets"], ["food", "Food & drink"], ["tech", "Tech & gadgets"], ["jewelry", "Jewelry & accessories"],
];
const FORMATS = ["All", "Static", "Video", "Carousel"];
const chip = (on, pad = "py-1.5") => `rounded-full border px-3.5 ${pad} text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${on ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
const running = (days) => (days >= 60 ? `${Math.floor(days / 30)} months` : `${days} days`);

function WinnerCard({ ad, saved, onSave, onSpy }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative bg-slate-100">
        <img src={ad.img} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="aspect-[4/5] w-full object-cover" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
          <Icon.Trophy className="h-3 w-3" />Running {running(ad.days)}
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white">{ad.format}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          {ad.avatar && <img src={ad.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-5 w-5 rounded-full object-cover" />}
          <span className="truncate">{ad.advertiser}</span>
        </p>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">{ad.headline || "No headline"}</p>
        {ad.body && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-slate-500">{ad.body}</p>}
        {ad.cta && <span className="mt-3 w-fit rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{ad.cta}</span>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <button onClick={() => onSave(ad)} aria-pressed={saved} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 ${saved ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
            <Icon.Bookmark className="h-3.5 w-3.5" />{saved ? "Saved" : "Save"}
          </button>
          <button onClick={() => onSpy(ad.advertiser)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20">
            <Icon.Eye className="h-3.5 w-3.5" />See all their ads
          </button>
          <a href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.libId)}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-semibold text-slate-400 hover:text-slate-700">Meta ↗</a>
        </div>
      </div>
    </article>
  );
}

export function WinnersView({ onSpy, notify, active = true }) {
  const [niche, setNiche] = useState("skincare");
  const [format, setFormat] = useState("All");
  const [tick, setTick] = useState(0);   // bumped to load the category again
  const [state, setState] = useState({ busy: false, err: "", data: null });
  const [ready, setReady] = useState(null);   // null until the server says whether the library is set up
  const cache = useRef({});
  const saved = useSwipe();
  const savedIds = new Set(saved.map((x) => x.id));

  useEffect(() => { let dead = false; hasFeature("library").then((ok) => { if (!dead) setReady(ok); }); return () => { dead = true; }; }, []);

  useEffect(() => {
    if (!active || !ready) return;
    if (cache.current[niche]) { setState({ busy: false, err: "", data: cache.current[niche] }); return; }
    const ctrl = new AbortController();
    setState({ busy: true, err: "", data: null });
    apiFetch("/library", { body: { niche }, signal: ctrl.signal, timeout: 120000, retries: 1 })
      .then((j) => {
        if (!j || !Array.isArray(j.ads)) throw new Error("The library sent an answer this page can't read. Try again.");
        cache.current[niche] = j;
        setState({ busy: false, err: "", data: j });
        track("winners_open", { niche, ads: j.ads.length });
      })
      .catch((e) => { if (!isCancel(e)) setState({ busy: false, err: e.message || "Could not load the library. Try again.", data: null }); });
    return () => ctrl.abort();
  }, [niche, active, ready, tick]);

  const save = async (ad) => {
    try {
      const r = await toggleSwipe(ad, ad.advertiser);
      notify(r === "saved" ? "Saved to your Vault" : "Removed from your Vault");
    } catch (e) { notify(e.message || "Could not save this ad"); }
  };

  const ads = state.data ? state.data.ads.filter((a) => format === "All" || a.format === format) : [];
  const label = NICHES.find((n) => n[0] === niche)[1];

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {NICHES.map(([id, name]) => <button key={id} onClick={() => setNiche(id)} aria-pressed={niche === id} className={chip(niche === id)}>{name}</button>)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Format">
        {FORMATS.map((f) => <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f} className={chip(format === f, "py-1")}>{f}</button>)}
        {state.data && <span className="ml-auto text-xs text-slate-400">{ads.length} ads · longest running first</span>}
      </div>

      {ready === false && <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">The winning ads library is not switched on for this server yet.</p>}

      {state.busy && (
        <div className="mt-8" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-slate-700">Pulling the longest-running ads in {label}…</p>
          <p className="mt-1 text-xs text-slate-400">The first time a category is opened it can take up to half a minute. After that it is instant.</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/6] animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        </div>
      )}

      {state.err && (
        <div className="mt-8 rounded-2xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700" role="alert">
          {state.err}
          <button onClick={() => setTick((t) => t + 1)} className="ml-3 font-semibold underline">Try again</button>
        </div>
      )}

      {state.data && (
        ads.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map((ad) => <WinnerCard key={ad.libId} ad={ad} saved={savedIds.has(ad.libId)} onSave={save} onSpy={onSpy} />)}
          </div>
        ) : <p className="mt-8 text-sm text-slate-500">No {format.toLowerCase()} ads in this category. Try another format.</p>
      )}
    </div>
  );
}
