import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { apiFetch } from "./api.js";
import { readJSON, writeJSON } from "./storage.js";

/* Competitor ads you saved from Spy. Meta's image links stop working after a few days, so each saved ad keeps a small
   copy of its picture in this browser (about 30 KB), fetched once through the Worker and shrunk here. */

const KEY = "addoctor.swipe.v1";
const MAX = 80;

const text = (v, n) => String(v == null ? "" : v).slice(0, n);
const okLink = (u) => { try { return new URL(String(u)).protocol === "https:" ? String(u) : ""; } catch (e) { return ""; } };

function clean(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({
      id: text(x.id, 120), brand: text(x.brand, 80), headline: text(x.headline, 200), body: text(x.body, 500), cta: text(x.cta, 40),
      format: text(x.format, 20), days: Number.isFinite(x.days) ? x.days : null, kind: x.kind === "organic" ? "organic" : "ad",
      link: okLink(x.link), thumb: typeof x.thumb === "string" && x.thumb.startsWith("data:image/") ? x.thumb : "",
      savedAt: Number(x.savedAt) || Date.now(),
    });
  }
  return out.slice(0, MAX);
}

let list = clean(readJSON(KEY, []));
const subs = new Set();
const commit = (next) => {
  const ok = writeJSON(KEY, next);
  if (ok) { list = next; subs.forEach((f) => f(list)); }
  return ok;
};
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { list = clean(readJSON(KEY, [])); subs.forEach((f) => f(list)); } });

export function useSwipe() {
  const [s, setS] = useState(list);
  useEffect(() => { subs.add(setS); setS(list); return () => { subs.delete(setS); }; }, []);
  return s;
}

export const isSwiped = (id) => list.some((x) => x.id === id);

// A small JPEG of the ad picture, so it still shows once Meta's link has expired.
async function makeThumb(img) {
  let src = img;
  if (!(typeof location !== "undefined" && String(img).startsWith(location.origin))) {   // a picture from this site needs no trip to the Worker
    const r = await apiFetch("/thumb", { body: { img }, timeout: 30000, retries: 1 });
    src = `data:${r.mime};base64,${r.data}`;
  }
  const el = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("The picture could not be read"));
    i.src = src;
  });
  const k = Math.min(1, 420 / Math.max(el.width, el.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(el.width * k));
  c.height = Math.max(1, Math.round(el.height * k));
  c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

/* Saves one ad, or removes it when it is already saved. Resolves to "saved", "removed", or throws with a message
   the page can show. A missing picture does not stop the save: the text is kept either way. */
export async function toggleSwipe(ad, brand) {
  if (isSwiped(ad.libId)) { commit(list.filter((x) => x.id !== ad.libId)); return "removed"; }
  // Full: say so, rather than quietly dropping the oldest saved ad to make room.
  if (list.length >= MAX) throw new Error(`You have saved ${MAX} competitor ads, the most this browser keeps. Remove an older one to save this.`);
  let thumb = "";
  try { thumb = await makeThumb(ad.img); } catch (e) { /* kept without a picture */ }
  const item = {
    id: ad.libId, brand: ad.advertiser || brand || "", headline: ad.headline, body: ad.body, cta: ad.cta, format: ad.format,
    days: ad.days, kind: ad.kind, link: ad.link, thumb, savedAt: Date.now(),
  };
  const next = clean([item, ...list]);
  if (!commit(next)) {
    // Storage is full: try again without the picture before giving up.
    if (!commit(clean([{ ...item, thumb: "" }, ...list]))) throw new Error("Your browser has no room left to save this. Remove an older saved ad and try again.");
  }
  return "saved";
}

export const removeSwipe = (id) => commit(list.filter((x) => x.id !== id));

export function SwipeView({ query, onSpy }) {
  const all = useSwipe();
  const q = (query || "").trim().toLowerCase();
  const items = q ? all.filter((x) => [x.brand, x.headline, x.body, x.format].join(" ").toLowerCase().includes(q)) : all;

  if (!all.length) {
    return (
      <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Icon.Bookmark className="h-6 w-6" /></span>
        <p className="mt-4 text-base font-semibold text-slate-900">No saved competitor ads yet</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">In Competitor Analysis, open a creative and choose Save. It stays here, even after the original link expires.</p>
        <button onClick={onSpy} className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <Icon.Search className="h-4 w-4" /> Open Competitor Analysis
        </button>
      </div>
    );
  }
  if (!items.length) return <p className="mt-16 text-center text-sm text-slate-500">No saved ads match this search.</p>;

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((x) => (
        <li key={x.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative aspect-[4/5] bg-slate-100">
            {x.thumb ? <img src={x.thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center px-6 text-center text-xs text-slate-400">The picture could not be kept</div>}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{x.brand || "Unknown brand"}{x.format ? ` · ${x.format}` : ""}{x.days != null ? ` · ${x.kind === "organic" ? (x.days === 0 ? "today" : x.days + "d ago") : x.days + "d live"}` : ""}</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{x.headline || "No headline"}</p>
            {x.body && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500">{x.body}</p>}
            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">Saved {new Date(x.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span className="flex items-center gap-1">
                {x.link && <a href={x.link} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Open original</a>}
                <button onClick={() => removeSwipe(x.id)} aria-label={`Remove ${x.headline || "saved ad"}`} className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"><Icon.Trash className="h-4 w-4" /></button>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
