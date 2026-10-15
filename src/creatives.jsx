import { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { copyText, SPY_API, SPY_KEY } from "./shared.js";
import { track } from "./track.js";

/* A competitor's creatives as a media-first gallery, with a per-creative breakdown opened on demand.
   The breakdown is one Claude call per ad (POST /creative), made only when a creative is opened. */

const SAVED_KEY = "addoctor.creatives.v1";
const PAGE = 24;
const AWARENESS = [
  ["unaware", "Unaware"],
  ["problem", "Problem aware"],
  ["solution", "Solution aware"],
  ["product", "Product aware"],
  ["most", "Most aware"],
];
const ROWS = [
  ["hook", "Hook"],
  ["problem", "Problem"],
  ["solution", "Solution"],
  ["proof", "Proof"],
  ["offer", "Offer"],
  ["cta", "Call to action"],
];

const cache = new Map();   // libId -> breakdown, kept while the page is open

function loadSaved() {
  try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch (e) { return []; }
}

function useBreakdown(ad, brand) {
  const [st, setSt] = useState({ data: null, err: "", busy: false });
  useEffect(() => {
    if (!ad) return undefined;
    if (cache.has(ad.libId)) { setSt({ data: cache.get(ad.libId), err: "", busy: false }); return undefined; }
    if (!SPY_API) { setSt({ data: null, err: "Breakdowns need the AdDoctor server. Open the published page, not the preview.", busy: false }); return undefined; }
    if (!ad.img) { setSt({ data: null, err: "This ad has no image to read.", busy: false }); return undefined; }
    const c = new AbortController();
    setSt({ data: null, err: "", busy: true });
    (async () => {
      try {
        const r = await fetch(SPY_API + "/creative", {
          method: "POST", signal: c.signal,
          headers: { "Content-Type": "application/json", ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) },
          body: JSON.stringify({ img: ad.img, headline: ad.headline, body: ad.body, cta: ad.cta, format: ad.format, days: ad.days, brand }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? "The AdDoctor server has not been updated for creative breakdowns yet." : j.error || "Request failed (" + r.status + ")");
        cache.set(ad.libId, j);
        setSt({ data: j, err: "", busy: false });
        track("creative_breakdown", { format: ad.format, days: ad.days });
      } catch (e) {
        if (!c.signal.aborted) setSt({ data: null, err: e.message || "The breakdown failed. Try again.", busy: false });
      }
    })();
    return () => c.abort();
  }, [ad && ad.libId]);   // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function breakdownText(ad, b, brand) {
  const out = [`${brand || ad.advertiser || "Creative"} · ${ad.format}${ad.days !== null && ad.days !== undefined ? ` · ${ad.days} days live` : ""}`, `"${ad.headline}"`, ""];
  ROWS.forEach(([k, l]) => out.push(`${l}: ${b[k]}`));
  out.push(`Visual: ${b.visual}`, `Angle: ${b.angle}`, `Persona: ${b.persona}`);
  const aw = AWARENESS.find((a) => a[0] === b.awareness);
  if (aw) out.push(`Awareness: ${aw[1]}`);
  if (b.tags.length) out.push(`Tags: ${b.tags.join(", ")}`);
  out.push(`Why it may work: ${b.why}`);
  return out.join("\n");
}

function CreativePanel({ ad, brand, saved, onSave, onClose, onRebuild, notify }) {
  const { data, err, busy } = useBreakdown(ad, brand);
  const closeRef = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    if (closeRef.current) closeRef.current.focus();
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const aw = data ? AWARENESS.findIndex((a) => a[0] === data.awareness) : -1;
  const winner = ad.days !== null && ad.days !== undefined && ad.days >= 30;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Creative breakdown" className="flex h-full w-full max-w-[980px] flex-col overflow-y-auto bg-white shadow-2xl md:flex-row">
        <div className="shrink-0 bg-slate-100 md:sticky md:top-0 md:h-full md:w-[42%]">
          <div className="grid h-full place-items-center p-4 md:p-6">
            {ad.img ? <img src={ad.img} alt={ad.headline} referrerPolicy="no-referrer" className="max-h-[70vh] w-full rounded-xl object-contain md:max-h-[88vh]" /> : <p className="text-sm text-slate-500">No image for this ad.</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1 p-5 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{brand || ad.advertiser || "Competitor"}</p>
              <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-slate-900">{ad.headline}</h2>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"><Icon.Close className="h-5 w-5" /></button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{ad.format}</span>
            {ad.days !== null && ad.days !== undefined && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${winner ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-white text-slate-500 ring-slate-200"}`}>{winner && <Icon.Trophy className="h-3 w-3" />}{ad.days}d live</span>
            )}
            {ad.versions > 1 && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{ad.versions} versions</span>}
            {ad.cta && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{ad.cta}</span>}
          </div>
          {ad.body && <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{ad.body}</p>}

          <h3 className="mt-6 text-sm font-semibold text-slate-900">Creative breakdown <span className="font-normal text-slate-400">· read by Claude</span></h3>
          {busy && (
            <div className="mt-3 space-y-3" role="status" aria-label="Reading this creative">
              {ROWS.map(([k]) => <div key={k} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}
            </div>
          )}
          {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{err}</p>}
          {data && (
            <>
              <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {ROWS.map(([k, l]) => (
                  <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-3.5 py-2.5">
                    <dt className="text-xs font-semibold text-slate-500">{l}</dt>
                    <dd className={`text-[13px] leading-snug ${/^not shown/i.test(data[k]) ? "text-slate-400" : "text-slate-800"}`}>{data[k]}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Awareness stage</p>
                  <div className="mt-2 flex gap-1" role="img" aria-label={aw >= 0 ? "Targets " + AWARENESS[aw][1] : "Awareness stage not clear"}>
                    {AWARENESS.map(([id], i) => <span key={id} className={`h-2 flex-1 rounded-full ${i === aw ? "bg-blue-600" : "bg-slate-200"}`} />)}
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium text-slate-700">{aw >= 0 ? AWARENESS[aw][1] : "Not clear"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Target persona</p>
                  <p className="mt-2 text-[13px] leading-snug text-slate-700">{data.persona}</p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-500">Visual and angle</p>
                <p className="mt-1.5 text-[13px] leading-snug text-slate-700">{data.visual}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.angle !== "Not shown" && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">{data.angle}</span>}
                  {data.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{t}</span>)}
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-blue-50/60 p-3.5 ring-1 ring-blue-100">
                <p className="text-xs font-semibold text-blue-700">Why it may be working</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{data.why}</p>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button onClick={() => onRebuild()} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"><Icon.Wand className="h-3.5 w-3.5" /> Rebuild this angle</button>
            <button onClick={onSave} aria-pressed={saved} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"><Icon.Bookmark className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save"}</button>
            {data && <button onClick={async () => { const ok = await copyText(breakdownText(ad, data, brand)); notify(ok === false ? "Couldn't copy. Select the text manually." : "Breakdown copied"); }} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20"><Icon.Copy className="h-3.5 w-3.5" /> Copy breakdown</button>}
            {ad.link && /^https?:\/\//i.test(ad.link) && <a href={ad.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Landing page</a>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreativeGallery({ ads, brand, onRebuild, notify }) {
  const [format, setFormat] = useState("All");
  const [sort, setSort] = useState("days");
  const [onlySaved, setOnlySaved] = useState(false);
  const [onlyLong, setOnlyLong] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [saved, setSaved] = useState(loadSaved);
  const [open, setOpen] = useState(null);
  useEffect(() => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable */ } }, [saved]);

  const formats = useMemo(() => ["All", ...Array.from(new Set(ads.map((a) => a.format).filter(Boolean)))], [ads]);
  const list = useMemo(() => {
    let a = ads.filter((x) => x.img);
    if (format !== "All") a = a.filter((x) => x.format === format);
    if (onlyLong) a = a.filter((x) => x.days !== null && x.days !== undefined && x.days >= 30);
    if (onlySaved) a = a.filter((x) => saved.includes(x.libId));
    a = [...a];
    if (sort === "days") a.sort((x, y) => (y.days ?? -1) - (x.days ?? -1));
    else if (sort === "new") a.sort((x, y) => (y.startMs || 0) - (x.startMs || 0));
    else a.sort((x, y) => (y.versions || 1) - (x.versions || 1));
    return a;
  }, [ads, format, sort, onlyLong, onlySaved, saved]);
  useEffect(() => { setShown(PAGE); }, [format, sort, onlyLong, onlySaved, ads]);

  const toggleSave = (id) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-300)));
  const chip = (on) => `rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const withImg = ads.filter((x) => x.img).length;

  return (
    <div className="mt-8" id="spy-gallery">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Creatives</h3>
          <p className="text-xs text-slate-500">{withImg} of {ads.length} ads have an image. Open one for the hook, offer, proof and who it targets.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
            <option value="days">Longest live</option>
            <option value="new">Newest</option>
            <option value="versions">Most versions</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter creatives">
        {formats.map((f) => <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f} className={chip(format === f)}>{f}</button>)}
        <button onClick={() => setOnlyLong((v) => !v)} aria-pressed={onlyLong} className={chip(onlyLong)}>Running 30+ days</button>
        <button onClick={() => setOnlySaved((v) => !v)} aria-pressed={onlySaved} className={chip(onlySaved)}>Saved{saved.length ? ` (${saved.filter((id) => ads.some((a) => a.libId === id)).length})` : ""}</button>
      </div>

      {list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">No creatives match these filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {list.slice(0, shown).map((a) => {
            const winner = a.days !== null && a.days !== undefined && a.days >= 30;
            return (
              <button key={a.libId} onClick={() => { setOpen(a); track("creative_opened", { format: a.format, days: a.days }); }} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
                <span className="relative block aspect-[4/5] w-full bg-slate-100">
                  <img src={a.img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm">{a.format}</span>
                  {saved.includes(a.libId) && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white shadow-sm"><Icon.Bookmark className="h-3 w-3" /></span>}
                  {a.days !== null && a.days !== undefined && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${winner ? "bg-emerald-600 text-white" : "bg-white/90 text-slate-700"}`}>{a.days}d live</span>}
                </span>
                <span className="p-3">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{a.headline}</span>
                  {a.cta && <span className="mt-1 block truncate text-[11px] text-slate-400">{a.cta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {list.length > shown && (
        <div className="mt-5 text-center">
          <button onClick={() => setShown((n) => n + PAGE)} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Show more ({list.length - shown} left)</button>
        </div>
      )}

      {open && (
        <CreativePanel
          ad={open} brand={brand} saved={saved.includes(open.libId)} onSave={() => toggleSave(open.libId)}
          onClose={() => setOpen(null)} onRebuild={() => { const a = open; setOpen(null); onRebuild(a); }} notify={notify}
        />
      )}
    </div>
  );
}

export { CreativeGallery };
