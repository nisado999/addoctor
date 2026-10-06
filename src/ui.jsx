import React, { useEffect, useRef, memo } from "react";
import { LOGO_SRC } from "./data";
import { TEMPLATE_IMGS, TEMPLATE_VIDS } from "./templateImgs.js";

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

/* ---------------------- CSS-built ad creatives ------------------------- */

function hl(text) {
  return String(text).split("*").map((part, i) => (i % 2 ? <span key={i} className="cr-hl">{part}</span> : <span key={i}>{part}</span>));
}
function Stars({ n = 5, className = "" }) {
  return (
    <span className={`cr-stars ${className}`} aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => <Icon.Star key={i} />)}
    </span>
  );
}

function CreativeBody({ a }) {
  switch (a.kind) {
    case "myth":
      return (
        <>
          <div className="cr-panel" style={{ background: "rgba(244,63,94,.16)", borderColor: "rgba(251,113,133,.45)" }}>
            <span className="cr-ic" style={{ background: "#f43f5e" }}><Icon.Cross /></span>
            <span><b className="cr-k">Myth</b><br />{a.myth}</span>
          </div>
          <div className="cr-panel" style={{ background: "rgba(16,185,129,.18)", borderColor: "rgba(52,211,153,.5)" }}>
            <span className="cr-ic" style={{ background: "#10b981" }}><Icon.Check /></span>
            <span><b className="cr-k">Fact</b><br />{a.fact}</span>
          </div>
        </>
      );
    case "stat":
      return (
        <>
          <div className="cr-statwrap">
            <span className="cr-big" style={{ color: a.hl }}>{a.big}</span>
            <span className="cr-unit">{a.unit}</span>
          </div>
          <div className="cr-chips">{a.chips.map((c) => <span key={c} className="cr-chip">{c}</span>)}</div>
        </>
      );
    case "split":
      return (
        <div className="cr-split">
          <div className="cr-half" style={{ background: "linear-gradient(180deg,#475569,#334155)", filter: "saturate(.5)" }}>
            <span className="cr-lab">{a.left.label}</span>
            <span className="cr-num">{a.left.metric}</span>
            <span className="cr-note">{a.left.note}</span>
          </div>
          <div className="cr-half" style={{ background: "linear-gradient(180deg,#38bdf8,#2563eb)" }}>
            <span className="cr-lab">{a.right.label}</span>
            <span className="cr-num">{a.right.metric}</span>
            <span className="cr-note">{a.right.note}</span>
          </div>
          <span className="cr-handle"><Icon.Arrow style={{ transform: "rotate(180deg)" }} /><Icon.Arrow /></span>
        </div>
      );
    case "review":
      return (
        <div className="cr-white">
          <Stars />
          <p className="cr-quote">“{a.quote}”</p>
          <div className="cr-who"><span className="cr-av">{a.initial}</span><span>{a.who}</span></div>
        </div>
      );
    case "offer":
      return (
        <>
          <div className="cr-statwrap">
            <span className="cr-big" style={{ color: a.hl }}>{a.big}</span>
            <span className="cr-unit">{a.sub}</span>
          </div>
          <div className="cr-chips">{a.pills.map((c) => <span key={c} className="cr-chip">{c}</span>)}</div>
          <span className="cr-cta">{a.cta}</span>
        </>
      );
    case "steps":
      return (
        <>
          {a.rows.map(([n, v]) => (
            <div key={n} className="cr-panel" style={{ padding: "2.6cqw 4cqw" }}>
              <span className="cr-ic" style={{ background: v === "keep" ? "#10b981" : "#f43f5e", width: "6.6cqw", height: "6.6cqw" }}>
                {v === "keep" ? <Icon.Check /> : <Icon.Cross />}
              </span>
              <span style={{ flex: 1 }}>{n}</span>
              <b className="cr-k" style={{ opacity: 0.8 }}>{v}</b>
            </div>
          ))}
          <span className="cr-cta" style={{ background: a.hl }}>{a.foot}</span>
        </>
      );
    case "compare":
      return (
        <div className="cr-table">
          <span />
          <b className="cr-th cr-us">{a.cols[0]}</b>
          <b className="cr-th">{a.cols[1]}</b>
          {a.rows.map(([k, us, them]) => (
            <React.Fragment key={k}>
              <span className="cr-rowk">{k}</span>
              <span className="cr-cell cr-us"><Icon.Check />{us}</span>
              <span className="cr-cell cr-them"><Icon.Cross />{them}</span>
            </React.Fragment>
          ))}
        </div>
      );
    case "quote":
      return (
        <div className="cr-paper">
          <span className="cr-tape" />
          <p>{a.text}</p>
          <span className="cr-sign">– {a.sign}</span>
        </div>
      );
    case "checklist":
      return (
        <>
          {a.items.map((it) => (
            <div key={it} className="cr-panel">
              <span className="cr-ic" style={{ background: "#10b981" }}><Icon.Check /></span>
              <span>{it}</span>
            </div>
          ))}
          <span className="cr-chip" style={{ alignSelf: "flex-start", background: a.hl, color: "#0f172a", borderColor: "transparent" }}>{a.chip}</span>
        </>
      );
    case "timeline":
      return (
        <>
          <div className="cr-time">
            <span className="cr-line" />
            {a.points.map(([t, s, l]) => (
              <div key={t} className="cr-node">
                <span className="cr-dot" style={{ background: s === "ok" ? "#10b981" : "#f43f5e" }}>{s === "ok" ? <Icon.Check /> : <Icon.Cross />}</span>
                <b>{t}</b>
                <span>{l}</span>
              </div>
            ))}
          </div>
          <span className="cr-cta" style={{ background: a.hl }}>{a.foot}</span>
        </>
      );
    case "restock":
      return (
        <>
          <span className="cr-badge">{a.badge}</span>
          <div className="cr-chips">
            {a.sizes.map(([s, on]) => (
              <span key={s} className="cr-size" style={on ? undefined : { opacity: 0.35, textDecoration: "line-through" }}>{s}</span>
            ))}
          </div>
          <span className="cr-cta">Pick your size</span>
        </>
      );
    case "neon":
      return (
        <div className="cr-neonwrap">
          <span className="cr-ring cr-ring1" />
          <span className="cr-ring cr-ring2" />
          <span className="cr-neontxt">{a.label}</span>
        </div>
      );
    case "reviews":
      return (
        <div className="cr-stack">
          {a.items.map(([q, n], i) => (
            <div key={q} className="cr-white cr-mini" style={{ transform: `translateX(${i % 2 ? 2 : -2}cqw)` }}>
              <Stars />
              <p className="cr-quote">{q}</p>
              <span className="cr-nm">{n} · Verified buyer</span>
            </div>
          ))}
        </div>
      );
    case "marker":
      return (
        <div className="cr-marknote">
          <svg viewBox="0 0 60 60" aria-hidden="true"><path d="M8 6c6 26 18 38 40 44M34 50l14 0-6-13" fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>{a.note}</span>
        </div>
      );
    case "receipt":
      return (
        <div className="cr-receipt">
          <b className="cr-rc-h">Order summary</b>
          {a.rows.map(([k, o, n]) => (
            <div key={k} className="cr-rc-r"><span>{k}</span><span><s>{o}</s> <b>{n}</b></span></div>
          ))}
          <div className="cr-rc-r cr-rc-t"><span>Total</span><span><s>{a.totals[0]}</s> <b>{a.totals[1]}</b></span></div>
        </div>
      );
    case "tweet":
      return (
        <div className="cr-tweet">
          <div className="cr-tw-h"><span className="cr-av" style={{ background: "#dbeafe", color: "#1d4ed8" }}>{a.name.charAt(0)}</span><span><b>{a.name}</b><br />{a.handle}</span></div>
          <p>{a.text}</p>
        </div>
      );
    case "ingredients":
      return (
        <>
          {a.items.map((it, i) => (
            <div key={it} className="cr-panel" style={{ padding: "2.2cqw 3.6cqw" }}>
              <span className="cr-ic" style={{ background: a.hl, color: "#0f172a", fontWeight: 800, fontSize: "3.4cqw", width: "6.6cqw", height: "6.6cqw" }}>{i + 1}</span>
              <span>{it}</span>
            </div>
          ))}
        </>
      );
    case "stoplight": {
      const col = { g: "#22c55e", y: "#facc15", r: "#ef4444" };
      return (
        <div className="cr-table" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}>
          <span />
          {a.cols.map((c, i) => <b key={c} className={`cr-th ${i === 0 ? "cr-us" : ""}`}>{c}</b>)}
          {a.rows.map(([k, ...v]) => (
            <React.Fragment key={k}>
              <span className="cr-rowk">{k}</span>
              {v.map((x, i) => <span key={i} className="cr-cell" style={{ justifyContent: "center" }}><i className="cr-light-dot" style={{ background: col[x] }} /></span>)}
            </React.Fragment>
          ))}
        </div>
      );
    }
    case "dm":
      return (
        <div className="cr-dm">
          <span className="cr-bub cr-recv">{a.recv}</span>
          <span className="cr-bub cr-sent">{a.sent}</span>
        </div>
      );
    case "press":
      return (
        <div className="cr-press">
          <b>As seen in {a.pub}</b>
          <p>“{a.quote}”</p>
        </div>
      );
    case "newspaper":
      return (
        <div className="cr-news">
          <div className="cr-news-mast">{a.pub}</div>
          <p className="cr-news-hd">{a.quote}</p>
          <p className="cr-news-sub">{a.sub}</p>
        </div>
      );
    case "beforeafter":
      return (
        <div className="cr-split">
          <div className="cr-half" style={{ background: "linear-gradient(180deg,#334155,#1e293b)" }}>
            <span className="cr-pillbadge" style={{ background: "#475569" }}>{a.before.label}</span>
            <span className="cr-num" style={{ fontSize: "8cqw" }}>{a.before.metric}</span>
          </div>
          <div className="cr-half" style={{ background: "linear-gradient(180deg,#38bdf8,#2563eb)" }}>
            <span className="cr-pillbadge" style={{ background: "#10b981" }}>{a.after.label}</span>
            <span className="cr-num" style={{ fontSize: "8cqw" }}>{a.after.metric}</span>
          </div>
        </div>
      );
    case "chart":
      return (
        <div className="cr-chart">
          <svg viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 46 C30 46 40 40 55 28 S82 10 96 8" fill="none" stroke={a.hl} strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d="M4 46 C30 46 40 40 55 28 S82 10 96 8 L96 56 L4 56Z" fill={a.hl} opacity=".18" />
          </svg>
          <div className="cr-ch-l"><span>{a.start[0]}<br /><b>{a.start[1]}</b></span><span style={{ textAlign: "right" }}>{a.end[0]}<br /><b>{a.end[1]}</b> {a.metric}</span></div>
        </div>
      );
    default:
      return null;
  }
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

