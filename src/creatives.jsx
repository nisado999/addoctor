import { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { copyText, SPY_API, hasFeature } from "./shared.js";
import { apiFetch, need, isCancel } from "./api.js";
import { useBillingOn, COSTS } from "./billing.js";
import { track } from "./track.js";
import { useDialog } from "./dialog.jsx";
import { useSwipe, toggleSwipe } from "./swipe.jsx";

/* A competitor's creatives as a media-first gallery, with a per-creative breakdown opened on demand.
   The breakdown is one Claude call per ad (POST /creative), made only when a creative is opened. */

const PAGE = 24;
const AWARENESS = [
  ["unaware", "Unaware"],
  ["problem", "Problem aware"],
  ["solution", "Solution aware"],
  ["product", "Product aware"],
  ["most", "Most aware"],
];
const ROWS = [
  ["hook", "Hook"],
  ["problem", "Problem"],
  ["solution", "Solution"],
  ["proof", "Proof"],
  ["offer", "Offer"],
  ["cta", "Call to action"],
];

const cache = new Map();   // libId -> breakdown, kept while the page is open

// Meta's own flag when the server sends it; otherwise an ad with no stop date is still running.
const isActive = (ad) => (typeof ad.active === "boolean" ? ad.active : ad.endMs == null);

// The Worker sends the landing page as "host/path" without a scheme. Only http(s) addresses are linked.
function landing(link) {
  const s = String(link || "").trim();
  if (!s) return "";
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : ""; } catch (e) { return ""; }
}

function useBreakdown(ad, brand) {
  const [st, setSt] = useState({ data: null, err: "", busy: false });
  useEffect(() => {
    if (!ad) return undefined;
    if (cache.has(ad.libId)) { setSt({ data: cache.get(ad.libId), err: "", busy: false }); return undefined; }
    if (!SPY_API) { setSt({ data: null, err: "Breakdowns need the AdDoctor server. Open the published page, not the preview.", busy: false }); return undefined; }
    if (!ad.img) { setSt({ data: null, err: "This ad has no image to read.", busy: false }); return undefined; }
    const c = new AbortController();
    setSt({ data: null, err: "", busy: true });
    (async () => {
      try {
        const j = need(await apiFetch("/creative", { signal: c.signal, timeout: 60000, body: { img: ad.img, headline: ad.headline, body: ad.body, cta: ad.cta, format: ad.format, days: ad.days, brand, kind: ad.kind || "ad" } }), ["hook", "tags[]"]);
        cache.set(ad.libId, j);
        setSt({ data: j, err: "", busy: false });
        track("creative_breakdown", { format: ad.format, days: ad.days });
      } catch (e) {
        if (!isCancel(e) && !c.signal.aborted) setSt({ data: null, err: e.message || "The breakdown failed. Try again.", busy: false });
      }
    })();
    return () => c.abort();
  }, [ad && ad.libId]);   // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function breakdownText(ad, b, brand) {
  const out = [`${brand || ad.advertiser || "Creative"} · ${ad.format}${ad.days !== null && ad.days !== undefined ? ` · ${ad.days} days live` : ""}`, `"${ad.headline}"`, ""];
  ROWS.forEach(([k, l]) => out.push(`${l}: ${b[k]}`));
  out.push(`Visual: ${b.visual}`, `Angle: ${b.angle}`, `Persona: ${b.persona}`);
  const aw = AWARENESS.find((a) => a[0] === b.awareness);
  if (aw) out.push(`Awareness: ${aw[1]}`);
  if (b.tags.length) out.push(`Tags: ${b.tags.join(", ")}`);
  out.push(`Why it may work: ${b.why}`);
  return out.join("\n");
}

