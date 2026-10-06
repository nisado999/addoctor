/* Small helpers used by several screens. Kept apart so each screen can load on demand. */

const TONE = {
  good: { text: "text-emerald-600", bg: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", hex: "#10B981" },
  warn: { text: "text-amber-600", bg: "bg-amber-500", chip: "bg-amber-50 text-amber-700", hex: "#F59E0B" },
  bad: { text: "text-rose-600", bg: "bg-rose-500", chip: "bg-rose-50 text-rose-700", hex: "#F43F5E" },
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

const inputKey = (i) => JSON.stringify([i.brand.trim(), i.headline.trim(), i.copy.trim(), i.type, i.asset ? [i.asset.name, i.asset.w, i.asset.h, i.asset.lumMean, i.asset.lumStd] : null]);

const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 sm:text-sm placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10";

// Set VITE_ADDOCTOR_API (and optionally VITE_ADDOCTOR_KEY) in .env, see README.
const SPY_API_RAW = import.meta.env.VITE_ADDOCTOR_API || "";
const SPY_API_KEY_RAW = import.meta.env.VITE_ADDOCTOR_KEY || "";
const SPY_API = (typeof window !== "undefined" && window.ADDOCTOR_API) || (SPY_API_RAW.indexOf("__") === 0 ? "" : SPY_API_RAW.replace(/\/+$/, ""));
const SPY_KEY = (typeof window !== "undefined" && window.ADDOCTOR_KEY) || (SPY_API_KEY_RAW.indexOf("__") === 0 ? "" : SPY_API_KEY_RAW);

export { TONE, copyText, inputKey, field, SPY_API, SPY_KEY };
