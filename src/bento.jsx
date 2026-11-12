import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "./data";
import { Icon, Mascot, TemplateImage } from "./ui";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import { FEATURED_TOP } from "./featuredOrder.js";
import { STOP, stem, hits } from "./searchTags.js";
import SplitText from "./components/bits/SplitText/SplitText.jsx";

/* The Home screen, on pure white: a headline, one composer that does four jobs, a stream of real ad presets
   drifting across the page, and four flat links into the tools. No cards, no tints, no made-up figures: the only
   numbers are counted from the gallery itself. */

const COUNT = TEMPLATES.length;
const RANK = new Map(FEATURED_TOP.map((id, i) => [id, i]));
// The carousel is the top of the Featured order: my best generated ads (see featuredOrder.js).
const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));
const STREAM = FEATURED_TOP.slice(0, 16).map((id) => BY_ID.get(id)).filter((t) => t && TEMPLATE_IMGS[t.id]);

// Search-as-you-type: the same words the gallery search uses, ranked title hits first, then the Featured order.
const FIND = new Map(TEMPLATES.map((t) => [t.id, [t.title, t.label, t.category, t.headline, ...(Array.isArray(t.tags) ? t.tags : [])].filter((x) => typeof x === "string").join(" ").toLowerCase()]));
const suggest = (q) => {
  const ws = q.toLowerCase().split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);
  if (!ws.length) return [];
  const title = (t) => ws.reduce((n, w) => n + ((t.title || "").toLowerCase().includes(w) ? 1 : 0), 0);
  return TEMPLATES.filter((t) => t.type !== "video" && TEMPLATE_IMGS[t.id] && ws.every((w) => hits(FIND.get(t.id), w)))
    .sort((a, b) => title(b) - title(a) || (RANK.get(a.id) ?? 1e9) - (RANK.get(b.id) ?? 1e9)).slice(0, 6);
};
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const isCreative = (f) => !!f && /^(image|video)\//.test(f.type);

// What each mode asks for (typed out as the placeholder) and what its button says.
const MODES = [
  { id: "search", label: "Search templates", go: "Search", hints: [`Search ${COUNT} templates...`, "sneaker sale poster", "skincare, before and after", "black friday offer", "pet food"] },
  { id: "create", label: "Create a static ad", go: "Start", hints: ["What do you sell? e.g. a vitamin C serum", "e.g. kids' winter gloves", "e.g. handmade candles"] },
  { id: "examine", label: "Examine Ad", go: "Run Diagnosis", hints: ["Paste your ad's headline or copy, or drop the creative to examine...", "Paste a screenshot of your ad...", "Upload an image or a video thumbnail..."] },
  { id: "spy", label: "Competitor Analysis", go: "Spy on Brand", hints: ["Enter a competitor domain, e.g. gymshark.com", "glossier.com", "Or just a brand name..."] },
  { id: "drop", label: "30-Day Drop", go: "Build My Drop", hints: ["Paste a store URL to plan 30 days of posts...", "https://yourstore.com"] },
];
// A web address typed into Examine is a competitor to look up, not ad copy.
const looksLikeSite = (s) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s);

const TILES = [
  { id: "create", title: "Create an Ad", text: "Answer a few questions. We find the ads that fit your niche and offer and put your product in the one you pick." },
  { id: "examine", title: "Examine an Ad", text: "10-pillar creative audit (Hook, Offer, CTA) with prescription fixes." },
  { id: "spy", title: "Competitor Analysis", text: "Enter any domain to see active ads, top products & promos." },
  { id: "drop", title: "30-Day Drop", text: "Paste a store URL to generate 30 ready-to-post monthly creatives." },
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
    t = setTimeout(tick, 400);
    return () => clearTimeout(t);
  }, [lines, on]);
  return out || " ";
}

/* The composer, built like a search engine: one pill, type, pick what it should do in the chips under it, press Enter.
   In "Search templates" mode the matching ads drop down as you type. */
