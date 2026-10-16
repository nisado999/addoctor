import { lazy, Suspense } from "react";

/* The animated backdrop behind the Explore hero (React Bits, WebGL). Each one loads in its own small file after the
   page is up, pauses while off screen or in a background tab, and holds still for people who ask for less motion.
   The default lays an interactive dot field (dots swell toward the pointer, a click sends a ripple) over a soft
   pearl iridescence that is masked to the right, so the headline always sits on clean white. "?bg=name" previews
   another one. */

const BGS = {
  iris: { load: () => import("./components/bits/Iridescence.jsx"), props: { color: [0.93, 0.95, 1], speed: 0.45, amplitude: 0.06, scale: 1.1, detail: 7, warp: 0.9, saturation: 0.85, brightness: 1.32, contrast: 0.92, sheen: 0.45, stir: 0.4, clickSwirl: true, mouseReact: true, resolution: 0.75 } },
  silk: { load: () => import("./components/bits/Silk.jsx"), props: { lightMode: true, color: "#b9c9ff", sheenColor: "#ffffff", speed: 3, scale: 1.1, glow: 0.25, noiseIntensity: 0.6, rotation: 0.2 } },
  grainient: { load: () => import("./components/bits/Grainient.jsx"), props: { lightMode: true, colors: ["#ffffff", "#f1f5ff", "#cad7ff", "#7a9bff", "#2b59ff"], angle: 35, speed: 0.6, grainAmount: 0.05, flow: 0.7 } },
  lines: { load: () => import("./components/bits/FloatingLines.jsx"), props: { lightMode: true, linesGradient: ["#a7bdff", "#2b59ff", "#7c5cff"], lineCount: 8, lineDistance: 7, animationSpeed: 0.6, glow: 0.6, parallax: true } },
  waves: { load: () => import("./components/bits/LineWaves.jsx"), props: { lightMode: true, color1: "#2b59ff", color2: "#7a9bff", color3: "#a78bfa", speed: 0.2, lineCount: 56, glow: 0.4, edgeFade: 0.3 } },
  aurora: { load: () => import("./components/bits/Aurora.jsx"), props: { lightMode: true, colorStops: ["#7a9bff", "#c4b5fd", "#2b59ff"], amplitude: 0.9, blend: 0.6, speed: 0.6 } },
};
export const DEFAULT_BG = "iris";

const DOTS = { load: () => import("./components/bits/DotGrid.jsx"), props: { dotSize: 3, gap: 20, baseColor: "#cfcac1", activeColor: "#2b59ff", proximity: 150, strength: 1.1, swell: 1.2, stretch: 0.6, glow: 0.35, shockRadius: 280, shockStrength: 4, opacity: 0.95 } };

const pick = () => {
  try {
    const q = new URLSearchParams(window.location.search).get("bg");
    if (q && BGS[q]) return q;
  } catch { /* no window */ }
  return DEFAULT_BG;
};

const cache = {};
const comp = (name, entry) => (cache[name] ||= lazy(entry.load));

/* WebGL can be missing (old devices, some privacy modes); then the hero keeps its CSS light wash. */
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
  const Bg = comp(name, BGS[name]);
  const Dots = comp("dots", DOTS);
  return (
    <div className={`hero-bg pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <div className="hero-bg-wash absolute inset-0"><Suspense fallback={null}><Bg {...BGS[name].props} /></Suspense></div>
      <div className="hero-bg-dots absolute inset-0"><Suspense fallback={null}><Dots {...DOTS.props} /></Suspense></div>
    </div>
  );
}
