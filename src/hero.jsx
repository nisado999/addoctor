import { useEffect, useRef } from "react";
import { TEMPLATES } from "./data";
import { Icon } from "./ui";
import { TEMPLATE_IMGS } from "./templateImgs.js";

/* The Explore header: the pitch on the left, a fanned 3D stack of real templates on the right.
   The stack leans toward the pointer. Its slow float stops while the hero is off screen. */

const PICKS = TEMPLATES.filter((t) => t.type !== "video" && t.trending && TEMPLATE_IMGS[t.id]).slice(0, 5);
const VIDEOS = TEMPLATES.filter((t) => t.type === "video").length;
const NICHES = new Set(TEMPLATES.map((t) => t.category)).size;
const FAN = [
  { x: "-66%", y: "12%", z: "-130px", r: "-10deg" },
  { x: "-33%", y: "2%", z: "-50px", r: "-5deg" },
  { x: "0%", y: "-2%", z: "50px", r: "0deg" },
  { x: "33%", y: "5%", z: "-40px", r: "5deg" },
  { x: "62%", y: "16%", z: "-120px", r: "10deg" },
];

function Hero({ onExamine, onBrowse }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => el.toggleAttribute("data-live", e.isIntersecting), { threshold: 0.05 }) : null;
    if (io) io.observe(el); else el.setAttribute("data-live", "");
    const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
    const lean = mm("(hover: hover) and (pointer: fine)") && !mm("(prefers-reduced-motion: reduce)");
    let raf = 0, x = 0, y = 0;
    const move = (e) => {
      x = e.clientX; y = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--hx", ((x - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty("--hy", ((y - r.top) / r.height - 0.5).toFixed(3));
      });
    };
    const leave = () => { el.style.setProperty("--hx", "0"); el.style.setProperty("--hy", "0"); };
    if (lean) { el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave); }
    return () => {
      if (io) io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <section ref={ref} className="hero relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
      <svg className="hero-pulse pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full" viewBox="0 0 1200 96" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength="1" d="M0 60h330l22-34 26 62 30-80 28 70 18-18h250l20-26 22 44 26-58 24 40h404" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="relative grid items-center gap-6 px-5 pb-12 pt-6 sm:px-8 sm:pb-16 sm:pt-9 md:grid-cols-[1.15fr_1fr] lg:px-10">
        <div className="min-w-0">
          <p className="hero-up inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700 shadow-sm">
            <span className="hero-dot h-1.5 w-1.5 rounded-full bg-emerald-500" /> The ad creative clinic
          </p>
          <h1 className="hero-up hero-title mt-4 text-[32px] leading-[1.04] text-slate-900 sm:text-[42px] lg:text-[48px]" style={{ "--d": "60ms" }}>
            Ads that stop the scroll, <span className="hero-ink">diagnosed and rebuilt.</span>
          </h1>
          <p className="hero-up mt-4 max-w-md text-[15px] leading-relaxed text-slate-600" style={{ "--d": "120ms" }}>
            Pick a proven direct-response format, add your logo, or make a new one in its style. Then examine any ad for conversion leaks.
          </p>
          <div className="hero-up mt-6 flex flex-wrap items-center gap-2.5" style={{ "--d": "180ms" }}>
            <button onClick={onExamine} className="btn-glow inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-b from-blue-500 to-blue-600 px-5 text-sm font-semibold text-white transition active:scale-[.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30">
              <Icon.Stethoscope className="h-4 w-4" /> Examine an ad
            </button>
            <button onClick={onBrowse} className="hidden min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 sm:inline-flex text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700 active:scale-[.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
              Browse templates <Icon.Arrow className="h-4 w-4 rotate-90" />
            </button>
          </div>
          <dl className="hero-up mt-6 flex flex-wrap gap-x-5 gap-y-2 sm:mt-7 sm:gap-x-7" style={{ "--d": "240ms" }}>
            {[[TEMPLATES.length, "templates"], [VIDEOS, "video clips"], [NICHES, "niches"]].map(([n, l]) => (
              <div key={l} className="flex items-baseline gap-1.5">
                <dd className="hero-title text-2xl tabular-nums text-slate-900">{n}</dd>
                <dt className="text-xs font-medium text-slate-500">{l}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div className="hero-stage relative hidden h-[300px] md:block lg:h-[340px]" aria-hidden="true">
          <div className="hero-fan absolute inset-0">
            {PICKS.map((t, i) => (
              <div key={t.id} className="hero-card" style={{ "--x": FAN[i].x, "--y": FAN[i].y, "--z": FAN[i].z, "--r": FAN[i].r, "--n": i }}>
                <img src={TEMPLATE_IMGS[t.id]} alt="" draggable="false" decoding="async" />
              </div>
            ))}
            <div className="hero-chip" style={{ "--x": "2%", "--y": "66%", "--z": "150px", "--n": 5 }}>
              <svg viewBox="0 0 40 40" className="h-9 w-9 -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#E2E8F0" strokeWidth="4" />
                <circle className="hero-ring" cx="20" cy="20" r="16" fill="none" stroke="#10B981" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="100" />
              </svg>
              <span><b>Healthy</b>Ad check-up</span>
            </div>
            <div className="hero-chip" style={{ "--x": "40%", "--y": "12%", "--z": "120px", "--n": 6 }}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"><Icon.Check className="h-3.5 w-3.5" /></span>
              <span><b>Hook · Offer · CTA</b>All checked</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { Hero };