function LoopVideo({ src, poster, title, focus }) {
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
  return <video ref={ref} src={src} poster={poster} aria-label={title} muted loop playsInline preload="none" disablePictureInPicture className="cr-photo-img" style={focus ? { objectPosition: focus } : undefined} />;
}

function Creative({ t }) {
  const a = t.art;
  const photo = TEMPLATE_IMGS[t.id];
  const clip = TEMPLATE_VIDS[t.id];
  if (clip) {
    return (
      <div className="cr cr-photo">
        <LoopVideo src={clip} poster={photo} title={t.title} focus={t.focus} />
      </div>
    );
  }
  if (photo) {
    return (
      <div className={`cr cr-photo ${t.type === "video" ? "cr-vid" : ""}`}>
        <img src={photo} alt={t.title} draggable="false" loading="lazy" decoding="async" className="cr-photo-img" />
        {t.type === "video" && <span className="cr-prog"><i /></span>}
      </div>
    );
  }
  return (
    <div className={`cr cr-k-${a.kind} ${a.light ? "cr-light" : ""} ${t.type === "video" ? "cr-vid" : ""}`} style={{ background: a.bg, "--hl": a.hl }}>
      <div className="cr-in">
        <div className="cr-hook">{hl(a.hook)}</div>
        <div className="cr-body">
          <CreativeBody a={a} />
        </div>
        <div className="cr-foot">
          <span>{a.tag}</span>
          {t.type === "video" ? <span className="cr-dur"><Icon.Play />{t.dur}</span> : <span>AdDoctor sample</span>}
        </div>
      </div>
      {t.type === "video" && <span className="cr-prog"><i /></span>}
    </div>
  );
}

