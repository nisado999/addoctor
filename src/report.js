/* Crash reports. When something breaks for a visitor, the owner hears about it: the error goes into the dataLayer
   (seen only if the visitor accepted analytics) and, when the AdDoctor server is set up, to its /log endpoint.
   A report says what broke and where, never who the visitor is or what they typed. */

import { SPY_API } from "./shared.js";
import { track } from "./track.js";

const MAX_REPORTS = 5;   // per page load, so one fault in a loop cannot flood the server
const seen = new Set();

// Which publish crashed: the running index-*.js file name, or "dev" under the dev server.
function buildName() {
  try {
    for (const s of document.scripts) {
      const m = /\/(index-[\w-]+\.js)(?:[?#]|$)/.exec(s.src || "");
      if (m) return m[1];
    }
  } catch (e) { /* no document */ }
  return "dev";
}

// The screen is in the hash ("#vault"). Anything else there could carry a token, so it is left out.
function pagePath() {
  const h = location.hash;
  return location.pathname + (/^#[\w-]{0,40}$/.test(h) ? h : h ? "#…" : "");
}

function asError(err) {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && typeof err.message === "string") return err;
  let text = "";
  try { text = typeof err === "string" ? err : JSON.stringify(err); } catch (e) { text = String(err); }
  return new Error(text || "Unknown error");
}

function send(data) {
  const url = SPY_API + "/log";
  const body = JSON.stringify(data);
  try {
    // A plain string goes as text/plain, which needs no CORS preflight and survives the page closing.
    if (navigator.sendBeacon && navigator.sendBeacon(url, body)) return;
  } catch (e) { /* fall through to fetch */ }
  try {
    fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  } catch (e) { /* nothing else to try */ }
}

/* Never throws: reporting a crash must not cause another one. */
function reportError(err, ctx = {}) {
  try {
    const e = asError(err);
    const message = String(e.message || e.name || "Unknown error").slice(0, 300);
    if (seen.size >= MAX_REPORTS || seen.has(message)) return;
    seen.add(message);
    const where = String((ctx && ctx.where) || "app").slice(0, 60);
    track("app_error", { error_message: message, error_where: where });
    if (!SPY_API) return;
    send({ message, stack: String(e.stack || "").slice(0, 800), where, path: pagePath(), build: buildName(), ua: String(navigator.userAgent || "").slice(0, 300) });
  } catch (e) { /* give up quietly */ }
}

// Errors that say nothing about a fault in AdDoctor: a stopped request, a browser layout notice, a script from
// another site that the browser will not describe ("Script error.").
function noise(err) {
  if (!err) return true;
  const name = err.name || "", msg = String(err.message || err);
  return name === "AbortError" || err.code === "cancelled" || /ResizeObserver loop/i.test(msg) || /^Script error\.?$/i.test(msg);
}

let installed = false;
/* Called once at start-up: faults nothing else catches still get reported. */
function installGlobalHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    const err = e.error || (e.message ? new Error(e.message) : null);
    if (!noise(err)) reportError(err, { where: "window" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (!noise(e.reason)) reportError(e.reason, { where: "promise" });
  });
}

export { reportError, installGlobalHandlers };
