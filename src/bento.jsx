import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "./data";
import { Icon, TemplateImage } from "./ui";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import SplitText from "./components/bits/SplitText/SplitText.jsx";

/* The Home screen, on pure white: a headline, one composer that does three jobs, a stream of real ad templates
   drifting across the page, and four flat links into the tools. No cards, no tints, no made-up figures: the only
   number is the gallery's own count. */

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const COUNT = TEMPLATES.length;
const STREAM = TEMPLATES.filter((t) => t.type !== "video" && TEMPLATE_IMGS[t.id]).slice(0, 16);
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const isCreative = (f) => !!f && /^(image|video)\//.test(f.type);

const MODES = [
  { id: "examine", label: "Examine Ad", hints: ["Drop an ad creative to examine…", "Paste a screenshot of your ad…", "Upload an image or a video thumbnail…"] },
  { id: "spy", label: "Competitor Spy", hints: ["Enter a competitor domain, e.g. glossier.com", "gymshark.com", "Or just a brand name…"] },
  { id: "search", label: "Template Search", hints: [`Search ${COUNT} templates…`, "Skincare, fashion, local services…", "Before and after, testimonial, UGC…"] },
];

const TILES = [
  { id: "examine", title: "Examine Ad", text: "X-ray hook, offer & CTA" },
  { id: "spy", title: "Competitor Spy", text: "Uncover live brand ads" },
  { id: "gallery", title: `${COUNT} Ad Gallery`, text: "Proven DR formats" },
  { id: "pack", title: "30-Day Pack", text: "A full month of creatives" },
];

/* The placeholder types itself out, holds, then rubs out for the next example. It only runs while the box is empty. */
function useTyped(lines, on) {
  const [out, setOut] = useState(lines[0]);
  useEffect(() => {
    const still = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!on || still) { setOut(lines[0]); return; }
    let i = 0, n = 0, dir = 1, t;
    const tick = () => {
      n += dir;
      setOut(lines[i].slice(0, n));
      if (dir === 1 && n === lines[i].length) { dir = -1; t = setTimeout(tick, 1800); return; }
      if (dir === -1 && n === 0) { dir = 1; i = (i + 1) % lines.length; t = setTimeout(tick, 350); return; }
      t = setTimeout(tick, dir === 1 ? 42 : 18);
    };
    n = 0; t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [lines, on]);
  return out || " ";
}