/* ------------------------------- Card ---------------------------------- */

/* One listener on the grid leans the card under the pointer. Mouse only, at most one update per frame. */
let tiltEl = null, tiltRaf = 0, tiltX = 0, tiltY = 0;
const tiltClear = () => {
  if (!tiltEl) return;
  ["--rx", "--ry", "--gx", "--gy"].forEach((k) => tiltEl.style.removeProperty(k));
  tiltEl = null;
};
const tilt = {
  onPointerMove(e) {
    if (e.pointerType !== "mouse") return;
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

const TemplateCard = memo(function TemplateCard({ t, onInspect, action = "Use this template", verb = "Use", fav = false, onFav, i = 0 }) {
  return (
    <div data-tilt className="tilt rise group relative" style={{ "--i": i }}>
    <div
      role="button"
      tabIndex={0}
      aria-label={`${verb} ${t.title}`}
      onClick={() => onInspect(t)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onInspect(t))}
      className="group/btn flex cursor-pointer flex-col focus:outline-none"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm transition duration-300 group-hover:shadow-xl group-hover:shadow-slate-900/10 group-focus-visible/btn:ring-4 group-focus-visible/btn:ring-blue-600/25">
        <Creative t={t} />
        <span className="tilt-glare" />

        {/* Badges sit at the bottom: the photos carry their headline at the top. */}
        <div className="pointer-events-none absolute bottom-2 left-2 right-11 z-[2] flex flex-wrap items-center gap-1.5">
          {t.type === "video" && (
            <span className={pill}><Icon.Video className="h-3 w-3" /> VIDEO</span>
          )}
          {t.isNew && <span className={`${pill} !bg-emerald-600/90`}>NEW</span>}
          {t.trending && (
            <span className={pill}><Icon.Flame className="h-3 w-3 text-blue-300" /> TRENDING</span>
          )}
        </div>

        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-gradient-to-t from-slate-950/65 via-slate-950/30 to-slate-950/10 opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible/btn:opacity-100">
          <span className="inline-flex translate-y-1.5 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-950/40 transition duration-300 group-hover:translate-y-0">
            <Icon.Wand className="h-4 w-4" /> {action}
          </span>
        </div>
      </div>

      <div className="px-1 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{t.label}</p>
        <h3 className="mt-1 text-[14px] font-semibold leading-snug tracking-tight text-slate-900">{t.title}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-blue-600">
          {verb === "Use" ? "Use template" : "Open Studio"} <Icon.Arrow className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>

      {/* Laid over the photo, outside the card's own button, so it is a control of its own. */}
      {onFav && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] aspect-[4/5]">
          <button
            onClick={() => onFav(t.id)}
            aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${t.title} ${fav ? "from" : "to"} favourites`}
            className={`pointer-events-auto absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full shadow-sm transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10 ${fav ? "bg-white text-rose-500 opacity-100" : "bg-white/95 text-slate-600 opacity-0 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
          >
            <Icon.Heart className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      )}
    </div>
  );
});

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
const navHead = "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400";

