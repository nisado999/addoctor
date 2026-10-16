import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Motion for the whole site: smooth scrolling (Lenis) driving GSAP's ScrollTrigger, and a scroll reveal for anything
   marked data-reveal (added at any time, e.g. as the gallery loads more). People who ask their system for less
   motion get the normal browser scroll and no reveals. */

gsap.registerPlugin(ScrollTrigger);

const reduce = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lenis = null;

export function initMotion() {
  if (typeof window === "undefined" || lenis || reduce()) return;
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    allowNestedScroll: true,   // lists, dialogs and side panels keep their own scroll
    prevent: (node) => !!(node && node.closest && node.closest("[role='dialog'], [data-lenis-prevent], textarea, select")),
  });
  // Dialogs and full-screen panels hold the page still by setting overflow: hidden on <body> (several screens do it
  // their own way). Smooth scrolling would still move the page, so it pauses whenever the body is locked.
  const sync = () => { if (document.body.style.overflow === "hidden") lenis.stop(); else lenis.start(); };
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["style"] });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  startReveals();
}

export const scrollToEl = (el, offset = -72) => {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset });
  else el.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "start" });
};

/* data-reveal="up" (default) | "fade" | "scale". data-reveal-delay in seconds. Elements next to each other that enter
   together are staggered, so a row of cards ripples in rather than popping. */
function startReveals() {
  const seen = new WeakSet();
  let queue = [];
  let raf = 0;
  const flush = () => {
    raf = 0;
    const batch = queue; queue = [];
    const pos = new Map(batch.map((el) => [el, el.getBoundingClientRect()]));
    batch.sort((a, b) => pos.get(a).top - pos.get(b).top || pos.get(a).left - pos.get(b).left);
    batch.forEach((el, i) => {
      const kind = el.getAttribute("data-reveal") || "up";
      const delay = Number(el.getAttribute("data-reveal-delay") || 0) + Math.min(i, 8) * 0.06;
      gsap.to(el, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: kind === "fade" ? 0.6 : 0.8, delay, ease: "expo.out", clearProps: "opacity,transform,filter" });
    });
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      queue.push(e.target);
    });
    if (queue.length && !raf) raf = requestAnimationFrame(flush);
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  const prime = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    // On screen in the first moment of the page: left alone, so nothing visible blinks out and back in.
    const r = el.getBoundingClientRect();
    if (performance.now() < 1500 && r.top < window.innerHeight && r.bottom > 0) return;
    const kind = el.getAttribute("data-reveal") || "up";
    gsap.set(el, { opacity: 0, y: kind === "up" ? 28 : 0, scale: kind === "scale" ? 0.96 : 1, filter: kind === "fade" ? "none" : "blur(6px)" });
    io.observe(el);
  };
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute("data-reveal")) prime(root);
    root.querySelectorAll("[data-reveal]").forEach(prime);
  };
  scan(document.body);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
}
