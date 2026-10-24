import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";
import { TEMPLATES } from "./data";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import { SPY_ANGLE } from "./angles.js";
import { copyText, field } from "./shared.js";
import { readJSON, writeJSON } from "./storage.js";
import { track } from "./track.js";

/* The Idea Engine: say what you sell and it deals a hand of ready ad ideas for it. Each idea is one of the ways
   long-running ads make their case (angles.js): hooks written for your product, the shot to take, a real ad from
   the library (public/library, ads that ran a month or more) that used the same pattern, and the template that
   builds it. It is all worked out in the page, so dealing and shuffling are free and instant. */

const KEY = "addoctor.ideas.v1";
const HAND = 6;
const EXAMPLE = { product: "Vitamin C serum", benefit: "fades dark spots in 4 weeks", offer: "", audience: "" };
const lib = (p) => new URL("library/" + p, document.baseURI).href;
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

// {p} product, {b} what it does (a verb phrase: "fades dark spots"), {o} the offer, {a} who it is for. A capital
// letter capitalises the value. [Square brackets] are for the visitor to fill in with their own real numbers.
const PLAYS = {
  proof: { hue: "245, 158, 11", best: "Cold audiences", why: "People trust other buyers more than they trust the brand.", shot: "Your product beside two or three real review quotes, stars first.", hooks: [
    "\"The first {p} that actually {b}.\" ★★★★★",
    "[X] five-star reviews later: the {p} that {b}",
    "{A} keep reordering this {p}. Here's why.",
    "\"I was sceptical. It really {b}.\"",
  ] },
  problem: { hue: "244, 63, 94", best: "Cold audiences", why: "Naming the pain makes the right people stop scrolling.", shot: "A split frame: the problem on one side, your product fixing it on the other.", hooks: [
    "Tried everything and nothing {b}? Try this.",
    "If nothing you've tried {b}, read this.",
    "Stop paying for products that promise and don't deliver.",
    "The {p} for {a} who are done with quick fixes.",
  ] },
  mechanism: { hue: "16, 185, 129", best: "People who need a reason", why: "Showing how it works turns a claim into a reason to believe it.", shot: "A close-up of the product with three labels pointing at what makes it work.", hooks: [
    "How this {p} {b} (it's not what you think)",
    "The one detail that makes this {p} work",
    "Here's exactly how it {b}.",
  ] },
  offer: { hue: "43, 89, 255", best: "Warm audiences and sales", why: "A clear deal gives people a reason to buy today instead of later.", shot: "The product front and centre, the offer in big type, styled like a receipt or price tag.", hooks: [
    "{O}: the {p} that {b}",
    "{O}. It {b}.",
    "Your new favourite {p}, now {o}",
  ] },
  urgency: { hue: "234, 88, 12", best: "Retargeting", why: "A real deadline moves people who were already interested.", shot: "The product with an 'ends [day]' sticker or a simple countdown.", hooks: [
    "Ends [day]: {o}",
    "Last chance for {o}",
    "Only [N] left: the {p} that {b}",
  ] },
  compare: { hue: "124, 92, 255", best: "Shoppers comparing options", why: "Side by side, your advantage is obvious in a second.", shot: "Two columns: yours against the usual kind, with ticks and crosses.", hooks: [
    "{P} vs. the one you're using now",
    "Others promise. This {p} {b}.",
    "Why {a} are switching to this {p}",
  ] },
  founder: { hue: "180, 120, 80", best: "Building trust", why: "A real person behind the product makes it feel safe to try.", shot: "A short handwritten-style note next to the product, or the founder holding it.", hooks: [
    "I made this {p} because nothing else {b}.",
    "I couldn't find a {p} that {b}. So I made one.",
    "A note from the founder: why our {p} {b}",
  ] },
  ugc: { hue: "236, 72, 153", best: "TikTok and Reels", why: "It looks like a post from a friend, not like an ad.", shot: "Phone-camera look: a hand holding the product, a caption in native text style.", hooks: [
    "I tried this {p} for [time]. Here's what happened.",
    "POV: you finally found a {p} that {b}",
    "My honest take on this {p} after [time]",
  ] },
  new: { hue: "14, 165, 233", best: "Launches", why: "New is a reason to look, even for people who already know you.", shot: "A clean hero shot on a plain backdrop with a small 'New' badge.", hooks: [
    "New: the {p} that {b}",
    "Introducing our {p}. It {b}.",
    "Just launched: {p}, made for {a}",
  ] },
};
const IDS = Object.keys(PLAYS);

const clean = (s) => String(s || "").trim().replace(/[.!\s]+$/, "");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function fill(t, v) {
  const b = clean(v.benefit);
  const vals = {
    p: clean(v.product) || "product",
    b: (/^[A-Z][a-z]/.test(b) ? b.charAt(0).toLowerCase() + b.slice(1) : b) || "does what it promises",
    o: clean(v.offer) || "[your offer]",
    a: clean(v.audience) || "people",
  };
  return t.replace(/\{([pboaPBOA])\}/g, (m, k) => (k === k.toUpperCase() ? cap(vals[k.toLowerCase()]) : vals[k]));
}