function Sidebar({ active, onNav, open, onClose, onExamine, credits, vaultCount, onUpgrade, pinned = [], pinnedTotal = 0, onPick, onShowPinned }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" onClick={onClose} />}
      <aside
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-[transform,visibility] duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full max-lg:invisible"}`}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <img src={LOGO_SRC} alt="ad doctor" className="block h-[26px] w-auto select-none" draggable={false} />
        </div>

        <div className="px-4 pt-1">
          <button
            onClick={() => { onExamine(); onClose(); }}
            className="btn-glow flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"
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
                        className={`group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 ${on ? "bg-slate-100 font-semibold text-slate-900" : n.quiet ? "text-slate-400 hover:bg-slate-50 hover:text-slate-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                      >
                        <I className={`h-4 w-4 shrink-0 ${on ? "text-blue-600" : "text-slate-400 group-hover:text-slate-500"}`} />
                        <span className="flex-1 truncate">{n.label}</span>
                        {n.note && <span className={`text-[10px] font-semibold uppercase tracking-wider ${n.quiet ? "text-slate-400" : "text-blue-600"}`}>{n.note}</span>}
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
                <button onClick={() => { onShowPinned(); onClose(); }} className="pb-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:underline">All {pinnedTotal}</button>
              )}
            </div>
            {pinned.length ? (
              <div className="flex flex-col gap-px">
                {pinned.map((t) => (
                  <button
                    key={t.id} onClick={() => { onPick(t); onClose(); }}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  >
                    <img src={TEMPLATE_IMGS[t.id]} alt="" loading="lazy" className="h-8 w-[26px] shrink-0 rounded-[5px] border border-slate-200 object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-slate-700 group-hover:text-slate-900">{t.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">{t.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex items-start gap-2 px-3 text-xs leading-relaxed text-slate-400">
                <Icon.Heart className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Tap the heart on a template to keep it here.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200/80 px-5 py-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-slate-500">Credits</p>
            <p className={`text-xs font-semibold tabular-nums ${credits > 0 ? "text-slate-900" : "text-rose-600"}`}>{credits} <span className="font-medium text-slate-400">of 50</span></p>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (credits / 50) * 100))}%` }} />
          </div>
          <button onClick={onUpgrade} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition hover:text-blue-700 focus:outline-none focus-visible:underline">
            Upgrade plan <Icon.Arrow className="h-3 w-3" />
          </button>
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
            <button key={n.id} onClick={() => onNav(n.id)} aria-label="Examine an ad" className="btn-glow mx-auto -mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600 text-white ring-4 ring-white transition active:scale-95 focus:outline-none focus-visible:ring-blue-200">
              <I className="h-6 w-6" />
            </button>
          ) : (
            <button key={n.id} onClick={() => onNav(n.id)} aria-current={on ? "page" : undefined} className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-95 focus:outline-none focus-visible:text-blue-700 ${on ? "text-blue-700" : "text-slate-500"}`}>
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

export { svgBase, Icon, hl, Stars, CreativeBody, Creative, pill, TemplateCard, NAV, Sidebar, BottomNav, tilt, holdClips };
