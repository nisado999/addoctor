import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Icon } from "./ui";
import { TEMPLATE_IMGS, TEMPLATE_VIDS, TEMPLATE_REFS } from "./templateImgs.js";

gsap.registerPlugin(useGSAP);
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* "Use this template": the template shown large in soft light, what it is for, and the ways to use it.
   Same language as the product studio: one calm surface, hairlines, ink for the action. */
function LookModal({ tpl, onClose, onInspire, onExamine, onProduct }) {
  const isVideo = !!TEMPLATE_VIDS[tpl.id];
  const refs = TEMPLATE_REFS[tpl.id] || [];
  const [shot, setShot] = useState(-1); // -1 = the video, else a reference frame
  const closeRef = useRef(null);
  const root = useRef(null);

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

  // The ad settles in, the heading and the options glide up one after another, the light drifts slowly.
  useGSAP(() => {
    if (calm()) return;
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.from(".fx-glow", { opacity: 0, duration: 2.2, ease: "power2.out" }, 0)
      .from(".fx-ad", { y: 40, scale: 0.95, opacity: 0, duration: 1.4 }, 0.1)
      .from(".fx-in", { y: 18, opacity: 0, duration: 1.1, stagger: 0.07, clearProps: "transform,opacity" }, 0.15);
    gsap.to(".sx-blob-a", { x: 60, y: 40, scale: 1.15, duration: 11, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(".sx-blob-c", { x: 50, y: -40, scale: 1.18, duration: 14, repeat: -1, yoyo: true, ease: "sine.inOut" });
  }, { scope: root });

  const tags = tpl.tags || [tpl.category, tpl.framework];
  const thumb = "relative aspect-[9/16] overflow-hidden rounded-xl bg-slate-100 ring-2 transition focus:outline-none focus-visible:ring-slate-900";

  return (
    <div className="dlg-veil fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={root} role="dialog" aria-modal="true" aria-labelledby="look-title" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="sx-pop relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-y-auto dlg-panel rounded-t-[28px] sm:rounded-[28px] md:flex-row md:overflow-hidden"
      >
        <button ref={closeRef} onClick={onClose} aria-label="Close" className="sx-close absolute right-5 top-5 z-30 grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:text-slate-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15">
          <Icon.Close className="h-4 w-4" />
        </button>

        <div className="sx-stage flex shrink-0 items-center justify-center px-8 py-12 md:w-[42%] md:px-9">
          <div className="fx-glow" aria-hidden="true"><span className="sx-blob sx-blob-a" /><span className="sx-blob sx-blob-b" /><span className="sx-blob sx-blob-c" /></div>
          <div className={`fx-ad sx-ad relative w-full overflow-hidden ${isVideo ? "aspect-[9/16] max-w-[240px] md:max-w-[260px]" : "aspect-[4/5] max-w-[290px]"}`}>
            {!isVideo ? (
              <img src={TEMPLATE_IMGS[tpl.id]} alt={tpl.title} className="absolute inset-0 h-full w-full object-cover" />
            ) : shot < 0 ? (
              <video key={tpl.id} src={TEMPLATE_VIDS[tpl.id]} poster={TEMPLATE_IMGS[tpl.id]} aria-label={tpl.title} muted loop autoPlay playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <img src={refs[shot]} alt={`${tpl.title}, reference frame ${shot + 1}`} className="absolute inset-0 h-full w-full object-cover" />
            )}
            {isVideo && (
              <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                {shot < 0 ? <><Icon.Video className="h-3 w-3" /> VIDEO · {tpl.dur}</> : `FRAME ${shot + 1} OF ${refs.length}`}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-8 pb-8 pt-10 md:overflow-y-auto md:px-11 md:pt-12">
          <div className="pr-10">
            <p className="fx-in text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">{tpl.label}</p>
            <h2 id="look-title" className="fx-in font-display mt-2 text-[30px] font-extrabold leading-[1.05] tracking-[-0.035em] text-slate-950">{tpl.title}</h2>
            <p className="fx-in mt-3 max-w-md text-[13.5px] leading-relaxed text-slate-500">{tpl.desc || tpl.primary}</p>
            <div className="fx-in mt-4 flex flex-wrap gap-2">
              {tags.map((x) => <span key={x} className="sx-chip rounded-full px-3 py-1 text-xs font-medium text-slate-600">{x}</span>)}
            </div>
          </div>

          <div className="fx-in mt-7 border-t border-slate-900/[.08] pt-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">Why it works</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-700">
              {tpl.why.map((w) => <li key={w} className="flex gap-2.5"><Icon.Check className="mt-1 h-3 w-3 shrink-0 text-slate-900" /><span>{w}</span></li>)}
            </ul>
          </div>

          {refs.length > 0 && (
            <div className="fx-in mt-7 border-t border-slate-900/[.08] pt-5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">References · {refs.length}</p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                <button onClick={() => setShot(-1)} aria-pressed={shot < 0} aria-label="Play the video" className={`${thumb} ${shot < 0 ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`}>
                  <img src={TEMPLATE_IMGS[tpl.id]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-slate-950/25"><Icon.Play className="h-5 w-5 text-white" /></span>
                </button>
                {refs.map((src, i) => (
                  <button key={src} onClick={() => setShot(i)} aria-pressed={shot === i} aria-label={`Show reference frame ${i + 1}`} className={`${thumb} ${shot === i ? "ring-slate-950" : "ring-transparent hover:ring-slate-300"}`}>
                    <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="fx-in mt-auto pt-8">
            <div className="grid gap-3">
              <button id="look-product" onClick={() => onProduct(tpl, "exact")} className="group relative flex min-h-[132px] flex-col justify-between rounded-2xl bg-slate-950 p-6 text-left text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45">One result</span>
                <span className="mt-6 block pr-12">
                  <span className="block text-[17px] font-semibold leading-snug tracking-[-0.01em]">Put my product in this ad</span>
                  <span className="mt-2 block text-[13px] leading-relaxed text-white/65" style={{ textWrap: "pretty" }}>The same ad, one to one, with your real product swapped in.</span>
                </span>
                <span aria-hidden="true" className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-sm transition duration-500 group-hover:translate-x-0.5 group-hover:bg-white group-hover:text-slate-950">→</span>
              </button>
              <button id="look-inspired" onClick={() => onProduct(tpl, "inspired")} className="group relative flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-900/[.1] bg-white p-6 text-left text-slate-950 shadow-sm shadow-slate-900/[.03] transition hover:border-slate-900/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/15">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">3 options</span>
                <span className="mt-6 block pr-12">
                  <span className="block text-[17px] font-semibold leading-snug tracking-[-0.01em]">Create a new image inspired by it</span>
                  <span className="mt-2 block text-[13px] leading-relaxed text-slate-500" style={{ textWrap: "pretty" }}>A brand new ad with your product, in the mood of this one. Pick the one you like.</span>
                </span>
                <span aria-hidden="true" className="absolute right-6 top-6 grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm text-slate-900 transition duration-500 group-hover:translate-x-0.5 group-hover:bg-slate-950 group-hover:text-white">→</span>
              </button>
            </div>

            <div className="sx-actions mt-6">
              {isVideo && (
                <button onClick={() => onInspire(tpl)} className="sx-action">
                  <span><b>Make a new one inspired by it</b><small>A new video in this style with your brand, product and logo.</small></span><i aria-hidden="true">→</i>
                </button>
              )}
              <button onClick={() => onExamine(tpl)} className="sx-action">
                <span><b>Examine an ad of mine</b><small>Check your own ad against this template.</small></span><i aria-hidden="true">→</i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { LookModal };
