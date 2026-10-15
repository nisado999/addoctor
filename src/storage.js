/* What the app keeps in this browser (vault, favourites, credits). Storage can be full, blocked in a private window,
   or hold entries written by an older version of the app, so every read is checked and no read or write throws. */

import { scoreTone } from "./shared.js";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

/* True when the value was really stored, false when storage is full or blocked, so the UI never claims a save
   that did not happen. */
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

/* --------------------------------- Vault --------------------------------- */

const STATUS = { good: "Healthy", warn: "Needs Immediate Attention", bad: "Critical" };   // the labels Examine gives
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

// The uploaded creative kept with a report. Examine re-scores it when the report is reopened, so it is kept only
// when its size is usable.
function cleanAsset(a) {
  if (!isObj(a)) return null;
  const w = num(a.w), h = num(a.h);
  if (!(w > 0) || !(h > 0)) return null;
  const out = { ...a, name: text(a.name), kind: a.kind === "video" ? "video" : "image", w, h };
  out.tags = Array.isArray(a.tags) ? a.tags.filter((t) => typeof t === "string") : [];
  if (typeof a.thumb !== "string") delete out.thumb;
  return out;
}

/* Only records the Vault can draw: anything else (null, a string, a record without a score) is dropped, and
   missing fields are filled in. Fields this version does not know about are kept for the next one. */
function sanitizeVault(raw) {
  if (!Array.isArray(raw)) return [];
  const now = Date.now();
  const ids = new Set();
  const out = [];
  raw.forEach((r, i) => {
    if (!isObj(r)) return;
    const s = num(r.score);
    if (!Number.isFinite(s)) return;
    const score = Math.round(Math.min(100, Math.max(0, s)));
    const tone = r.tone === "good" || r.tone === "warn" || r.tone === "bad" ? r.tone : scoreTone(score);
    const t = num(r.savedAt);
    const savedAt = Number.isFinite(t) ? t : now;
    const okId = (typeof r.id === "number" && Number.isFinite(r.id)) || (typeof r.id === "string" && r.id !== "");
    const id = okId && !ids.has(r.id) ? r.id : `v${savedAt}-${i}`;   // a repeated id would make removing one remove both
    ids.add(id);
    const rec = {
      ...r, id, score, tone, savedAt,
      brand: text(r.brand), headline: text(r.headline), copy: text(r.copy),
      status: text(r.status) || STATUS[tone],
      type: r.type === "video" ? "video" : "static",
      asset: cleanAsset(r.asset),
    };
    if (typeof r.thumb !== "string") delete rec.thumb;
    out.push(rec);
  });
  return out;
}

const loadVault = (key) => sanitizeVault(readJSON(key, []));

/* Favourite template ids, without repeats. With validIds, ids of templates that no longer exist are left out. */
function loadFavs(key, validIds) {
  const v = readJSON(key, []);
  if (!Array.isArray(v)) return [];
  const out = [];
  v.forEach((id) => {
    if (typeof id !== "string" || !id || out.includes(id)) return;
    if (validIds && !validIds.has(id)) return;
    out.push(id);
  });
  return out;
}

/* -------------------------------- Credits -------------------------------- */

// The visitor's own calendar day, so credits refill at their midnight, not UTC's.
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Free credits on this device: perDay each day. A new day, or a missing or damaged entry, starts full. */
function loadCredits(key, perDay = 15) {
  const day = today();
  const s = readJSON(key, null);
  if (!isObj(s) || s.day !== day) return { day, left: perDay };
  const left = num(s.left);
  return { day, left: Number.isFinite(left) ? Math.max(0, Math.min(perDay, Math.floor(left))) : perDay };
}

const saveCredits = (key, state) => !!state && writeJSON(key, { day: state.day, left: state.left });

export { readJSON, writeJSON, removeKey, sanitizeVault, loadVault, loadFavs, loadCredits, saveCredits };
