/* The one way screens talk to the AdDoctor server. Every call gets a timeout, the signed-in visitor's token, a few
   retries where they are safe, and errors that read well on screen. */

import { SPY_API, SPY_KEY } from "./shared.js";

const MESSAGES = {
  no_api: "This copy of AdDoctor has no server set up, so this feature is off.",
  cancelled: "Stopped.",
  timeout: "The AdDoctor server took too long to answer. Try again.",
  offline: "You're offline. Check your connection and try again.",
  network: "Couldn't reach the AdDoctor server. Check your connection and try again.",
  rate_limited: "The AdDoctor server is busy. Try again in a minute.",
  daily_cap: "Today's limit for this feature has been reached. Try again tomorrow.",
  signin_required: "Sign in to use this feature.",
  owner_only: "Only the site owner can use this.",
  server: "The AdDoctor server had a problem. Try again in a moment.",
  bad_response: "The AdDoctor server sent an answer this page can't read. Try again.",
  api: "The AdDoctor server couldn't do that.",
};

class ApiError extends Error {
  constructor(code, message, extra) {
    super(message || MESSAGES[code] || MESSAGES.api);
    this.name = "ApiError";
    this.code = code;
    if (extra) Object.assign(this, extra);   // status, retryAfter, data (the server's JSON, when there was one)
  }
}

let tokenFn = null;
/* auth.js hands over a function that resolves to the visitor's access token, or "" when signed out. */
function setTokenProvider(fn) { tokenFn = typeof fn === "function" ? fn : null; }

const apiReady = () => !!SPY_API;

const isCancel = (err) => !!err && (err.code === "cancelled" || err.name === "AbortError");

/* The server's answer must be an object with these keys, or the screen would draw garbage. A key ending in "[]"
   must be an array: need(out, ["ads[]", "brand"]). */
function need(obj, keys) {
  if (!obj || typeof obj !== "object") throw new ApiError("bad_response");
  [].concat(keys || []).forEach((k) => {
    const list = k.endsWith("[]");
    const v = obj[list ? k.slice(0, -2) : k];
    if (v === undefined || (list && !Array.isArray(v))) throw new ApiError("bad_response");
  });
  return obj;
}

// A server message is shown only when it reads like a sentence. Bare codes such as "unauthorized" are not.
const human = (m) => typeof m === "string" && m.length <= 300 && /^[A-Z0-9"'(]/.test(m) && m.includes(" ");

// Retry-After is either seconds or a date.
function retryAfter(r, j) {
  const h = r.headers.get("Retry-After");
  if (h) {
    const s = Number(h);
    if (Number.isFinite(s)) return Math.max(0, Math.ceil(s));
    const t = Date.parse(h);
    if (!Number.isNaN(t)) return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }
  return j && Number.isFinite(j.retryAfter) ? Math.max(0, Math.ceil(j.retryAfter)) : undefined;
}

/* Turns a failed response into an ApiError. The new server sends { error, code }; the older one only { error }. */
function toError(r, j) {
  const status = r.status;
  const code = j && typeof j.code === "string" ? j.code : "";
  const said = j && human(j.error) ? j.error : "";
  const extra = { status, data: j || undefined };
  if (code === "signin_required") return new ApiError("signin_required", said, extra);
  if (code === "owner_only") return new ApiError("owner_only", said, extra);
  if (code === "daily_cap") return new ApiError("daily_cap", said, extra);
  if (status === 429 || code === "rate_limited") {
    const wait = retryAfter(r, j);
    const msg = said || (wait != null && wait < 120 ? `The AdDoctor server is busy. Try again in ${Math.max(1, wait)} seconds.` : "");
    return new ApiError("rate_limited", msg, { ...extra, retryAfter: wait });
  }
  // The older server passed provider errors straight through, so a 5xx message is shown only from the new one.
  if (status >= 500) return new ApiError("server", code ? said : "", extra);
  if (status === 404 && !said) return new ApiError("api", "The AdDoctor server has not been updated for this yet.", extra);
  if (status === 413 && !said) return new ApiError("api", "That is too large to send. Try a smaller file.", extra);
  return new ApiError("api", said || `The AdDoctor server couldn't do that (error ${status}).`, extra);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new ApiError("cancelled"));
    const id = setTimeout(() => { if (signal) signal.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(id); reject(new ApiError("cancelled")); };
    if (signal) signal.addEventListener("abort", stop, { once: true });
  });
}

