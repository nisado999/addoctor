import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "./data";
import { Icon, TemplateImage } from "./ui";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import { HeroBackdrop } from "./heroBg.jsx";
import Counter from "./components/bits/Counter.jsx";
import Magnet from "./components/bits/Magnet/Magnet.jsx";
import { useGSAP } from "@gsap/react";
import { scrollAway } from "./motion.js";

/* The Explore header: the pitch on the left, a fanned 3D stack of real templates on the right.
   The stack leans toward the pointer. Its slow float stops while the hero is off screen.
   Phones get a swipeable strip of templates under the pitch instead of the stack. */

const PICKS = TEMPLATES.filter((t) => t.type !== "video" && t.trending && TEMPLATE_IMGS[t.id]).slice(0, 5);
const STRIP = TEMPLATES.filter((t) => t.type !== "video" && t.trending && TEMPLATE_IMGS[t.id]).slice(0, 8);
const VIDEOS = TEMPLATES.filter((t) => t.type === "video").length;
const NICHES = new Set(TEMPLATES.map((t) => t.category)).size;
const FAN = [
  { x: "-66%", y: "12%", z: "-130px", r: "-10deg" },
  { x: "-33%", y: "2%", z: "-50px", r: "-5deg" },
  { x: "0%", y: "-2%", z: "50px", r: "0deg" },
  { x: "33%", y: "5%", z: "-40px", r: "5deg" },
  { x: "62%", y: "16%", z: "-120px", r: "10deg" },
];
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/* index.html paints a static copy of this screen before the scripts arrive. When the hero replaces that copy, it
   must not fade in again from nothing, so its entrance plays only when Explore is opened later. */
let fromShell = typeof document !== "undefined" && !!document.querySelector("[data-shell]");

const WIDE = "(min-width: 768px)"; // Tailwind's md, where the stack replaces the strip
const wideNow = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(WIDE).matches;

