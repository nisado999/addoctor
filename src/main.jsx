import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")).render(<App />);

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