// A small seeded random, so the same seed always deals the same hand (and a kept card keeps its own hooks).
function rand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hashOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

function deal(seed, kept, hasOffer) {
  const r = rand(seed);
  const rest = shuffle(IDS.filter((id) => !(id in kept)), r);
  // With an offer typed in, the offer idea is always in the hand.
  if (hasOffer && rest.includes("offer")) rest.unshift(...rest.splice(rest.indexOf("offer"), 1));
  return [...IDS.filter((id) => id in kept), ...rest].slice(0, Math.max(HAND, Object.keys(kept).length));
}

// What the library says about each pattern: the longest-running examples and the median run, from real ads only.
function evidence(ads) {
  const out = {};
  for (const id of IDS) {
    const list = ads.filter((a) => a.tags.includes(id)).sort((x, y) => y.days - x.days);
    if (!list.length) continue;
    const d = list.map((a) => a.days).sort((x, y) => x - y);
    out[id] = { top: list.slice(0, 8), n: list.length, median: d[Math.floor(d.length / 2)] };
  }
  return out;
}

// Square-bracket parts are the visitor's to fill in, so they are marked.
const Hook = ({ text }) => text.split(/(\[[^\]]+\])/).map((part, i) => (/^\[.*\]$/.test(part)
  ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">{part}</mark>
  : <span key={i}>{part}</span>));

function IdeaCard({ id, n, seed, values, ev, kept, onKeep, onMake, onCopy }) {
  const play = PLAYS[id];
  const angle = SPY_ANGLE[id];
  const r = rand(seed + hashOf(id));
  const order = shuffle(play.hooks.map((_, i) => i), r);
  const [main, setMain] = useState(0);
  const hooks = order.map((i) => fill(play.hooks[i], values));
  const hook = hooks[main];
  const ad = ev && ev.top[Math.floor(r() * ev.top.length)];
  const tpl = TEMPLATES.find((t) => t.id === angle.tpl);
  return (
    <article className="deal-in bento-soft flex flex-col overflow-hidden rounded-3xl p-5 shadow-[var(--shadow-soft)] ring-1 ring-slate-200/70" style={{ "--hue": play.hue, "--i": n }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><span className="tabular-nums" style={{ color: `rgb(${play.hue})` }}>{String(n + 1).padStart(2, "0")}</span> · {angle.label}</p>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 ring-1 ring-slate-200">{play.best}</span>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[19px] font-extrabold leading-snug tracking-tight text-slate-950"><Hook text={hook} /></h3>
        <button onClick={() => onCopy(hook, id)} aria-label="Copy this hook" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white hover:text-slate-800 ${ring}`}><Icon.Copy className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 space-y-1">
        {hooks.map((h, i) => i !== main && (
          <button key={i} onClick={() => setMain(i)} className={`block w-full rounded-lg px-2 py-1 text-left text-[13px] leading-snug text-slate-600 transition hover:bg-white/80 hover:text-slate-900 ${ring}`} title="Use this hook">
            <span className="mr-1 text-slate-400">↳</span><Hook text={h} />
          </button>
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-[12.5px] leading-relaxed">
        <div><dt className="inline font-semibold text-slate-900">The shot: </dt><dd className="inline text-slate-600">{play.shot}</dd></div>
        <div><dt className="inline font-semibold text-slate-900">Why it works: </dt><dd className="inline text-slate-600">{play.why}</dd></div>
      </dl>

      {ad && (
        <a href={`https://www.facebook.com/ads/library/?id=${encodeURIComponent(ad.id)}`} target="_blank" rel="noopener noreferrer" className={`mt-4 flex items-center gap-3 rounded-2xl bg-white/70 p-2 ring-1 ring-slate-200/80 transition hover:bg-white ${ring}`}>
          <img src={lib(ad.img)} alt="" width="40" height="50" loading="lazy" decoding="async" className="h-[50px] w-10 shrink-0 rounded-lg object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Proven pattern</span>
            <span className="block truncate text-[12.5px] font-semibold text-slate-900">{ad.brand} ran this for {ad.days} days</span>
            <span className="block text-[11px] text-slate-500">Median {ev.median} days across {ev.n} {ev.n === 1 ? "ad" : "ads"} like it</span>
          </span>
          <Icon.Arrow className="h-3.5 w-3.5 shrink-0 -rotate-45 text-slate-400" />
        </a>
      )}

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button onClick={() => onMake(angle.tpl, hook, id)} className={`btn-ink inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold active:scale-[.98] ${ring}`}>
          {TEMPLATE_IMGS[angle.tpl] && <img src={TEMPLATE_IMGS[angle.tpl]} alt="" className="h-5 w-4 rounded-[3px] object-cover ring-1 ring-white/30" />}
          Make it
        </button>
        <button onClick={() => onKeep(id, seed)} aria-pressed={kept} aria-label={kept ? "Stop keeping this idea" : "Keep this idea when shuffling"} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition ${ring} ${kept ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
          <Icon.Bookmark className="h-4 w-4" />
        </button>
      </div>
      {tpl && <p className="mt-2 text-center text-[11px] text-slate-400">Opens “{tpl.title}” with your product and this hook</p>}
    </article>
  );
}

