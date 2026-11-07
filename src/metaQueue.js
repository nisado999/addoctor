import { useSyncExternalStore } from "react";

/* The ads chosen for the Meta flow. Kept in memory (pictures are large), shared by every place that can make or
   upload one: the Create a static ad builder, "Put my product in this ad", and the upload on the Create an ad page.
   An item is { id, src (a data: or blob: URL), name, copy?: { primary, headline, description, cta } }. */

const MAX = 30;
let ads = [];
const subs = new Set();
const set = (next) => { ads = next; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export const metaAds = {
  list: () => ads,
  /* Returns true when the ad was added, false when it was already there or the list is full. */
  add(item) {
    if (!item || typeof item.src !== "string" || !item.src || ads.length >= MAX || ads.some((a) => a.src === item.src)) return false;
    set([...ads, { name: "Ad", ...item, id: Math.random().toString(36).slice(2) }]);
    return true;
  },
  remove(id) { set(ads.filter((a) => a.id !== id)); },
  clear() { set([]); },
};

export const useMetaAds = () => useSyncExternalStore(subscribe, metaAds.list, metaAds.list);