// The token, or "" when signed out or when the sign-in library is slow or broken: the call then goes out anonymous.
async function token() {
  if (!tokenFn) return "";
  let timer = 0;
  try {
    const t = await Promise.race([Promise.resolve().then(tokenFn), new Promise((r) => { timer = setTimeout(() => r(""), 4000); })]);
    return typeof t === "string" ? t : "";
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

async function once(url, init, signal, timeout) {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
  const stop = () => ctrl.abort();
  if (signal) signal.addEventListener("abort", stop, { once: true });
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const raw = await r.text();   // read inside the timeout too: a body can stall as well as the headers
    let j = null, parsed = false;
    if (raw.trim()) { try { j = JSON.parse(raw); parsed = true; } catch (e) { /* not JSON */ } }
    if (!r.ok) throw toError(r, j);
    if (raw.trim() && !parsed) throw new ApiError("bad_response", "", { status: r.status });
    return parsed ? j : {};   // 204 and empty bodies come back as {}
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (signal && signal.aborted) throw new ApiError("cancelled");
    if (timedOut) throw new ApiError("timeout");
    throw new ApiError(offline() ? "offline" : "network", "", { cause: err });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", stop);
  }
}

const BACKOFF = [800, 2000];
const TRANSIENT = [502, 503, 504];

/* Calls the server and resolves to its JSON. Throws ApiError, whose .message can go straight on screen.
   Network errors and 502/503/504 are retried for GETs (or when the caller passes retries for a call that is safe to
   repeat); any call is retried once after a 429 that asks for a short wait. */
async function apiFetch(path, opts = {}) {
  const { body, signal, headers } = opts;
  const method = opts.method || (body !== undefined ? "POST" : "GET");
  const timeout = opts.timeout || 90000;
  const retries = opts.retries != null ? opts.retries : method === "GET" ? 2 : 0;
  if (!SPY_API) throw new ApiError("no_api");
  if (signal && signal.aborted) throw new ApiError("cancelled");

  const h = { ...(SPY_KEY ? { "X-App-Key": SPY_KEY } : {}) };
  let payload;
  if (body !== undefined) {
    payload = typeof body === "string" || (typeof FormData !== "undefined" && body instanceof FormData) ? body : JSON.stringify(body);
    if (typeof payload === "string") h["Content-Type"] = "application/json";
  }
  const t = await token();
  if (signal && signal.aborted) throw new ApiError("cancelled");
  if (t) h.Authorization = "Bearer " + t;
  const init = { method, headers: { ...h, ...headers }, body: payload };

  let tries = 0, waited429 = false;
  for (;;) {
    try {
      return await once(SPY_API + path, init, signal, timeout);
    } catch (err) {
      let wait = -1;
      if (err.code === "rate_limited" && !waited429 && err.retryAfter != null && err.retryAfter <= 20) {
        waited429 = true;
        wait = Math.max(500, err.retryAfter * 1000);
      } else if (tries < retries && (err.code === "network" || (err.code === "server" && TRANSIENT.includes(err.status)))) {
        wait = BACKOFF[Math.min(tries, BACKOFF.length - 1)];
        tries += 1;
      }
      if (wait < 0) {
        if (err.code === "signin_required" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("addoctor:signin-required"));
        throw err;
      }
      await sleep(wait, signal);
    }
  }
}

export { apiFetch, ApiError, need, isCancel, setTokenProvider, apiReady };
