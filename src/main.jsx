import { createRoot } from "react-dom/client";
import { initTracking } from "./track.js";
import "./styles.css";
import { App } from "./App";

initTracking();
createRoot(document.getElementById("root")).render(<App />);

/* Screens load as separate files. After a publish the old files are gone, so a tab left open would fail to open one:
   reload once to pick up the new build. */
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("addoctor.chunk")) return; // never loop
    sessionStorage.setItem("addoctor.chunk", "1");
  } catch (err) { return; }
  e.preventDefault();
  location.reload();
});

/* The host caches index.html for ten minutes, so a visitor can be handed an old build right after a publish.
   Ask for the page fresh, and if it points at a different script than the one running, reload once. */
if (import.meta.env.PROD) {
  const mine = new URL(import.meta.url).pathname.split("/").pop();
  fetch(`./?fresh=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.text())
    .then((html) => {
      const m = html.match(/assets\/(index-[\w-]+\.js)/);
      if (!m || m[1] === mine) return;
      try {
        if (sessionStorage.getItem("addoctor.reloaded") === m[1]) return; // never loop
        sessionStorage.setItem("addoctor.reloaded", m[1]);
      } catch (e) { return; }
      location.replace(`${location.pathname}?v=${Date.now()}${location.hash}`);
    })
    .catch(() => {});
}
