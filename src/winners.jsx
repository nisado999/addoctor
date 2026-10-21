import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";
import { toggleSwipe, useSwipe } from "./swipe.jsx";
import { SPY_ANGLES, SPY_ANGLE } from "./angles.js";
import { track } from "./track.js";

/* The Winning Ads library: ads that were still running after a month or more, collected once by tools/build-library.mjs
   and kept as files on this site (public/library). An advertiser only keeps paying for an ad that works, so these are
   proven. Each one can start a template of your own, or open the templates that look like it. */

const PAGE = 40;
const FORMATS = ["All", "Static", "Video", "Carousel"];
const SORTS = [["mix", "Top picks"], ["days", "Longest running"], ["new", "Newest"]];
const BROWSE_TERM = { skincare: "skincare", beauty: "beauty", fashion: "fashion", activewear: "fitness", health: "supplement", food: "food", home: "home", pets: "pet", tech: "tech", jewelry: "jewelry" };
const chip = (on, small) => `rounded-full border px-3.5 ${small ? "py-1" : "py-1.5"} text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${on ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
const running = (days) => (days >= 90 ? `${Math.floor(days / 30)} months` : `${days} days`);
const url = (p) => new URL("library/" + p, document.baseURI).href;

function Card({ ad, saved, onSave, onMake, onBrowse }) {
  const tpl = (ad.tags.map((t) => SPY_ANGLE[t]).find(Boolean) || {}).tpl;
  return (
    <article className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative bg-slate-100" style={{ aspectRatio: `${ad.w} / ${ad.h}` }}>
        <img src={url(ad.img)} alt={ad.headline ? `${ad.brand} ad: ${ad.headline}` : `${ad.brand} ad`} width={ad.w} height={ad.h} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
          <Icon.Trophy className="h-3 w-3" />{running(ad.days)}
        </span>
        {ad.format !== "Static" && <span className="absolute right-2.5 top-2.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white">{ad.format}</span>}
      </div>
      <div className="p-3.5">
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{ad.brand}</p>
        {ad.headline && <p className="mt-1 line-clamp-3 text-[14px] font-semibold leading-snug text-slate-900">{ad.headline}</p>}
        {ad.body && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{ad.body}</p>}
        {ad.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {ad.tags.slice(0, 3).map((t) => SPY_ANGLE[t] && <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">{SPY_ANGLE[t].label}</span>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button onClick={() => onMake(tpl, ad)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">
            <Icon.Wand className="h-3.5 w-3.5" />Make it mine
          </button>
          <button onClick={() => onBrowse(ad)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20">Similar templates</button>
          <a href={`https://www.facebook.com/ads/library/?id=${ad.id}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-slate-700">Original ↗</a>
          <button onClick={() => onSave(ad)} aria-pressed={saved} aria-label={saved ? "Remove from Vault" : "Save to Vault"} className={`grid h-8 w-8 place-items-center rounded-full border transition focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20 ${saved ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
            <Icon.Bookmark className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function WinnersView({ onMake, onBrowse, notify, active = true }) {
  const [lib, setLib] = useState({ state: "loading", data: null });
  const [niche, setNiche] = useState("all");
  const [format, setFormat] = useState("All");
  const [angle, setAngle] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("mix");
  const [shown, setShown] = useState(PAGE);
  const saved = useSwipe();
  const savedIds = useMemo(() => new Set(saved.map((x) => x.id)), [saved]);
  const sentinel = useRef(null);

  useEffect(() => {
    if (!active || lib.data || lib.state === "empty") return;
    let dead = false;
    fetch(url("ads.json"), { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("missing"))))
      .then((j) => {
        if (dead) return;
        if (!j || !Array.isArray(j.ads) || !j.ads.length) { setLib({ state: "empty", data: null }); return; }
        const ads = j.ads.map((a) => ({ ...a, tags: Array.isArray(a.tags) ? a.tags : [] }));
        // "Top picks": every brand's best ad first, then every brand's second best, so the page is varied from the top.
        const rank = new Map();
        ads.slice().sort((x, y) => y.days - x.days).forEach((a) => { const k = a.niche + "/" + a.brand; rank.set(a.id, (rank.get(k) || 0)); rank.set(k, (rank.get(k) || 0) + 1); });
        ads.forEach((a) => { a.rank = rank.get(a.id) || 0; });
        setLib({ state: "ready", data: { ...j, ads } });
        track("winners_open", { ads: ads.length });
      })
      .catch(() => { if (!dead) setLib({ state: "empty", data: null }); });
    return () => { dead = true; };
  }, [active, lib.data, lib.state]);

  const list = useMemo(() => {
    if (!lib.data) return [];
    const needle = q.trim().toLowerCase();
    const out = lib.data.ads.filter((a) => (niche === "all" || a.niche === niche) && (format === "All" || a.format === format) && (!angle || a.tags.includes(angle))
      && (!needle || (a.brand + " " + a.headline + " " + a.body).toLowerCase().includes(needle)));
    if (sort === "days") out.sort((x, y) => y.days - x.days);
    else if (sort === "new") out.sort((x, y) => x.days - y.days);
    else out.sort((x, y) => x.rank - y.rank || y.days - x.days);
    return out;
  }, [lib.data, niche, format, angle, q, sort]);

  useEffect(() => { setShown(PAGE); }, [niche, format, angle, q, sort]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + PAGE); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, lib.state]);

  const save = async (ad) => {
    try {
      const r = await toggleSwipe({ libId: ad.id, advertiser: ad.brand, headline: ad.headline, body: ad.body, cta: ad.cta, format: ad.format, days: ad.days, kind: "ad", link: "", img: url(ad.img) }, ad.brand);
      notify(r === "saved" ? "Saved to your Vault" : "Removed from your Vault");
    } catch (e) { notify(e.message || "Could not save this ad"); }
  };
  const browse = (ad) => onBrowse(BROWSE_TERM[ad.niche] || "");

  if (lib.state === "loading") return <p className="mt-6 text-sm text-slate-500" role="status">Loading the library…</p>;
  if (lib.state === "empty") return <p className="mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">The library is being filled and will be here soon.</p>;

  const niches = lib.data.niches || [];
  const total = lib.data.ads.length;
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by brand or words in the ad, e.g. free shipping" aria-label="Search the library" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10">
          {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Category">
        <button onClick={() => setNiche("all")} aria-pressed={niche === "all"} className={chip(niche === "all")}>All <span className="opacity-60">{total}</span></button>
        {niches.map((n) => <button key={n.id} onClick={() => setNiche(n.id)} aria-pressed={niche === n.id} className={chip(niche === n.id)}>{n.label} <span className="opacity-60">{n.count}</span></button>)}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="flex flex-wrap gap-2" role="group" aria-label="Format">
          {FORMATS.map((f) => <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f} className={chip(format === f, true)}>{f}</button>)}
        </span>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="flex flex-wrap gap-2" role="group" aria-label="Style">
          {SPY_ANGLES.filter((a) => a.id !== "new").map((a) => <button key={a.id} onClick={() => setAngle(angle === a.id ? "" : a.id)} aria-pressed={angle === a.id} className={chip(angle === a.id, true)}>{a.label}</button>)}
        </span>
        <span className="ml-auto text-xs text-slate-400">{list.length} ads</span>
      </div>

      {list.length ? (
        <>
          <div className="mt-5 columns-2 gap-4 md:columns-3 xl:columns-4 2xl:columns-5">
            {list.slice(0, shown).map((ad) => <Card key={ad.id} ad={ad} saved={savedIds.has(ad.id)} onSave={save} onMake={onMake} onBrowse={browse} />)}
          </div>
          {shown < list.length && <div ref={sentinel} className="h-10" aria-hidden="true" />}
        </>
      ) : <p className="mt-10 text-center text-sm text-slate-500">No ads match. Clear a filter or try other words.</p>}
    </div>
  );
}
