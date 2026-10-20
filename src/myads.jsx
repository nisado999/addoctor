import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { readJSON, writeJSON } from "./storage.js";

/* Ads you made in the studio and saved to the Vault. Each keeps a small JPEG of the finished picture in this browser,
   so it can be opened and downloaded again later. */

const KEY = "addoctor.myads.v1";
const MAX = 40;
const SIDE = 540;   // the longest side of a saved picture, in pixels

const text = (v, n) => String(v == null ? "" : v).slice(0, n);

function clean(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const x of raw) {
    if (!x || typeof x !== "object" || !x.id || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({
      id: text(x.id, 120), title: text(x.title, 120), category: text(x.category, 60), templateId: text(x.templateId, 120),
      thumb: typeof x.thumb === "string" && x.thumb.startsWith("data:image/") ? x.thumb : "",
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

export function useMyAds() {
  const [s, setS] = useState(list);
  useEffect(() => { subs.add(setS); setS(list); return () => { subs.delete(setS); }; }, []);
  return s;
}

// Shrinks the finished picture to a small JPEG. The studio's result is a PNG, which is far too big to keep.
function shrink(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => reject(new Error("The ad could not be read"));
    img.src = dataUrl;
  });
}

/* Saves one finished ad. Resolves with its id, or throws with a message the page can show. */
export async function saveMyAd({ dataUrl, title, category, templateId }) {
  const thumb = await shrink(dataUrl);
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, category, templateId, thumb, savedAt: Date.now() };
  if (!commit(clean([item, ...list]))) throw new Error("Your browser has no room left to save this. Remove an older saved ad and try again.");
  return item.id;
}

export const removeMyAd = (id) => commit(list.filter((x) => x.id !== id));

export function MyAdsView({ query, onOpen }) {
  const all = useMyAds();
  const q = (query || "").trim().toLowerCase();
  const items = q ? all.filter((x) => [x.title, x.category].join(" ").toLowerCase().includes(q)) : all;

  if (!all.length) {
    return (
      <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-900"><Icon.Bookmark className="h-6 w-6" /></span>
        <p className="mt-4 text-base font-semibold text-slate-900">No ads saved yet</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">Make an ad in the studio, then choose Save to Vault. It stays here so you can download it again.</p>
      </div>
    );
  }
  if (!items.length) return <p className="mt-16 text-center text-sm text-slate-500">No saved ads match this search.</p>;

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((x) => (
        <li key={x.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative aspect-[4/5] bg-slate-100">
            {x.thumb && onOpen ? (
              <button onClick={() => onOpen(x)} aria-label={`Edit ${x.title || "saved ad"}`} className="group block h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-slate-900/25">
                <img src={x.thumb} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 to-transparent px-4 pb-3 pt-10 text-left text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">Click to edit</span>
              </button>
            ) : x.thumb ? <img src={x.thumb} alt={x.title || "Saved ad"} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center px-6 text-center text-xs text-slate-400">The picture could not be kept</div>}
          </div>
          <div className="flex flex-1 flex-col p-4">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{x.category || "Ad"}</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{x.title || "Saved ad"}</p>
            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">Saved {new Date(x.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span className="flex items-center gap-1">
                {x.thumb && <a href={x.thumb} download={`addoctor-${x.id}.jpg`} aria-label={`Download ${x.title || "saved ad"}`} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30">Download</a>}
                <button onClick={() => removeMyAd(x.id)} aria-label={`Remove ${x.title || "saved ad"}`} className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"><Icon.Trash className="h-4 w-4" /></button>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