/* The composer: type or drop, pick what it should do in the tray, press Enter. */
function Composer({ onExamine, onSpy, onBrowse }) {
  const [mode, setMode] = useState("examine");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef(null);
  const m = MODES.find((x) => x.id === mode);
  const typed = useTyped(m.hints, !text);

  const attach = (f) => {
    if (!f) return;
    if (!isCreative(f)) { setErr("Use an image or a video file."); return; }
    setErr(""); setFile(f); setMode("examine");
  };
  const submit = () => {
    if (mode === "examine") onExamine(file || undefined);
    else if (mode === "spy") onSpy(text.trim());
    else onBrowse(text.trim());
  };
  // Paste an image anywhere on Home (outside a text field) to attach it.
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if ((t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) || (t && t.isContentEditable)) return;
      const f = Array.from((e.clipboardData && e.clipboardData.files) || []).find(isCreative);
      if (f) { e.preventDefault(); attach(f); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <div className="composer">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); attach(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        className={`overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-colors ${over ? "border-blue-500" : "border-[#E5E5E5]"}`}
      >
        <div className="flex min-h-[96px] flex-col px-5 py-[18px]">
          <textarea
            value={text} rows={2} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={typed} aria-label={m.label}
            className="w-full resize-none bg-transparent text-base leading-snug text-[#111] placeholder:text-[#999] focus:outline-none sm:text-[15px]"
          />
          <div className="mt-3 flex items-center gap-2">
            {mode === "examine" && (
              <>
                <input ref={input} type="file" accept="image/*,video/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { attach(e.target.files && e.target.files[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => input.current && input.current.click()} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-[#666] transition hover:bg-[#F4F4F4] hover:text-[#111] ${ring}`}>
                  <Icon.Upload className="h-4 w-4" /> Upload ad creative
                </button>
                {file && (
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#F4F4F4] py-1 pl-2.5 pr-1 text-xs font-medium text-[#111]">
                    <span className="max-w-[10rem] truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className={`grid h-5 w-5 place-items-center rounded-full text-[#666] hover:bg-[#E5E5E5] ${ring}`}><Icon.Close className="h-3 w-3" /></button>
                  </span>
                )}
              </>
            )}
            <button type="button" onClick={submit} aria-label={m.label} className={`ml-auto grid h-9 w-9 place-items-center rounded-lg bg-[#111] text-white transition hover:bg-black active:scale-95 ${ring}`}>
              <Icon.Arrow className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#EFEFEF] bg-[#F9F9F9] px-5 py-2.5">
          <span className="text-xs font-medium text-[#888]" id="mode-label">Mode:</span>
          <div role="radiogroup" aria-labelledby="mode-label" className="flex flex-wrap gap-1.5">
            {MODES.map((x) => (
              <button
                key={x.id} type="button" role="radio" aria-checked={mode === x.id} onClick={() => setMode(x.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${mode === x.id ? "bg-[#111] text-white" : "bg-white text-[#666] ring-1 ring-[#E5E5E5] hover:text-[#111]"} ${ring}`}
              >{x.label}</button>
            ))}
          </div>
          <span className="ml-auto hidden items-center gap-1 text-[11px] font-medium text-[#888] sm:inline-flex">
            <kbd className="rounded border border-[#E5E5E5] bg-white px-1.5 py-px font-sans">{IS_MAC ? "⌘" : "Ctrl"}</kbd>
            <kbd className="rounded border border-[#E5E5E5] bg-white px-1.5 py-px font-sans">K</kbd>
          </span>
        </div>
      </div>
      </div>
      {err && <p role="alert" className="mt-3 text-center text-xs font-medium text-rose-700">{err}</p>}

      <div className="hero-up mt-4 flex flex-wrap items-center justify-center gap-3" style={{ "--d": "300ms" }}>
        <button type="button" onClick={() => onBrowse("")} className={`inline-flex h-11 items-center rounded-full border border-[#E5E5E5] bg-white px-5 text-sm font-semibold text-[#111] transition hover:border-[#111] ${ring}`}>Explore {COUNT} Templates</button>
        <button type="button" onClick={() => onExamine()} className={`inline-flex h-11 items-center gap-1.5 rounded-full bg-[#111] px-5 text-sm font-semibold text-white transition hover:bg-black ${ring}`}>Examine an Ad <span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}

/* Real templates drifting across the page. The drift eases to a crawl while the pointer is over the stream. */
function Stream({ onPick }) {
  const track = useRef(null);
  useEffect(() => {
    const el = track.current;
    const anim = el && el.getAnimations && el.getAnimations()[0];
    if (!anim) return;
    let rate = 1, target = 1, raf = 0;
    const step = () => {
      rate += (target - rate) * 0.08;
      anim.playbackRate = rate;
      raf = Math.abs(target - rate) > 0.005 ? requestAnimationFrame(step) : 0;
    };
    const go = (t) => () => { target = t; if (!raf) raf = requestAnimationFrame(step); };
    const slow = go(0.2), fast = go(1);
    const host = el.parentElement;
    host.addEventListener("pointerenter", slow);
    host.addEventListener("pointerleave", fast);
    return () => { host.removeEventListener("pointerenter", slow); host.removeEventListener("pointerleave", fast); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="hero-up ad-stream -mx-4 overflow-hidden py-5 sm:-mx-6 lg:-mx-8" aria-label="Templates from the gallery" style={{ "--d": "420ms" }}>
      <div ref={track} className="ad-track flex w-max gap-4">
        {[...STREAM, ...STREAM].map((t, i) => (
          <button
            key={t.id + "-" + i} type="button" onClick={() => onPick(t)} tabIndex={i >= STREAM.length ? -1 : 0} aria-hidden={i >= STREAM.length ? "true" : undefined}
            aria-label={`Use the template ${t.title}`}
            className={`ad-card relative h-[250px] w-[200px] shrink-0 overflow-hidden rounded-xl bg-[#F6F6F6] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ${ring}`}
          >
            <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
            <span className="xray pointer-events-none absolute inset-0" aria-hidden="true">
              <span className="scan-sweep absolute inset-x-0 top-0 h-[2px] bg-blue-500 shadow-[0_0_14px_3px_rgba(43,89,255,.55)]" style={{ "--h": "246px" }} />
              <span className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-transparent" />
              <span className="absolute left-3 top-3 flex flex-col gap-1.5">
                {["Hook", "Offer", "CTA"].map((k, j) => (
                  <span key={k} className="xray-chip inline-flex items-center gap-1.5 self-start rounded-full bg-white py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-[#111] shadow-[0_2px_8px_rgba(0,0,0,.18)]" style={{ "--i": j }}>
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"><Icon.Check className="h-2.5 w-2.5" /></span>{k}
                  </span>
                ))}
              </span>
            </span>
            <span className="ad-badge absolute bottom-3 left-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">Use template →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Bento({ onExamine, onSpy, onPack, onBrowse, onPick }) {
  const go = { examine: () => onExamine(), spy: () => onSpy(""), gallery: () => onBrowse(""), pack: onPack };
  return (
    <section aria-label="Home" className="flex flex-col gap-[72px] pt-10 sm:pt-16">
      <div className="text-center">
        {/* React Bits SplitText: the words rise out of a mask as the page opens. */}
        <SplitText
          tag="h1" text="What are we diagnosing today?" splitType="words" effect="rise" mask delay={55} duration={0.9} textAlign="center"
          className="font-display text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] text-[#111]"
        />
        <p className="hero-up mt-3 text-[15px] text-[#666]" style={{ "--d": "200ms" }}>Examine an ad, spy on a competitor, or start from a proven template.</p>
      </div>

      <div className="-mt-6 flex flex-col gap-14">
        <Composer onExamine={onExamine} onSpy={onSpy} onBrowse={onBrowse} />
        <Stream onPick={onPick} />
      </div>

      <div className="hero-up pb-4 text-center" style={{ "--d": "520ms" }}>
        <p className="text-[13px] text-[#888]">Everything in one clinic — jump straight into a workflow</p>
        <ul role="list" className="mx-auto mt-6 grid max-w-[960px] gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={go[t.id]} className={`flat-tile relative block h-full w-full rounded-xl bg-[#F6F6F6] px-5 py-6 text-left transition-[background-color,transform] duration-300 hover:-translate-y-0.5 hover:bg-[#EFEFEF] ${ring}`}>
                <span aria-hidden="true" className="flat-go absolute right-4 top-5 text-sm text-[#111]">→</span>
                <b className="block text-sm font-semibold text-[#111]">{t.title}</b>
                <span className="mt-1 block text-[13px] text-[#666]">{t.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