function CreativePanel({ ad, brand, saved, onSave, onClose, onRebuild, notify }) {
  const { data, err, busy } = useBreakdown(ad, brand);
  const billingOn = useBillingOn();
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  // The app's shared dialog behaviour: Escape closes only the top dialog, Tab stays inside, the page behind stops
  // scrolling and focus goes back to the card that opened it.
  const { overlayProps } = useDialog({ onClose, panelRef, initialFocusRef: closeRef });
  const aw = data ? AWARENESS.findIndex((a) => a[0] === data.awareness) : -1;
  const winner = ad.days !== null && ad.days !== undefined && ad.days >= 30;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px]" {...overlayProps}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="creative-title" className="flex h-full w-full max-w-[980px] flex-col overflow-y-auto bg-white shadow-2xl md:flex-row">
        <div className="shrink-0 bg-slate-100 md:sticky md:top-0 md:h-full md:w-[42%]">
          <div className="grid h-full place-items-center p-4 md:p-6">
            {ad.img ? <img src={ad.img} alt={`Ad creative from ${brand || ad.advertiser || "a competitor"}`} referrerPolicy="no-referrer" className="max-h-[70vh] w-full rounded-xl object-contain md:max-h-[88vh]" /> : <p className="text-sm text-slate-500">No image for this ad.</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1 p-5 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{brand || ad.advertiser || "Competitor"}</p>
              <h2 id="creative-title" className="mt-1 text-lg font-semibold leading-snug tracking-tight text-slate-900">{ad.headline}</h2>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Icon.Close className="h-5 w-5" /></button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{ad.format}</span>
            {ad.days !== null && ad.days !== undefined && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${winner ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-white text-slate-500 ring-slate-200"}`}>{winner && <Icon.Trophy className="h-3 w-3" />}{ad.kind === "organic" ? (ad.days === 0 ? "today" : ad.days + "d ago") : ad.days + "d live"}</span>
            )}
            {ad.versions > 1 && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{ad.versions} versions</span>}
            {ad.cta && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{ad.cta}</span>}
            {(ad.stats || []).map((t) => <span key={t} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{t}</span>)}
          </div>
          {ad.body && <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{ad.body}</p>}

          <h3 className="mt-6 text-sm font-semibold text-slate-900">Creative breakdown <span className="font-normal text-slate-500">· read by Claude{billingOn ? ` · ${COSTS.breakdown} credit` : ""}</span></h3>
          {busy && (
            <div className="mt-3 space-y-3" role="status"><p className="sr-only">Reading this creative…</p>
              {ROWS.map(([k]) => <div key={k} className="h-9 motion-safe:animate-pulse rounded-lg bg-slate-100" />)}
            </div>
          )}
          <p role="status" className="sr-only">{data ? "Breakdown ready" : ""}</p>
          {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{err}</p>}
          {data && (
            <>
              <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {ROWS.map(([k, l]) => (
                  <div key={k} className="grid grid-cols-[96px_1fr] gap-3 px-3.5 py-2.5">
                    <dt className="text-xs font-semibold text-slate-500">{l}</dt>
                    <dd className={`text-[13px] leading-snug ${/^not shown/i.test(data[k]) ? "text-slate-500" : "text-slate-800"}`}>{data[k]}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Awareness stage</p>
                  <div className="mt-2 flex gap-1" role="img" aria-label={aw >= 0 ? "Targets " + AWARENESS[aw][1] : "Awareness stage not clear"}>
                    {AWARENESS.map(([id], i) => <span key={id} className={`h-2 flex-1 rounded-full ${i === aw ? "bg-blue-600" : "bg-slate-200"}`} />)}
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium text-slate-700">{aw >= 0 ? AWARENESS[aw][1] : "Not clear"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500">Target persona</p>
                  <p className="mt-2 text-[13px] leading-snug text-slate-700">{data.persona}</p>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-slate-500">Visual and angle</p>
                <p className="mt-1.5 text-[13px] leading-snug text-slate-700">{data.visual}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {data.angle !== "Not shown" && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">{data.angle}</span>}
                  {data.tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{t}</span>)}
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-blue-50/60 p-3.5 ring-1 ring-blue-100">
                <p className="text-xs font-semibold text-blue-700">Why it may be working</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{data.why}</p>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {ad.kind !== "organic" && <button onClick={() => onRebuild()} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Icon.Wand className="h-3.5 w-3.5" /> Make mine in this style</button>}
            <button onClick={onSave} aria-pressed={saved} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Icon.Bookmark className="h-3.5 w-3.5" /> {saved ? "Saved" : "Save"}</button>
            {data && <button onClick={async () => { const ok = await copyText(breakdownText(ad, data, brand)); notify(ok === false ? "Couldn't copy. Select the text manually." : "Breakdown copied"); }} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Icon.Copy className="h-3.5 w-3.5" /> Copy breakdown</button>}
            {landing(ad.link) && <a href={landing(ad.link)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><span className="truncate">{ad.kind === "organic" ? "Open the original post · " : "Landing page · "}{String(ad.link).replace(/^https?:\/\//i, "").split("/")[0]}</span><span className="sr-only"> (opens in a new tab)</span></a>}
          </div>
        </div>
      </div>
    </div>
  );
}

const ASK_IDEAS = [
  "Which angles do their longest-running ads use?",
  "What offers and discounts do they run?",
  "What did they launch in the last 30 days?",
  "Give me 5 ad ideas that would beat them",
];

// Plain-text answer: lines starting with "- " become a list, blank lines split paragraphs.
// The ads are numbered for Claude only, so references like "(ads 45, 46 and 50)" mean nothing on screen; the
// evidence thumbnails show those ads instead.
const stripRefs = (t) => String(t || "").replace(/\s*\((?:ads?|#)\s*\d+(?:\s*(?:,|and|&|-|–)\s*\d+)*\)/gi, "");

function Answer({ text }) {
  const blocks = stripRefs(text).split(/\n\s*\n/);
  return (
    <div className="space-y-2 text-[13.5px] leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^[-•]\s/.test(l))) return <ul key={i} className="space-y-1">{lines.map((l, k) => <li key={k} className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /><span>{l.replace(/^[-•]\s/, "")}</span></li>)}</ul>;
        return <p key={i}>{lines.join(" ")}</p>;
      })}
    </div>
  );
}

function AdsChat({ ads, brand, onOpen }) {
  const [q, setQ] = useState("");
  const billingOn = useBillingOn();
  const [thread, setThread] = useState([]);   // [{ q, a, evidence: [libId], err }]
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(ads.map((a) => [a.libId, a])), [ads]);
  const endRef = useRef(null);
  useEffect(() => { setThread([]); }, [ads]);

  const ask = async (question) => {
    const text = String(question || "").trim();
    if (!text || busy) return;
    setQ("");
    if (!SPY_API) { setThread((t) => [...t, { q: text, a: "", evidence: [], err: "Questions need the AdDoctor server. Open the published page, not the preview." }]); return; }
    setBusy(true);
    setThread((t) => [...t, { q: text, a: "", evidence: [], pending: true }]);
    try {
      const compact = ads.slice(0, 400).map((a) => ({ id: a.libId, format: a.format, days: a.days, start: a.startMs ? new Date(a.startMs).toISOString().slice(0, 10) : "", headline: a.headline, body: String(a.body || "").slice(0, 220), cta: a.cta }));
      const history = thread.filter((x) => x.a).slice(-4).map((x) => ({ q: x.q, a: x.a }));
      const j = need(await apiFetch("/ask", { timeout: 90000, body: { brand, question: text, ads: compact, history } }), ["answer"]);
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { q: text, a: j.answer || "No answer came back.", evidence: Array.isArray(j.evidence) ? j.evidence : [] } : x)));
      track("ads_question", { ads_count: ads.length });
    } catch (e) {
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { q: text, a: "", evidence: [], err: e.message || "The question failed. Try again." } : x)));
    }
    setBusy(false);
    const box = document.getElementById("spy-ask-input");
    if (box) box.focus({ preventScroll: true });
    setTimeout(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); }, 50);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Ask about these ads" id="spy-ask">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white"><Icon.Sparkle className="h-4 w-4" /></span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Ask about these ads</h3>
          <p className="text-xs text-slate-500">Claude answers from the {ads.length} ads read, and shows the ones it used.</p>
        </div>
      </div>

      {thread.length > 0 && (
        <div className="mt-4 space-y-5" role="log" aria-live="polite" aria-label="Answers">
          {thread.map((x, i) => (
            <div key={i}>
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 px-3.5 py-2 text-[13px] font-medium text-slate-800">{x.q}</p>
              <div className="mt-2.5">
                {x.pending && <div className="space-y-2" role="status"><span className="sr-only">Thinking…</span><div className="h-3 w-3/4 motion-safe:animate-pulse rounded bg-slate-100" /><div className="h-3 w-2/3 motion-safe:animate-pulse rounded bg-slate-100" /><div className="h-3 w-1/2 motion-safe:animate-pulse rounded bg-slate-100" /></div>}
                {x.err && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{x.err}</p>}
                {x.a && <Answer text={x.a} />}
                {x.evidence.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {x.evidence.map((id) => byId.get(id)).filter(Boolean).map((a) => (
                      <button key={a.libId} onClick={() => onOpen(a)} title={a.headline} className="relative h-24 w-[76px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                        {a.img ? <img src={a.img} alt={a.headline} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <span className="block p-1.5 text-left text-[11px] leading-tight text-slate-600">{a.headline}</span>}
                        {a.days !== null && a.days !== undefined && <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 text-[11px] font-semibold text-slate-700">{a.days}d</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {thread.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ASK_IDEAS.map((s) => <button key={s} onClick={() => { ask(s); const box = document.getElementById("spy-ask-input"); if (box) box.focus({ preventScroll: true }); }} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50">{s}</button>)}
        </div>
      )}
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input id="spy-ask-input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder={`e.g. What hooks does ${brand || "this brand"} repeat most?`} aria-label="Your question" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10" />
        <button type="submit" disabled={!q.trim() || busy} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "Thinking…" : billingOn ? `Ask · ${COSTS.ask} credits` : "Ask"}</button>
      </form>
    </section>
  );
}

const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n || 0));

// A post shaped like an ad, so the same panel can open it.
function postAsAd(p) {
  const lines = String(p.caption || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const first = (lines[0] || "").slice(0, 110);
  const age = p.ts ? Math.max(0, Math.round((Date.now() - p.ts) / 86400000)) : null;
  const days = Number.isFinite(age) ? age : null;
  return {
    id: p.platform + ":" + p.id, libId: p.platform + ":" + p.id, img: p.thumb, headline: first || "(no caption)",
    body: lines.slice(1).join(" ").slice(0, 400), cta: "", versions: 1, link: p.url, kind: "organic", advertiser: "@" + p.handle, days,
    format: p.platform === "tiktok" ? (p.carousel ? "TikTok slideshow" : "TikTok") : p.video ? "Reel" : p.carousel ? "Carousel" : "Photo",
    stats: [p.views ? fmtNum(p.views) + " views" : "", p.likes ? fmtNum(p.likes) + " likes" : "", p.comments ? fmtNum(p.comments) + " comments" : "", p.shares ? fmtNum(p.shares) + " shares" : ""].filter(Boolean),
  };
}

function OrganicPosts({ brand, hint, onOpen }) {
  const billingOn = useBillingOn();
  const [ig, setIg] = useState(hint || "");
  const [tt, setTt] = useState("");
  const [st, setSt] = useState({ busy: false, err: "", posts: null, notes: [] });
  const [plat, setPlat] = useState("All");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { if (hint) setIg((v) => v || hint); }, [hint]);

  const load = async () => {
    if (st.busy || (!ig.trim() && !tt.trim())) return;
    setSt({ busy: true, err: "", posts: null, notes: [] }); setPlat("All"); setShown(PAGE);
    try {
      const j = await apiFetch("/organic", { body: { instagram: ig.trim(), tiktok: tt.trim() }, timeout: 100000 });
      const posts = (Array.isArray(j.posts) ? j.posts : []).map((p) => ({ ...p, ad: postAsAd(p) }));
      setSt({ busy: false, err: "", posts, notes: Array.isArray(j.notes) ? j.notes : [] });
      track("organic_loaded", { instagram: !!ig.trim(), tiktok: !!tt.trim(), posts: posts.length });
    } catch (e) { setSt({ busy: false, err: e.message || "Couldn't load posts. Try again.", posts: null, notes: [] }); }
  };
  const field = "h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10";
  const list = (st.posts || []).filter((p) => plat === "All" || p.platform === plat.toLowerCase());
  const chip = (on) => "rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 " + (on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300");

  return (
    <section className="mt-10" id="spy-organic" aria-label="Organic posts">
      <h3 className="text-base font-semibold text-slate-900">Organic posts</h3>
      <p className="text-xs text-slate-500">Their best Instagram and TikTok posts, ranked by likes, comments and shares. Add a handle or a profile link.</p>
      <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input value={ig} onChange={(e) => setIg(e.target.value)} placeholder="Instagram handle, e.g. glossier" aria-label="Instagram handle" className={field} />
        <input value={tt} onChange={(e) => setTt(e.target.value)} placeholder="TikTok handle, e.g. glossier" aria-label="TikTok handle" className={field} />
        <button type="submit" disabled={st.busy || (!ig.trim() && !tt.trim())} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">{st.busy ? "Loading…" : `Find top posts${billingOn ? ` · ${COSTS.organic} credits` : ""}`}</button>
      </form>
      {st.busy && <p className="mt-2 text-xs text-slate-500">Reading the profiles. This takes about 15 seconds.</p>}
      <p role="status" className="sr-only">{st.busy ? "Loading posts" : st.posts ? st.posts.length + " posts found" : ""}</p>
      {st.err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{st.err}</p>}
      {st.notes.map((t, i) => <p key={i + t} role="alert" className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] font-medium text-amber-800 ring-1 ring-amber-100">{t}</p>)}
      {st.posts && st.posts.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter posts">
            {["All", "Instagram", "TikTok"].filter((p) => p === "All" || st.posts.some((x) => x.platform === p.toLowerCase())).map((p) => <button key={p} onClick={() => { setPlat(p); setShown(PAGE); }} aria-pressed={plat === p} className={chip(plat === p)}>{p}</button>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {list.slice(0, shown).map((p) => (
              <button key={p.platform + p.id} onClick={() => { onOpen(p.ad); track("creative_opened", { format: p.ad.format, from: "organic" }); }} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                <span className="relative block aspect-[4/5] w-full bg-slate-100">
                  {p.thumb && <img src={p.thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="absolute inset-0 h-full w-full object-cover" />}
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">{p.ad.format}</span>
                  <span className="absolute bottom-2 left-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-semibold text-white">{p.views ? fmtNum(p.views) + " views" : fmtNum(p.likes) + " likes"}</span>
                </span>
                <span className="p-3">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{p.ad.headline}</span>
                  <span className="mt-1 block truncate text-[11px] text-slate-500">{p.ad.advertiser}{p.ts ? " · " + (p.ad.days === 0 ? "today" : p.ad.days + "d ago") : ""}</span>
                </span>
              </button>
            ))}
          </div>
          {list.length > shown && <div className="mt-5 text-center"><button onClick={() => setShown((x) => x + PAGE)} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300">Show more ({list.length - shown} left)</button></div>}
        </>
      )}
    </section>
  );
}

function CreativeGallery({ ads, brand, organicHint, onRebuild, notify }) {
  const [format, setFormat] = useState("All");
  const [sort, setSort] = useState("days");
  const [onlySaved, setOnlySaved] = useState(false);
  const [onlyLong, setOnlyLong] = useState(false);
  const [status, setStatus] = useState("all");   // "all" | "active" | "inactive", like Meta's own filter
  const [shown, setShown] = useState(PAGE);
  const swiped = useSwipe();   // ads saved to the Vault, kept with their picture
  const saved = useMemo(() => swiped.map((x) => x.id), [swiped]);
  const [open, setOpen] = useState(null);
  const [canOrganic, setCanOrganic] = useState(false);
  useEffect(() => { let dead = false; hasFeature("organic").then((ok) => { if (!dead) setCanOrganic(ok); }); return () => { dead = true; }; }, []);
  const [canAsk, setCanAsk] = useState(false);   // the question box shows only once the server says it can answer
  useEffect(() => { let dead = false; hasFeature("ask").then((ok) => { if (!dead) setCanAsk(ok); }); return () => { dead = true; }; }, []);

  const formats = useMemo(() => ["All", ...Array.from(new Set(ads.map((a) => a.format).filter(Boolean)))], [ads]);
  const list = useMemo(() => {
    let a = ads.filter((x) => x.img);
    if (format !== "All") a = a.filter((x) => x.format === format);
    if (onlyLong) a = a.filter((x) => x.days !== null && x.days !== undefined && x.days >= 30);
    if (status !== "all") a = a.filter((x) => isActive(x) === (status === "active"));
    if (onlySaved) a = a.filter((x) => saved.includes(x.libId));
    a = [...a];
    if (sort === "days") a.sort((x, y) => (y.days ?? -1) - (x.days ?? -1));
    else if (sort === "new") a.sort((x, y) => (y.startMs || 0) - (x.startMs || 0));
    else a.sort((x, y) => (y.versions || 1) - (x.versions || 1));
    return a;
  }, [ads, format, sort, onlyLong, onlySaved, status, saved]);
  useEffect(() => { setShown(PAGE); }, [format, sort, onlyLong, onlySaved, ads]);

  const toggleSave = async (ad) => {
    try {
      const r = await toggleSwipe(ad, brand);
      notify(r === "saved" ? "Saved to your Vault, under Competitor ads" : "Removed from your Vault");
      if (r === "saved") track("creative_saved", { format: ad.format });
    } catch (e) { notify(e.message || "Couldn't save that ad. Try again."); }
  };
  const chip = (on) => `rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;
  const withImg = ads.filter((x) => x.img).length;

  return (
    <div className="mt-8" id="spy-gallery">
      {canAsk && <AdsChat ads={ads} brand={brand} onOpen={(a) => { setOpen(a); track("creative_opened", { format: a.format, days: a.days, from: "answer" }); }} />}
      <div className={`${canAsk ? "mt-8" : ""} flex flex-wrap items-end justify-between gap-3`}>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Creatives</h3>
          <p className="text-xs text-slate-500">{withImg} of {ads.length} ads have an image. Open one for the hook, offer, proof and who it targets.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <option value="days">Longest live</option>
            <option value="new">Newest</option>
            <option value="versions">Most versions</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter creatives">
        {formats.map((f) => <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f} className={chip(format === f)}>{f}</button>)}
        <span className="mx-1 self-center text-slate-300" aria-hidden="true">|</span>
        {[["all", "All ads"], ["active", "Active ads"], ["inactive", "Inactive ads"]].map(([id, label]) => (
          <button key={id} onClick={() => setStatus(id)} aria-pressed={status === id} className={chip(status === id)}>
            {label}{id !== "all" ? ` (${ads.filter((x) => x.img && isActive(x) === (id === "active")).length})` : ""}
          </button>
        ))}
        <span className="mx-1 self-center text-slate-300" aria-hidden="true">|</span>
        <button onClick={() => setOnlyLong((v) => !v)} aria-pressed={onlyLong} className={chip(onlyLong)}>Running 30+ days</button>
        <button onClick={() => setOnlySaved((v) => !v)} aria-pressed={onlySaved} className={chip(onlySaved)}>Saved{saved.length ? ` (${saved.filter((id) => ads.some((a) => a.libId === id)).length})` : ""}</button>
      </div>

      {list.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">No creatives match these filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {list.slice(0, shown).map((a) => {
            const winner = a.days !== null && a.days !== undefined && a.days >= 30;
            return (
              <button key={a.libId} onClick={() => { setOpen(a); track("creative_opened", { format: a.format, days: a.days }); }} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
                <span className="relative block aspect-[4/5] w-full bg-slate-100">
                  <img src={a.img} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-700 shadow-sm">{a.format}</span>
                  {saved.includes(a.libId) && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white shadow-sm"><Icon.Bookmark className="h-3 w-3" /><span className="sr-only">Saved</span></span>}
                  {a.days !== null && a.days !== undefined && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${winner ? "bg-emerald-700 text-white" : "bg-white/90 text-slate-700"}`}>{a.days}d live</span>}
                </span>
                <span className="p-3">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">{a.headline}</span>
                  {a.cta && <span className="mt-1 block truncate text-[11px] text-slate-500">{a.cta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {list.length > shown && (
        <div className="mt-5 text-center">
          <button onClick={() => setShown((n) => n + PAGE)} className="rounded-full border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Show more ({list.length - shown} left)</button>
        </div>
      )}

      {canOrganic && <OrganicPosts brand={brand} hint={organicHint} onOpen={setOpen} />}

      {open && (
        <CreativePanel
          ad={open} brand={brand} saved={saved.includes(open.libId)} onSave={() => toggleSave(open)}
          onClose={() => setOpen(null)} onRebuild={() => { const a = open; setOpen(null); onRebuild(a); }} notify={notify}
        />
      )}
    </div>
  );
}

export { CreativeGallery };
