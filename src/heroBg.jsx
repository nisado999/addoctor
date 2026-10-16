import { lazy, Suspense } from "react";

/* The animated backdrop behind the Explore hero (React Bits, WebGL). Each one loads in its own small file after the
   page is up, pauses while off screen or in a background tab, and holds still for people who ask for less motion.
   Colours follow the brand blues on a light page. "?bg=name" previews another one. */

const BGS = {
  silk: { load: () => import("./components/bits/Silk.jsx"), props: { lightMode: true, color: "#9cc3ff", sheenColor: "#ffffff", speed: 3, scale: 1.1, glow: 0.25, noiseIntensity: 0.6, rotation: 0.2 } },
  grainient: { load: () => import("./components/bits/Grainient.jsx"), props: { lightMode: true, colors: ["#ffffff", "#eef4ff", "#c7dbff", "#7fa8ff", "#2f6bff"], angle: 35, speed: 0.6, grainAmount: 0.05, flow: 0.7 } },
  lines: { load: () => import("./components/bits/FloatingLines.jsx"), props: { lightMode: true, linesGradient: ["#93c5fd", "#2563eb", "#6366f1"], lineCount: 8, lineDistance: 7, animationSpeed: 0.6, glow: 0.6, parallax: true } },
  waves: { load: () => import("./components/bits/LineWaves.jsx"), props: { lightMode: true, color1: "#2563eb", color2: "#60a5fa", color3: "#818cf8", speed: 0.2, lineCount: 56, glow: 0.4, edgeFade: 0.3 } },
  aurora: { load: () => import("./components/bits/Aurora.jsx"), props: { lightMode: true, colorStops: ["#60a5fa", "#a5b4fc", "#2563eb"], amplitude: 0.9, blend: 0.6, speed: 0.6 } },
};
export const DEFAULT_BG = "grainient";

const pick = () => {
  try {
    const q = new URLSearchParams(window.location.search).get("bg");
    if (q && BGS[q]) return q;
  } catch { /* no window */ }
  return DEFAULT_BG;
};

const cache = {};
const comp = (name) => (cache[name] ||= lazy(BGS[name].load));

/* WebGL can be missing (old devices, some privacy modes); then the hero simply stays white. */
let gl;
const hasGL = () => {
  if (gl === undefined) {
    try { const c = document.createElement("canvas"); gl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { gl = false; }
  }
  return gl;
};

export function HeroBackdrop({ className = "" }) {
  if (typeof window === "undefined" || !hasGL()) return null;
  const name = pick();
  const Bg = comp(name);
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <Suspense fallback={null}><Bg {...BGS[name].props} /></Suspense>
    </div>
  );
}