export function IdeasView({ onMake, notify, active = true }) {
  const [s, setS] = useState(() => {
    const v = readJSON(KEY, {});
    return { product: "", benefit: "", offer: "", audience: "", seed: 1, kept: {}, ...(v && typeof v === "object" ? v : {}) };
  });
  const [more, setMore] = useState(() => !!(s.offer || s.audience));
  const [ev, setEv] = useState({});
  const asked = useRef(false);

  useEffect(() => { writeJSON(KEY, s); }, [s]);
  useEffect(() => {
    if (!active || asked.current) return;
    asked.current = true;
    fetch(lib("ads.json"), { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && Array.isArray(j.ads)) setEv(evidence(j.ads.map((a) => ({ ...a, tags: Array.isArray(a.tags) ? a.tags : [] })))); })
      .catch(() => { /* the ideas work without their examples */ });
  }, [active]);

  const typed = !!(s.product.trim() || s.benefit.trim());
  const values = typed ? s : EXAMPLE;
  const hand = useMemo(() => deal(s.seed, s.kept, !!s.offer.trim()), [s.seed, s.kept, s.offer]);
  const set = (k) => (e) => setS((c) => ({ ...c, [k]: e.target.value }));
  const reshuffle = () => { setS((c) => ({ ...c, seed: (c.seed * 7919 + 17) % 2147483647 || 1 })); track("ideas_shuffle", { kept: Object.keys(s.kept).length }); };
  const keep = (id, seed) => setS((c) => { const k = { ...c.kept }; if (id in k) delete k[id]; else k[id] = seed; return { ...c, kept: k }; });
  const copy = async (text, id) => { const ok = await copyText(text); notify(ok === false ? "Couldn't copy. Select the text instead." : "Hook copied"); track("idea_copy", { angle: id }); };
  // The hook becomes the headline only when it is about the visitor's own product (not the example) and has no
  // [brackets] left to fill in; otherwise the template's own headline stays until they write theirs.
  const make = (tplId, hook, id) => { track("idea_make", { angle: id, template_id: tplId }); onMake(tplId, typed && !/\[[^\]]+\]/.test(hook) ? hook : ""); };

  return (
    <div className="mt-6">
      <form onSubmit={(e) => { e.preventDefault(); reshuffle(); }} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1.35fr_auto] md:items-end">
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-700">What are you selling?</span>
            <input value={s.product} onChange={set("product")} maxLength={60} placeholder={`e.g. ${EXAMPLE.product}`} className={`${field} mt-1.5 !rounded-xl`} />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-700">What does it do for people?</span>
            <input value={s.benefit} onChange={set("benefit")} maxLength={90} placeholder={`e.g. ${EXAMPLE.benefit}`} className={`${field} mt-1.5 !rounded-xl`} />
          </label>
          <button type="submit" className={`btn-ink inline-flex h-[42px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold active:scale-[.98] ${ring}`}>
            <Icon.Sparkle className="h-4 w-4" />Shuffle ideas
          </button>
        </div>
        {more ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Your offer <span className="font-normal text-slate-400">(optional)</span></span>
              <input value={s.offer} onChange={set("offer")} maxLength={60} placeholder="e.g. 20% off this week" className={`${field} mt-1.5 !rounded-xl`} />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-700">Who is it for? <span className="font-normal text-slate-400">(optional)</span></span>
              <input value={s.audience} onChange={set("audience")} maxLength={60} placeholder="e.g. women over 30" className={`${field} mt-1.5 !rounded-xl`} />
            </label>
          </div>
        ) : (
          <button type="button" onClick={() => setMore(true)} className={`mt-3 rounded text-xs font-semibold text-blue-600 hover:text-blue-700 ${ring}`}>+ Add an offer or who it's for</button>
        )}
      </form>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{typed ? `${hand.length} ideas for your ${clean(s.product) || "product"}` : "An example hand. Type your product above and it rewrites itself."}</h2>
        <p className="text-xs text-slate-500">{Object.keys(s.kept).length ? `Keeping ${Object.keys(s.kept).length}. Shuffle swaps the rest.` : "Bookmark an idea to keep it when you shuffle."}</p>
      </div>

      <div className="relative mt-4">
        <div className="bento-field pointer-events-none absolute -inset-8 -z-10" aria-hidden="true" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hand.map((id, n) => {
            const seed = id in s.kept ? s.kept[id] : s.seed;
            return <IdeaCard key={id + ":" + seed} id={id} n={n} seed={seed} values={values} ev={ev[id]} kept={id in s.kept} onKeep={keep} onMake={make} onCopy={copy} />;
          })}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button onClick={reshuffle} className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 ${ring}`}>
          <Icon.Sparkle className="h-4 w-4" />Deal a new hand
        </button>
      </div>
      <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-relaxed text-slate-500">Fill in anything in <mark className="rounded bg-amber-100 px-1 text-amber-900">[brackets]</mark> with your own real numbers. The examples are real ads that ran for a month or more; brands only keep paying for ads that work.</p>
    </div>
  );
}
