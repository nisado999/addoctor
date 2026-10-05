import React, { useState, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { TEMPLATE_IMGS, TEMPLATE_VIDS, TEMPLATE_REFS } from "./templateImgs.js";

/* Detail view for a video template: the clip playing large, what it is for, and the reference frames it is built from. */
function LookModal({ tpl, onClose, onUse, onExamine }) {
  const refs = TEMPLATE_REFS[tpl.id] || [];
  const [shot, setShot] = useState(-1); // -1 = the video, else a reference frame
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const tags = tpl.tags || [tpl.category, tpl.framework];
  const thumb = "relative aspect-[9/16] overflow-hidden rounded-xl border-2 bg-slate-100 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="look-title" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative flex max-h-[94vh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-3xl bg-white shadow-2xl shadow-slate-900/20 sm:rounded-3xl md:flex-row md:overflow-hidden"
      >
        <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
          <Icon.Close className="h-4 w-4" />
        </button>

        <div className="flex shrink-0 items-center justify-center bg-slate-50 p-6 md:w-[46%] md:p-8">
          <div className="relative aspect-[9/16] w-full max-w-[250px] overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200 shadow-sm md:max-w-[290px]">
            {shot < 0 ? (
              <video key={tpl.id} src={TEMPLATE_VIDS[tpl.id]} poster={TEMPLATE_IMGS[tpl.id]} aria-label={tpl.title} muted loop autoPlay playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <img src={refs[shot]} alt={`${tpl.title}, reference frame ${shot + 1}`} className="absolute inset-0 h-full w-full object-cover" />
            )}
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
              {shot < 0 ? <><Icon.Video className="h-3 w-3" /> VIDEO · {tpl.dur}</> : `FRAME ${shot + 1} OF ${refs.length}`}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col md:overflow-y-auto">
          <div className="px-6 pb-5 pt-6 md:px-8 md:pt-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{tpl.label}</p>
            <h2 id="look-title" className="mt-1 pr-10 text-2xl font-semibold tracking-tight text-slate-900">{tpl.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{tpl.desc || tpl.primary}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((x) => <span key={x} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{x}</span>)}
            </div>
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-blue-700"><Icon.Sparkle className="h-3.5 w-3.5" /> Why it works</p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-700">
                {tpl.why.map((w) => <li key={w} className="flex gap-2"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-emerald-600" /><span>{w}</span></li>)}
              </ul>
            </div>
          </div>

          <div className="mt-auto border-t border-slate-100 px-6 py-5 md:px-8">
            {refs.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">References · {refs.length}</p>
                <div className="mt-2.5 grid grid-cols-5 gap-2">
                  <button onClick={() => setShot(-1)} aria-pressed={shot < 0} aria-label="Play the video" className={`${thumb} ${shot < 0 ? "border-blue-600" : "border-transparent hover:border-slate-300"}`}>
                    <img src={TEMPLATE_IMGS[tpl.id]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-slate-950/25"><Icon.Play className="h-5 w-5 text-white" /></span>
                  </button>
                  {refs.map((src, i) => (
                    <button key={src} onClick={() => setShot(i)} aria-pressed={shot === i} aria-label={`Show reference frame ${i + 1}`} className={`${thumb} ${shot === i ? "border-blue-600" : "border-transparent hover:border-slate-300"}`}>
                      <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => onUse(tpl)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
              Use this template <Icon.Arrow className="h-4 w-4" />
            </button>
            <button onClick={() => onExamine(tpl)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
              <Icon.Stethoscope className="h-4 w-4" /> Examine my ad against it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { LookModal };
