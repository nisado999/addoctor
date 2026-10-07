import { useEffect, useRef, useState, memo } from "react";
import { TEMPLATES } from "./data";
import { TEMPLATE_IMGS, TEMPLATE_VIDS } from "./templateImgs.js";
import { useDialog } from "./dialog.jsx";

const LOGO_SRC = import.meta.env.BASE_URL + "logo.png";

/* ------------------------------- Icons --------------------------------- */

const svgBase = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
const Icon = {
  Plus: (p) => (<svg {...svgBase} strokeWidth="2.2" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  Grid: (p) => (<svg {...svgBase} {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.8" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.8" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.8" /></svg>),
  Stethoscope: (p) => (<svg {...svgBase} {...p}><path d="M5 3v5a5 5 0 0 0 10 0V3" /><path d="M10 13v2a5 5 0 0 0 10 0v-1" /><circle cx="20" cy="11.5" r="2" /></svg>),
  Video: (p) => (<svg {...svgBase} {...p}><rect x="2.5" y="5.5" width="13" height="13" rx="2.5" /><path d="M15.5 10.2 21 7v10l-5.5-3.2z" /></svg>),
  Image: (p) => (<svg {...svgBase} {...p}><rect x="3" y="3.5" width="18" height="17" rx="2.5" /><circle cx="8.5" cy="9" r="1.8" /><path d="m21 15.5-5-5-9.5 10" /></svg>),
  Bookmark: (p) => (<svg {...svgBase} {...p}><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" /></svg>),
  Search: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>),
  Bolt: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M13.2 2.5 4.5 13.6h6.2l-1 7.9 8.8-11.2h-6.3z" /></svg>),
  Badge: (p) => (<svg {...svgBase} {...p}><path d="M12 2.8 19.5 6v5.6c0 4.4-3.2 8.2-7.5 9.6-4.3-1.4-7.5-5.2-7.5-9.6V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>),
  Arrow: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>),
  Close: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>),
  Flame: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12.6 2.3c.3 3-1.3 4.6-2.8 6.1C8.4 9.8 7 11.2 7 13.8a5 5 0 0 0 10 0c0-1.7-.7-3-1.5-4 .1 1.3-.4 2.4-1.4 2.9.6-3.3-.3-7.8-1.5-10.4z" /></svg>),
  Check: (p) => (<svg {...svgBase} strokeWidth="2.6" {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>),
  Cross: (p) => (<svg {...svgBase} strokeWidth="2.6" {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>),
  Alert: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></svg>),
  Sparkle: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z" /><path d="M19 15.5c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8z" /></svg>),
  Copy: (p) => (<svg {...svgBase} {...p}><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.4" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></svg>),
  Menu: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  Play: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" /></svg>),
  Star: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.2l-5.7 3.1 1.1-6.3L2.8 9.5l6.4-.9z" /></svg>),
  Chevron: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><path d="m6 9 6 6 6-6" /></svg>),
  Trash: (p) => (<svg {...svgBase} {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" /></svg>),
  Wand: (p) => (<svg {...svgBase} {...p}><path d="M15 4.5l4.5 4.5L8 20.5 3.5 16z" /><path d="M13 6.5l4.5 4.5" /><path d="M19 2.5v3M17.5 4h3M6 3v2.5M4.75 4.25h2.5" /></svg>),
  Download: (p) => (<svg {...svgBase} {...p}><path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5" /><path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" /></svg>),
  Eye: (p) => (<svg {...svgBase} {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>),
  Tag: (p) => (<svg {...svgBase} {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.6 7.6a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0L3.8 12.9a1 1 0 0 1-.3-.7z" /><circle cx="8" cy="8" r="1.4" /></svg>),
  Clock: (p) => (<svg {...svgBase} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg>),
  Trophy: (p) => (<svg {...svgBase} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H4.5a2.5 2.5 0 0 0 3 3.6M16 6h3.5a2.5 2.5 0 0 1-3 3.6M12 13v4M8.5 20h7M10 17h4" /></svg>),
  Target: (p) => (<svg {...svgBase} {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>),
  Upload: (p) => (<svg {...svgBase} {...p}><path d="M12 15.5v-11M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" /></svg>),
  Gap: (p) => (<svg {...svgBase} {...p}><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" /><circle cx="12" cy="12" r="2.2" /></svg>),
  Heart: (p) => (<svg {...svgBase} strokeWidth="2" {...p}><path d="M12 20.3s-7.5-4.4-7.5-10a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9c0 5.6-7.5 10-7.5 10z" /></svg>),
  Layout: (p) => (<svg {...svgBase} {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M3.5 9.5h17M10 9.5v11" /></svg>),
};

/* -------------------------------- Media -------------------------------- */

/* Cards show a 360x450 WebP made from each template photo (public/templates/card/<id>.webp), about a quarter of the
   JPEG's weight. The full 600x750 JPEG stays the fallback, and the dialogs keep using it. */
const cardWebp = (src) => (/templates\/[^/]+\.jpg$/.test(src) ? src.replace(/templates\/([^/]+)\.jpg$/, "templates/card/$1.webp") : "");

// The photos carry their ad headline (the video first frames do not), so the alt text says what is written on them.
const altFor = (t) => (t.type !== "video" && t.headline ? `${t.title} ad with the headline "${t.headline}"` : `${t.title} ad`);

/* What shows when a template's media cannot be loaded: an old tab after a publish (files are renamed), or a dropped
   connection. A plain slate panel with the title reads as "missing", where a broken image would read as "broken". */
function MediaFallback({ title, label, compact = false }) {
  if (compact) return <span role="img" aria-label={label || title} className="absolute inset-0 bg-slate-200" />;
  return (
    <span role="img" aria-label={label || title} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-slate-100 to-slate-200 p-4 text-center">
      <Icon.Image className="h-6 w-6 text-slate-400" aria-hidden="true" />
      <span aria-hidden="true" className="line-clamp-3 text-[13px] font-semibold leading-snug text-slate-600">{title}</span>
    </span>
  );
}

/* A template photo: the card WebP first, the JPEG if that fails, then the slate panel. */
function TemplateImage({ src, alt, title, focus, lazy = true, priority = false, compact = false, className = "cr-photo-img" }) {
  const [stage, setStage] = useState(0); // 0: WebP with JPEG fallback, 1: JPEG only, 2: nothing loaded
  const webp = stage === 0 ? cardWebp(src) : "";
  if (!src || stage === 2) return <MediaFallback title={title} label={alt} compact={compact} />;
  const img = (
    <img
      key={stage} src={src} alt={alt} width="360" height="450" draggable="false"
      loading={lazy ? "lazy" : "eager"} decoding="async" fetchpriority={priority ? "high" : undefined}
      onError={() => setStage(webp ? 1 : 2)}
      className={className} style={focus ? { objectPosition: focus } : undefined}
    />
  );
  return webp ? <picture><source type="image/webp" srcSet={webp} />{img}</picture> : img;
}

/* One observer for every card: a card's photo and clip are attached only once it comes within a few hundred pixels
   of the screen, so a phone downloads the cards it shows rather than the first page of thirty. */
let nearIO = null;
const nearCbs = new Map();
function watchNear(el, cb) {
  if (typeof IntersectionObserver === "undefined") { cb(); return () => {}; }
  if (!nearIO) {
    nearIO = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const f = nearCbs.get(e.target);
      nearCbs.delete(e.target);
      nearIO.unobserve(e.target);
      if (f) f();
    }), { rootMargin: "300px 0px" });
  }
  nearCbs.set(el, cb);
  nearIO.observe(el);
  return () => { nearCbs.delete(el); nearIO.unobserve(el); };
}
function useNear(ref, eager) {
  const [near, setNear] = useState(eager);
  useEffect(() => {
    if (near || !ref.current) return;
    return watchNear(ref.current, () => setNear(true));
  }, [near, ref]);
  return near;
}

/* Silent looping clips. Decoding video is the most expensive thing the gallery does, so only a few play at once
   (fewer on phones, none with data saver), and none while a dialog covers the grid or the tab is in the background. */
const onScreen = new Set();
let held = false;
const mq = (q) => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(q).matches;
const maxClips = () => {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  if ((c && c.saveData) || mq("(prefers-reduced-motion: reduce)")) return 0;
  return mq("(pointer: coarse)") ? 2 : 4;
};
function syncClips() {
  const max = held || document.hidden ? 0 : maxClips();
  let n = 0;
  onScreen.forEach((v) => {
    if (n < max) { n += 1; if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } }
    else if (!v.paused) v.pause();
  });
}
function holdClips(on) { held = on; syncClips(); }
if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncClips);

/* The clip lies over the photo, which is its first frame, so there is no poster to download: until the clip plays,
   the photo shows through. If the clip fails, it is dropped and the photo stays. */
function LoopVideo({ src, focus, onFail }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) onScreen.add(v); else { onScreen.delete(v); v.pause(); }
      syncClips();
    }, { threshold: 0.5 });
    io.observe(v);
    return () => { io.disconnect(); onScreen.delete(v); syncClips(); };
  }, [src]);
  return <video ref={ref} src={src} aria-hidden="true" tabIndex={-1} muted loop playsInline preload="none" disablePictureInPicture onError={onFail} className="cr-photo-img" style={focus ? { objectPosition: focus } : undefined} />;
}

/* A template's media, sized by its parent. `lazy` waits until it is near the screen (the gallery), then loads it at
   once; without it the media loads straight away (a dialog that is already open). */
function Creative({ t, lazy = false, priority = false }) {
  const ref = useRef(null);
  const near = useNear(ref, !lazy);
  const [clipOk, setClipOk] = useState(true);
  const photo = TEMPLATE_IMGS[t.id];
  const clip = TEMPLATE_VIDS[t.id];
  const alt = altFor(t);
  return (
    <div ref={ref} className={`cr cr-photo ${t.type === "video" && !clip ? "cr-vid" : ""}`}>
      {!near ? <span role="img" aria-label={alt} className="absolute inset-0" />
        : photo ? <TemplateImage src={photo} alt={alt} title={t.title} focus={t.focus} lazy={false} priority={priority} />
        : <MediaFallback title={t.title} label={alt} />}
      {near && clip && clipOk && <LoopVideo src={clip} focus={t.focus} onFail={() => setClipOk(false)} />}
      {t.type === "video" && !clip && <span className="cr-prog"><i /></span>}
    </div>
  );
}

/* ------------------------------- Card ---------------------------------- */

/* One listener on the grid leans the card under the pointer. Mouse only, at most one update per frame,
   and not at all for visitors who asked for less motion. */
const calm = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
let tiltEl = null, tiltRaf = 0, tiltX = 0, tiltY = 0;
const tiltClear = () => {
  if (!tiltEl) return;
  ["--rx", "--ry", "--gx", "--gy"].forEach((k) => tiltEl.style.removeProperty(k));
  tiltEl = null;
};
const tilt = {
  onPointerMove(e) {
    if (e.pointerType !== "mouse" || (calm && calm.matches)) return;
    const el = e.target.closest("[data-tilt]");
    if (el !== tiltEl) { tiltClear(); tiltEl = el; }
    if (!el) return;
    tiltX = e.clientX; tiltY = e.clientY;
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(() => {
      tiltRaf = 0;
      if (!tiltEl) return;
      const r = tiltEl.getBoundingClientRect();
      const x = (tiltX - r.left) / r.width, y = (tiltY - r.top) / r.height;
      const s = tiltEl.style;
      s.setProperty("--ry", ((x - 0.5) * 12).toFixed(2) + "deg");
      s.setProperty("--rx", ((0.5 - y) * 9).toFixed(2) + "deg");
      s.setProperty("--gx", (x * 100).toFixed(0) + "%");
      s.setProperty("--gy", (y * 80).toFixed(0) + "%");
    });
  },
  onPointerLeave: tiltClear,
};

const pill = "inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white";

/* Most templates are flagged trending, so a badge on each would say nothing. The flag still drives the Trending
   filter and sort; the badge goes only on the first 40 of them that are not new (about one card in six). NEW wins. */
let trendingBadge = null;
const showTrending = (t) => {
  if (!trendingBadge) trendingBadge = new Set(TEMPLATES.filter((x) => x.trending && !x.isNew).slice(0, 40).map((x) => x.id));
  return !t.isNew && trendingBadge.has(t.id);
};

/* A card is a list item: the heading stays a heading, and one real button (stretched over the whole card) opens it. */
const TemplateCard = memo(function TemplateCard({ t, onInspect, action = "Use this template", verb = "Use", fav = false, onFav, i = 0 }) {
  const cta = verb === "Use" ? "Use template" : "Open Studio";
  return (
    <li data-tilt className="tilt rise group relative list-none" style={{ "--i": i }}>
      <article className="group/card relative flex flex-col">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm transition duration-300 group-hover:shadow-xl group-hover:shadow-slate-900/10">
          <Creative t={t} lazy />
          <span className="tilt-glare" />

          {/* Badges sit at the bottom: the photos carry their headline at the top. */}
          <div className="pointer-events-none absolute bottom-2 left-2 right-11 z-[2] flex flex-wrap items-center gap-1.5">
            {t.type === "video" && (
              <span className={pill}><Icon.Video className="h-3 w-3" /> VIDEO</span>
            )}
            {t.isNew && <span className={`${pill} !bg-emerald-600/90`}>NEW</span>}
            {showTrending(t) && (
              <span className={pill}><Icon.Flame className="h-3 w-3 text-blue-300" /> TRENDING</span>
            )}
          </div>

          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-gradient-to-t from-slate-950/65 via-slate-950/30 to-slate-950/10 opacity-0 transition duration-300 group-hover:opacity-100 group-has-[:focus-visible]/card:opacity-100">
            <span className="inline-flex translate-y-1.5 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-950/40 transition duration-300 group-hover:translate-y-0">
              <Icon.Wand className="h-4 w-4" /> {action}
            </span>
          </div>
        </div>

        <div className="px-1 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.label}</p>
          <h3 className="mt-1 text-[14px] font-semibold leading-snug tracking-tight text-slate-900">{t.title}</h3>
          <button
            type="button" onClick={() => onInspect(t)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-blue-600 focus:outline-none after:absolute after:inset-0 after:z-[3] after:rounded-2xl focus-visible:text-blue-700 focus-visible:after:ring-2 focus-visible:after:ring-blue-600 focus-visible:after:ring-offset-4"
          >
            {cta}<span className="sr-only">: {t.title}</span> <Icon.Arrow className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </article>

      {/* Laid over the photo, above the card's own button, so it is a control of its own. */}
      {onFav && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] aspect-[4/5]">
          <button
            onClick={() => onFav(t.id)}
            aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${t.title} ${fav ? "from" : "to"} favourites`}
            className={`pointer-events-auto absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 ${fav ? "bg-white text-rose-500 opacity-100" : "bg-white/95 text-slate-600 opacity-0 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
          >
            <Icon.Heart className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      )}
    </li>
  );
});

/* The gallery: a list of cards under a heading screen readers can jump to. `role="list"` because Safari drops list
   semantics from a list styled without bullets. */
function TemplateGrid({ className = "", label = "Templates", children }) {
  return (
    <>
      <h2 className="sr-only">{label}</h2>
      <ul role="list" className={className} {...tilt}>{children}</ul>
    </>
  );
}

/* ------------------------------- Sidebar ------------------------------- */

const NAV = [
  { head: "Create", items: [
    { id: "explore", label: "Explore Templates", icon: Icon.Grid },
    { id: "static", label: "Static Ads", icon: Icon.Layout },
    { id: "pack", label: "Social Pack", icon: Icon.Image, note: "New" },
    { id: "video", label: "Video Generator", icon: Icon.Video, note: "Soon", quiet: true },
  ] },
  { head: "Analyse", items: [
    { id: "examine", label: "Examine Ad", icon: Icon.Stethoscope },
    { id: "spy", label: "Competitor Spy", icon: Icon.Eye, note: "New" },
  ] },
  { head: "Library", items: [
    { id: "vault", label: "Saved Vault", icon: Icon.Bookmark },
  ] },
];
const navHead = "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500";
// One visible focus ring for everything here: solid sapphire with a white gap, readable on white and on photos.
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/* Below lg the sidebar slides in over the page, so it behaves as a dialog while it is open there: focus moves in and
   stays in, Escape and the backdrop close it, the page behind stops scrolling, and focus goes back to the menu button. */
function DrawerBackdrop({ panelRef, onClose, initialFocusRef }) {
  const { overlayProps } = useDialog({ onClose, panelRef, initialFocusRef });
  return <div className="fixed inset-0 z-[35] bg-slate-900/20 lg:hidden" {...overlayProps} />;
}

const WIDE = "(min-width: 1024px)"; // Tailwind's lg, where the sidebar is always on screen
function useWide() {
  const [wide, setWide] = useState(() => mq(WIDE));
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    on();
    if (m.addEventListener) m.addEventListener("change", on); else m.addListener(on);
    return () => { if (m.removeEventListener) m.removeEventListener("change", on); else m.removeListener(on); };
  }, []);
  return wide;
}

function Sidebar({ active, onNav, open, onClose, onExamine, credits, creditsPerDay = 15, vaultCount, pinned = [], pinnedTotal = 0, onPick, onShowPinned }) {
  const asideRef = useRef(null);
  const closeRef = useRef(null);
  const wide = useWide();
  const drawer = open && !wide;
  // Growing the window past lg while the menu is open: the sidebar is simply there now, so the menu is closed.
  useEffect(() => { if (open && wide) onClose(); }, [open, wide, onClose]);
  const left = Number.isFinite(credits) ? Math.max(0, credits) : null;
  return (
    <>
      {drawer && <DrawerBackdrop panelRef={asideRef} onClose={onClose} initialFocusRef={closeRef} />}
      <aside
        ref={asideRef} data-drawer
        role={drawer ? "dialog" : undefined} aria-modal={drawer ? "true" : undefined} aria-label={drawer ? "Menu" : undefined}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        // Opening shows the menu at once (so focus can move into it); closing hides it only after it has slid away.
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white duration-200 lg:translate-x-0 ${open ? "translate-x-0 transition-transform" : "-translate-x-full transition-[transform,visibility] max-lg:invisible"}`}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 pl-4 pr-3">
          <button onClick={() => { onNav("explore"); onClose(); }} aria-label="AdDoctor: Explore Templates" className={`rounded-lg p-1 ${ring}`}>
            <img src={LOGO_SRC} alt="" width="141" height="26" className="block h-[26px] w-auto select-none" draggable={false} />
          </button>
          <button ref={closeRef} onClick={onClose} aria-label="Close menu" className={`ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden ${ring}`}>
            <Icon.Close className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pt-1">
          <button
            onClick={() => { onExamine(); onClose(); }}
            className={`btn-glow flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[.98] ${ring}`}
          >
            <Icon.Plus className="h-4 w-4" />
            Examine / Generate
          </button>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
          <nav aria-label="Workspace" className="flex flex-col gap-5">
            {NAV.map((g) => (
              <div key={g.head}>
                <p className={navHead}>{g.head}</p>
                <div className="flex flex-col gap-px">
                  {g.items.map((n) => {
                    const on = active === n.id;
                    const I = n.icon;
                    const count = n.id === "vault" ? vaultCount : 0;
                    return (
                      <button
                        key={n.id}
                        onClick={() => { onNav(n.id); onClose(); }}
                        aria-current={on ? "page" : undefined}
                        className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${on ? "bg-slate-100 font-semibold text-slate-900" : n.quiet ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                      >
                        <I className={`h-4 w-4 shrink-0 ${on ? "text-blue-600" : "text-slate-400 group-hover:text-slate-500"}`} />
                        <span className="flex-1 truncate">{n.label}</span>
                        {n.note && <span className={`text-[10px] font-semibold uppercase tracking-wider ${n.quiet ? "text-slate-500" : "text-blue-600"}`}>{n.note}</span>}
                        {count > 0 && <span className="text-[11px] font-semibold tabular-nums text-slate-500">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Favourites, so the templates someone keeps coming back to are one click away. */}
          <div className="mt-5">
            <div className="flex items-center justify-between pr-2">
              <p className={navHead}>Favourites</p>
              {pinnedTotal > pinned.length && (
                <button onClick={() => { onShowPinned(); onClose(); }} className={`mb-1.5 rounded text-[11px] font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>All {pinnedTotal}</button>
              )}
            </div>
            {pinned.length ? (
              <div className="flex flex-col gap-px">
                {pinned.map((t) => (
                  <button
                    key={t.id} onClick={() => { onPick(t); onClose(); }}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                  >
                    <span className="relative h-8 w-[26px] shrink-0 overflow-hidden rounded-[5px] border border-slate-200 bg-slate-100">
                      <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-700 group-hover:text-slate-900">{t.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{t.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-start gap-2 px-3 text-xs leading-relaxed text-slate-500">
                <Icon.Heart className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Tap the heart on a template to keep it here.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200/80 px-5 py-4">
          {/* The free allowance as it really is: kept on this device and topped up each day. Nothing to buy yet. */}
          {left !== null && (
            <>
              <p className="text-xs font-medium text-slate-600">
                <span className={`font-semibold tabular-nums ${left > 0 ? "text-slate-900" : "text-rose-700"}`}>{left}</span> of {creditsPerDay} free credits today
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.min(100, (left / creditsPerDay) * 100)}%` }} />
              </div>
              <p className={`mt-2 text-[11px] font-medium ${left > 0 ? "text-slate-500" : "text-rose-700"}`}>{left > 0 ? "Kept on this device. Refills daily." : "Refills tomorrow."}</p>
            </>
          )}
          <a href="./privacy.html" className={`mt-2 inline-block rounded text-[11px] font-medium text-slate-500 transition hover:text-slate-700 ${ring}`}>Privacy</a>
        </div>
      </aside>
    </>
  );
}

/* Phones and tablets: the main screens within thumb reach. The full list stays in the menu. */
const TABS = [
  { id: "explore", label: "Explore", icon: Icon.Grid },
  { id: "static", label: "Static", icon: Icon.Layout },
  { id: "examine", label: "Examine", icon: Icon.Stethoscope, main: true },
  { id: "spy", label: "Spy", icon: Icon.Eye },
  { id: "vault", label: "Vault", icon: Icon.Bookmark },
];
function BottomNav({ active, onNav, vaultCount }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
        {TABS.map((n) => {
          const on = active === n.id;
          const I = n.icon;
          return n.main ? (
            <button key={n.id} onClick={() => onNav(n.id)} aria-label="Examine an ad" className="btn-glow mx-auto -mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600 text-white ring-4 ring-white transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
              <I className="h-6 w-6" />
            </button>
          ) : (
            // The active tab is already blue, so focus draws a ring of its own rather than only changing colour.
            <button key={n.id} onClick={() => onNav(n.id)} aria-current={on ? "page" : undefined} className={`relative flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${on ? "text-blue-700" : "text-slate-500 focus-visible:text-blue-700"}`}>
              <span className={`absolute top-0 h-0.5 w-8 rounded-full bg-blue-600 transition-transform duration-300 ${on ? "scale-x-100" : "scale-x-0"}`} />
              <I className="h-5 w-5" />
              {n.label}
              {n.id === "vault" && vaultCount > 0 && <span className="absolute right-[22%] top-2 grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[10px] tabular-nums text-white">{vaultCount}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export { svgBase, Icon, Creative, TemplateImage, MediaFallback, cardWebp, pill, TemplateCard, TemplateGrid, NAV, Sidebar, BottomNav, tilt, holdClips };
