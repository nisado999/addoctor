import { useEffect, useState } from "react";

/* Light or dark. A saved choice wins; otherwise the device decides. index.html sets the class before first paint. */
const KEY = "addoctor.theme";
const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    // Follow the device until the visitor picks a side.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => { try { if (localStorage.getItem(KEY)) return; } catch (e) { /* follow the device */ } setDark(mq.matches); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const flip = () => { const next = !dark; setDark(next); try { localStorage.setItem(KEY, next ? "dark" : "light"); } catch (e) { /* not saved */ } };
  return (
    <button onClick={flip} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark} title={dark ? "Light mode" : "Dark mode"}
      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
      {dark ? (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
