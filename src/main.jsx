import { createRoot } from "react-dom/client";
import { initTracking } from "./track.js";
import { installGlobalHandlers } from "./report.js";
import { ErrorBoundary } from "./boundary.jsx";
import "./styles.css";
import { App } from "./App";

initTracking();
installGlobalHandlers();

/* The ?v= that a reload for a new build adds has done its job once the page is here, so it leaves the address. */
const params = new URLSearchParams(location.search);
if (params.has("v")) {
  params.delete("v");
  const rest = params.toString();
  try { history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash); } catch (e) { /* keep the address */ }
}

/* A screen that fails to load is retried, and if it still fails only that screen says so (boundary.jsx), so a
   failed file never reloads the page under the visitor. */
createRoot(document.getElementById("root")).render(
  <ErrorBoundary variant="page" label="app">
    <App />
  </ErrorBoundary>
);

/* The host caches index.html for ten minutes, so a visitor can be handed an old build right after a publish.
   Ask for the page fresh, and if it points at a different script than the one running, reload once, but only in the
   first few seconds and before the visitor has done anything. Later, the page is left alone and only marked stale.
   Never on a return from sign-in, whose one-time code must reach the sign-in library. */
if (import.meta.env.PROD && !params.has("code") && !params.has("error_description")) {
  const started = Date.now();
  let touched = false;
  const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"];
  const touch = () => { touched = true; };
  INPUT.forEach((t) => window.addEventListener(t, touch, { capture: true, passive: true }));
  const done = () => INPUT.forEach((t) => window.removeEventListener(t, touch, { capture: true }));
  const mine = new URL(import.meta.url).pathname.split("/").pop();
  fetch(`./?fresh=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.text())
    .then((html) => {
      done();
      const m = html.match(/assets\/(index-[\w-]+\.js)/);
      if (!m || m[1] === mine) return;
      if (touched || Date.now() - started > 4000) { window.__addoctorStale = true; return; }
      try {
        if (sessionStorage.getItem("addoctor.reloaded") === m[1]) { window.__addoctorStale = true; return; } // never loop
        sessionStorage.setItem("addoctor.reloaded", m[1]);
      } catch (e) { window.__addoctorStale = true; return; }
      const keep = new URLSearchParams(location.search);
      keep.set("v", Date.now());
      location.replace(`${location.pathname}?${keep}${location.hash}`);
    })
    .catch(done);
}