function Composer({ onCreate, onExamine, onSpy, onPack, onBrowse, onPick }) {
  const [mode, setMode] = useState("search");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const input = useRef(null);
  const field = useRef(null);
  const m = MODES.find((x) => x.id === mode);
  const typed = useTyped(m.hints, !text);
  const found = mode === "search" ? suggest(text) : [];
  const showList = open && !!text.trim();

  const attach = (f) => {
    if (!f) return;
    if (!isCreative(f)) { setErr("Use an image or a video file."); return; }
    setErr(""); setFile(f); setMode("examine");
  };
  const submit = () => {
    const t = text.trim();
    if (mode === "search") { if (found[act]) onPick(found[act]); else onBrowse(t); }
    else if (mode === "create") onCreate(t);
    else if (mode === "examine") { if (!file && looksLikeSite(t)) onSpy(t); else onExamine(file || undefined, t); }
    else if (mode === "spy") onSpy(t);
    else onPack(t);
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown" && found.length) { e.preventDefault(); setOpen(true); setAct((a) => (a + 1) % found.length); }
    else if (e.key === "ArrowUp" && found.length) { e.preventDefault(); setAct((a) => (a <= 0 ? found.length - 1 : a - 1)); }
    else if (e.key === "Escape") { if (open) setOpen(false); else setText(""); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
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
    <div className="mx-auto w-full max-w-[720px]">
      <div className="composer relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
          onDrop={(e) => { e.preventDefault(); setOver(false); attach(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          className={`flex h-14 items-center gap-2 border bg-white pl-5 pr-2 text-left shadow-[0_6px_24px_rgba(0,0,0,0.07)] transition focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${showList && found.length ? "rounded-t-[28px] border-b-transparent" : "rounded-full"} ${over ? "border-blue-500" : "border-[#DADCE0] focus-within:border-[#111]"}`}
        >
          <Icon.Search className="h-5 w-5 shrink-0 text-[#666]" />
          <input
            ref={field} type="text" value={text} autoComplete="off" spellCheck="false"
            onChange={(e) => { setText(e.target.value); setOpen(true); setAct(-1); }}
            onFocus={() => setOpen(true)} onKeyDown={onKey}
            placeholder={typed} aria-label={m.label}
            role="combobox" aria-expanded={showList && found.length > 0} aria-controls="home-suggest" aria-autocomplete="list" aria-activedescendant={act >= 0 ? `home-suggest-${act}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-[#111] placeholder:text-[#666] focus:outline-none sm:text-[16px]"
          />
          {mode === "examine" && (
            <>
              <input ref={input} type="file" accept="image/*,video/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { attach(e.target.files && e.target.files[0]); e.target.value = ""; }} />
              {file ? (
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#F4F4F4] py-1 pl-2.5 pr-1 text-xs font-medium text-[#111]">
                  <span className="max-w-[7rem] truncate">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className={`grid h-5 w-5 place-items-center rounded-full text-[#666] hover:bg-[#E5E5E5] ${ring}`}><Icon.Close className="h-3 w-3" /></button>
                </span>
              ) : (
                <button type="button" onClick={() => input.current && input.current.click()} className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-[#666] transition hover:bg-[#F4F4F4] hover:text-[#111] ${ring}`}>
                  <Icon.Upload className="h-4 w-4" /><span className="hidden sm:inline">Upload creative</span>
                </button>
              )}
            </>
          )}
          {text && (
            <button type="button" onClick={() => { setText(""); setAct(-1); field.current && field.current.focus(); }} aria-label="Clear" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#666] hover:bg-[#F4F4F4] hover:text-[#111] ${ring}`}><Icon.Close className="h-4 w-4" /></button>
          )}
          <button type="button" onClick={submit} className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#111] px-4 text-[13px] font-semibold text-white transition hover:bg-black active:scale-95 ${ring}`}>
            {m.go} <span aria-hidden="true" className="hidden opacity-70 sm:inline">↵</span>
          </button>
        </div>

        {showList && found.length > 0 && (
          <ul id="home-suggest" role="listbox" aria-label="Matching templates" className="absolute inset-x-0 top-full z-30 overflow-hidden rounded-b-[28px] border border-t-0 border-[#111] bg-white pb-2 text-left shadow-[0_18px_40px_rgba(0,0,0,0.14)]">
            <li aria-hidden="true" className="mx-5 mb-1 border-t border-[#EEEEEE]" />
            {found.map((t, i) => (
              <li key={t.id} id={`home-suggest-${i}`} role="option" aria-selected={act === i}>
                <button
                  type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(i)} onClick={() => onPick(t)}
                  className={`flex w-full items-center gap-3 px-5 py-2 text-left ${act === i ? "bg-[#F4F4F5]" : ""}`}
                >
                  <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-11 w-9 shrink-0 rounded-md bg-[#F6F6F6] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#111]">{t.title}</span>
                    <span className="block truncate text-xs text-[#666]">{t.label}</span>
                  </span>
                  <span aria-hidden="true" className="text-xs font-semibold text-[#666]">Use →</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onBrowse(text.trim())} className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm font-medium text-[#444] hover:bg-[#F4F4F5]">
                <Icon.Search className="h-4 w-4 text-[#666]" /> See all results for “{text.trim()}”
              </button>
            </li>
          </ul>
        )}

      </div>
        <div role="radiogroup" aria-label="What to do" className="mt-4 flex flex-wrap justify-center gap-1.5">
          {MODES.map((x) => (
            <button
              key={x.id} type="button" role="radio" aria-checked={mode === x.id} onClick={() => { setMode(x.id); setAct(-1); field.current && field.current.focus(); }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${mode === x.id ? "bg-[#111] text-white" : "bg-white text-[#666] ring-1 ring-[#E4E4E7] hover:text-[#111]"} ${ring}`}
            >{x.label}</button>
          ))}
        </div>
      {err && <p role="alert" className="mt-3 text-center text-xs font-medium text-rose-700">{err}</p>}
    </div>
  );
}

/* Real presets drifting across the page. The drift eases to a crawl while the pointer is over the stream. */
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
    <div className="hero-up ad-stream -mx-4 overflow-hidden py-5 sm:-mx-6 lg:-mx-8" aria-label="Presets from the gallery" style={{ "--d": "420ms" }}>
      <div ref={track} className="ad-track flex w-max gap-[18px]">
        {[...STREAM, ...STREAM].map((t, i) => (
          <button
            key={t.id + "-" + i} type="button" onClick={() => onPick(t)} tabIndex={i >= STREAM.length ? -1 : 0} aria-hidden={i >= STREAM.length ? "true" : undefined}
            aria-label={`Use the preset ${t.title}`}
            className={`ad-card relative aspect-[4/5] w-[190px] shrink-0 overflow-hidden rounded-[14px] bg-[#F6F6F6] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ${ring}`}
          >
            <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
            <span className="xray pointer-events-none absolute inset-0" aria-hidden="true">
              <span className="scan-sweep absolute inset-x-0 top-0 h-[2px] bg-blue-500 shadow-[0_0_14px_3px_rgba(43,89,255,.55)]" style={{ "--h": "234px" }} />
              <span className="absolute inset-0 bg-gradient-to-t from-blue-600/20 to-transparent" />
              <span className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
                {["Hook", "Offer", "CTA"].map((k, j) => (
                  <span key={k} className="xray-chip inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2 text-[10px] font-semibold text-[#111] shadow-[0_2px_8px_rgba(0,0,0,.18)]" style={{ "--i": j }}>
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-blue-600 text-white"><Icon.Check className="h-2.5 w-2.5" /></span>{k}
                  </span>
                ))}
              </span>
            </span>
            {/* The niche the format was made for; there is no per-ad score to show, so none is made up. */}
            <span className="absolute left-3 top-3 max-w-[60%] truncate rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#111] shadow-[0_2px_8px_rgba(0,0,0,.12)]">{t.label}</span>
            <span className="ad-badge absolute bottom-3 left-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">Use Preset →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Bento({ onCreate, onExamine, onSpy, onPack, onBrowse, onPick }) {
  const go = { create: () => onCreate(""), examine: () => onExamine(), spy: () => onSpy(""), drop: () => onPack("") };
  return (
    <section aria-label="Home" className="flex flex-col gap-[72px] pt-10 sm:pt-14">
      <div className="text-center">
        <div className="hero-up"><Mascot pose="wave" className="mascot-bob mx-auto mb-3 h-24 sm:h-28" /></div>
        <div><p className="hero-up inline-flex rounded-full border border-[#E4E4E7] bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#666]">Create an Ad · {COUNT} Templates · Ad X-Ray · Competitor Analysis</p></div>
        {/* React Bits SplitText: the words rise out of a mask as the page opens. */}
        <SplitText
          tag="h1" text="Tell us what you sell. We'll make the ad." splitType="words" effect="rise" mask delay={45} duration={0.9} textAlign="center"
          className="font-display mx-auto mt-5 max-w-[22ch] text-[28px] font-extrabold leading-[1.12] tracking-[-0.035em] text-[#111] sm:max-w-none sm:text-[36px]"
        />
        <p className="hero-up mx-auto mt-2 max-w-xl text-[15px] text-[#666]" style={{ "--d": "200ms" }}>Answer a few questions about your niche, product and offer. We find the ads that fit and put your product in the one you pick.</p>
        <div className="mt-7"><Composer onCreate={onCreate} onExamine={onExamine} onSpy={onSpy} onPack={onPack} onBrowse={onBrowse} onPick={onPick} /></div>
      </div>

      <div className="-mt-12 text-center">
        <p className="text-[13px] text-[#666]">Or start from a template. Tap one to put your product in it.</p>
        <Stream onPick={onPick} />
      </div>

      <div className="hero-up pb-4 text-center" style={{ "--d": "520ms" }}>
        <p className="mb-4 text-[13px] text-[#666]">Every tool in one clinic — jump straight into a workflow</p>
        <ul role="list" className="mx-auto grid max-w-[980px] gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={go[t.id]} className={`flat-tile relative block h-full w-full rounded-xl bg-[#F6F6F7] px-5 py-[22px] text-left transition-[background-color,transform] duration-300 hover:-translate-y-0.5 hover:bg-[#EFEFEF] ${ring}`}>
                <span aria-hidden="true" className="flat-go absolute right-4 top-5 text-sm text-[#111]">→</span>
                <b className="block text-sm font-semibold text-[#111]">{t.title}</b>
                <span className="mt-1 block text-[13px] leading-relaxed text-[#666]">{t.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
