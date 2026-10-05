import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { LOGO_SRC } from "./data";
import { rgba } from "./studio";
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

/* A silent looping clip that only plays while it is on screen, so a long gallery does not decode every video at once. */
function LoopVideo({ src, poster, title }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return <video ref={ref} src={src} poster={poster} aria-label={title} muted loop playsInline preload="none" disablePictureInPicture className="cr-photo-img" />;
}

function Creative({ t }) {
  const a = t.art;
  const photo = TEMPLATE_IMGS[t.id];
  const clip = TEMPLATE_VIDS[t.id];
  if (clip) {
    return (
      <div className="cr cr-photo">
        <LoopVideo src={clip} poster={photo} title={t.title} />
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

const pill = "inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white";

function TemplateCard({ t, onInspect, action = "Inspect Prescription", verb = "Inspect", fav = false, onFav }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${verb} ${t.title}`}
      onClick={() => onInspect(t)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onInspect(t))}
      className="group flex cursor-pointer flex-col transition duration-300 ease-out hover:scale-[1.02] focus:outline-none motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-sm transition duration-300 group-hover:shadow-xl group-hover:shadow-slate-900/10 group-focus-visible:ring-4 group-focus-visible:ring-blue-600/25">
        <Creative t={t} />

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

        {onFav && (
          <button
            onClick={(e) => { e.stopPropagation(); onFav(t.id); }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${t.title} ${fav ? "from" : "to"} favourites`}
            className={`absolute bottom-1.5 right-1.5 z-[4] grid h-8 w-8 place-items-center rounded-full shadow-sm backdrop-blur transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30 ${fav ? "bg-white text-rose-500 opacity-100" : "bg-white/85 text-slate-600 opacity-0 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"}`}
          >
            <Icon.Heart className="h-4 w-4" fill={fav ? "currentColor" : "none"} />
          </button>
        )}

        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-gradient-to-t from-slate-950/65 via-slate-950/30 to-slate-950/10 opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="inline-flex translate-y-1.5 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-950/40 transition duration-300 group-hover:translate-y-0">
            {verb === "Inspect" ? <Icon.Stethoscope className="h-4 w-4" /> : <Icon.Wand className="h-4 w-4" />} {action}
          </span>
        </div>
      </div>

      <div className="px-1 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{t.label}</p>
        <h3 className="mt-1 text-[14px] font-semibold leading-snug tracking-tight text-slate-900">{t.title}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-blue-600">
          {verb === "Inspect" ? "Preview" : "Open Studio"} <Icon.Arrow className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

/* ------------------------------- Sidebar ------------------------------- */

const NAV = [
  { id: "explore", label: "Explore Templates", icon: Icon.Grid },
  { id: "examine", label: "Examine Ad", icon: Icon.Stethoscope },
  { id: "video", label: "Video Generator", icon: Icon.Video, badge: "Soon" },
  { id: "pack", label: "Social Pack", icon: Icon.Image, badge: "New" },
  { id: "static", label: "Static Ads", icon: Icon.Layout },
  { id: "spy", label: "Competitor Spy", icon: Icon.Eye, badge: "New" },
  { id: "vault", label: "Saved Vault", icon: Icon.Bookmark },
];

function Sidebar({ active, onNav, open, onClose, onExamine, credits, vaultCount, onUpgrade }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" onClick={onClose} />}
      <aside
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <img src={LOGO_SRC} alt="ad doctor" className="block h-[26px] w-auto select-none" draggable={false} />
        </div>

        <div className="px-4 pt-2">
          <button
            onClick={() => { onExamine(); onClose(); }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"
          >
            <Icon.Plus className="h-4 w-4" />
            Examine / Generate
          </button>
        </div>

        <nav className="mt-6 flex flex-col gap-0.5 px-3">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Workspace</p>
          {NAV.map((n) => {
            const on = active === n.id;
            const I = n.icon;
            const count = n.id === "vault" ? vaultCount : 0;
            return (
              <button
                key={n.id}
                onClick={() => { onNav(n.id); onClose(); }}
                aria-current={on ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 ${on ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <I className={`h-[18px] w-[18px] ${on ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                <span className="flex-1">{n.label}</span>
                {n.badge && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">{n.badge}</span>}
                {count > 0 && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700 ring-2 ring-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[18px] w-[18px]">
                  <circle cx="12" cy="8.5" r="3.8" />
                  <path d="M4.5 20c1.3-3.6 4.1-5.4 7.5-5.4s6.2 1.8 7.5 5.4" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">My Workspace</p>
                <p className={`truncate text-xs font-medium tabular-nums ${credits > 0 ? "text-emerald-600" : "text-rose-600"}`}>{credits} Credits Remaining</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (credits / 50) * 100))}%` }} />
            </div>
            <button onClick={onUpgrade} className="mt-3 w-full rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
              Upgrade
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export { svgBase, Icon, hl, Stars, CreativeBody, Creative, pill, TemplateCard, NAV, Sidebar };