function Hero({ onExamine, onBrowse, onPick, onSpy }) {
  const ref = useRef(null);
  const [calm] = useState(() => { const c = fromShell; fromShell = false; return c; });
  // Only the layout on screen is rendered, so a phone never downloads the stack's photos and a desktop never the strip's.
  const [wide, setWide] = useState(wideNow);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    if (m.addEventListener) m.addEventListener("change", on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); else m.removeListener(on); };
  }, []);
  useGSAP(() => scrollAway(ref.current), { scope: ref });
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
    <section ref={ref} aria-labelledby="hero-title" className={`hero relative overflow-hidden rounded-[28px] ${calm ? "hero-calm" : ""}`}>
      <HeroBackdrop />
      {/* A white wash on the reading side keeps the headline crisp over the moving colour. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-white/60 to-white/0 md:via-white/30" aria-hidden="true" />

      <div className="relative grid items-center gap-8 px-5 pb-10 pt-7 sm:px-9 sm:pb-14 sm:pt-11 md:min-h-[540px] md:grid-cols-[1.12fr_1fr] lg:px-12 lg:pt-14 xl:min-h-[600px]">
        <div className="min-w-0">
          <p className="hero-up glass inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-[0_0_0_1px_rgba(21,20,18,.08),0_4px_14px_-6px_rgba(21,20,18,.18)]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-50"><span className="hero-dot h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /></span>
            <span className="shiny">The ad creative clinic</span>
          </p>
          <h1 id="hero-title" className="hero-up hero-title mt-5 text-[40px] leading-[.98] text-slate-950 sm:text-[56px] lg:text-[64px] xl:text-[76px]" style={{ "--d": "60ms" }}>
            Ads that stop the scroll, <span className="hero-ink">diagnosed and rebuilt.</span>
          </h1>
          <p className="hero-up mt-5 max-w-[30rem] text-[15px] leading-relaxed text-slate-600 sm:text-[17px]" style={{ "--d": "120ms" }}>
            Spy on what a competitor runs, start from a proven direct-response format, and make a new ad in its style with your own product. Then examine any ad for conversion leaks.
          </p>
          <div className="hero-up mt-7 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3" style={{ "--d": "180ms" }}>
            {/* React Bits Magnet: the main button leans toward a nearby pointer (mouse only, still for reduced motion). */}
            <Magnet padding={70} magnetStrength={3} wrapperClassName="col-span-2 sm:col-span-1" style={{ display: "block" }} innerClassName="w-full">
              <button onClick={onExamine} className={`btn-ink inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold active:scale-[.97] ${ring}`}>
                <Icon.Stethoscope className="h-4 w-4" /> Examine an ad <Icon.Arrow className="h-4 w-4 opacity-60" />
              </button>
            </Magnet>
            <button onClick={onBrowse} className={`btn-soft inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-slate-900 hover:text-blue-700 active:scale-[.97] sm:px-5 ${ring}`}>
              Browse templates <Icon.Arrow className="hidden h-4 w-4 rotate-90 sm:block" />
            </button>
            {onSpy && (
              <button onClick={onSpy} className={`btn-soft inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-slate-900 hover:text-blue-700 active:scale-[.97] sm:px-5 ${ring}`}>
                <Icon.Eye className="h-4 w-4" /> Spy on a competitor
              </button>
            )}
          </div>

          {!wide && (
            <ul role="list" aria-label="Popular templates" className="hero-up -mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 py-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden" style={{ "--d": "220ms" }}>
              {STRIP.map((t, i) => (
                <li key={t.id} className="w-24 shrink-0 snap-start">
                  <button onClick={() => (onPick ? onPick(t) : onBrowse())} className="group block w-full rounded-xl text-left focus:outline-none">
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-slate-100 card-frame transition group-active:scale-[.97] group-focus-visible:ring-2 group-focus-visible:ring-blue-600 group-focus-visible:ring-offset-2">
                      <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} lazy={i > 2} priority={i === 0} />
                    </span>
                    <span className="mt-1.5 block truncate text-xs font-semibold text-slate-700">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ul role="list" aria-label="In the gallery" className="hero-up mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-900/[.07] pt-6 sm:mt-10 sm:gap-x-10" style={{ "--d": "240ms" }}>
            {[[TEMPLATES.length, "templates"], [VIDEOS, "video clips"], [NICHES, "niches"]].map(([n, l]) => (
              <li key={l} className="flex flex-col">
                <span className="hero-title text-[28px] leading-none tabular-nums text-slate-950 sm:text-[34px]"><Counter value={n} fontSize="1em" fade={0.15} duration={1.1} stagger={0.08} /></span>
                <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{l}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hero-stage relative hidden h-[340px] md:block lg:h-[400px] xl:h-[440px]" aria-hidden="true">
          {wide && (
            <div className="hero-fan absolute inset-0">
              {PICKS.map((t, i) => (
                <div key={t.id} className="hero-card" style={{ "--x": FAN[i].x, "--y": FAN[i].y, "--z": FAN[i].z, "--r": FAN[i].r, "--n": i }}>
                  <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} lazy={false} priority={i === 2} className="" />
                </div>
              ))}
              <div className="hero-chip" style={{ "--x": "2%", "--y": "66%", "--z": "150px", "--n": 5 }}>
                <svg viewBox="0 0 40 40" className="h-9 w-9 -rotate-90">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#E7E4DE" strokeWidth="4" />
                  <circle className="hero-ring" cx="20" cy="20" r="16" fill="none" stroke="#10B981" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="100" />
                </svg>
                <span><b>Healthy</b>Ad check-up</span>
              </div>
              <div className="hero-chip" style={{ "--x": "40%", "--y": "12%", "--z": "120px", "--n": 6 }}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white"><Icon.Check className="h-3.5 w-3.5" /></span>
                <span><b>Hook · Offer · CTA</b>All checked</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export { Hero };
