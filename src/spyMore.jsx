import { useState } from "react";
import { Icon } from "./ui";
import { apiFetch, isCancel } from "./api.js";
import { track } from "./track.js";
import { useBillingOn, COSTS } from "./billing.js";

/* Competitor Analysis for Google and TikTok: the same steps as Meta (search a brand, or paste the library link, then
   analyze), read by the server through /spy/find and /spy/read. */

const LIBS = {
  google: {
    label: "Google Ads Transparency Center", url: "https://adstransparency.google.com/", ph: "https://adstransparency.google.com/advertiser/AR…",
    searchPh: "Search a brand or website, e.g. Glossier or glossier.com", tries: ["Glossier", "Gymshark", "Allbirds"],
  },
  tiktok: {
    label: "TikTok ad library", url: "https://library.tiktok.com/ads", ph: "https://library.tiktok.com/ads?…adv_name=…&adv_biz_ids=…",
    searchPh: "Search a brand, e.g. Gymshark", tries: ["Gymshark", "Glossier", "Rhode"],
  },
};

// A pasted library link (or a bare Google advertiser id) -> { id, name } for the server, or an error message.
function parseLink(platform, raw) {
  const t = raw.trim();
  if (!t) return null;
  if (platform === "google") {
    const m = t.match(/\b(AR\d{10,})\b/);
    return m ? { id: m[1], name: "" } : { error: "That doesn't look like a Google Ads Transparency Center advertiser link. Open the advertiser there and copy the address." };
  }
  let u;
  try { u = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t); } catch (e) { return { error: "That doesn't look like a link." }; }
  if (!/(^|\.)tiktok\.com$/i.test(u.hostname)) return { error: "That isn't a TikTok ad library link." };
  const ids = u.searchParams.get("adv_biz_ids"), name = u.searchParams.get("adv_name");
  if (ids && name) return { id: ids.split(",")[0].trim(), name };
  return { error: "Open the advertiser's \"See all ads\" page in the TikTok ad library and copy that address. It has the advertiser's name and id in it." };
}

export default function OtherPlatform({ platform, onDone, notify }) {
  const lib = LIBS[platform];
  const billingOn = useBillingOn();
  const [find, setFind] = useState({ q: "", busy: false, err: "", list: null });
  const [raw, setRaw] = useState("");
  const [picked, setPicked] = useState(null);   // { id, name } from the search
  const [run, setRun] = useState({ busy: false, err: "" });
  const link = raw.trim() ? parseLink(platform, raw) : null;
  const target = link && !link.error ? link : picked;

  const search = async (override) => {
    const q = (typeof override === "string" ? override : find.q).trim();
    if (q.length < 2 || find.busy) return;
    setFind((f) => ({ ...f, q, busy: true, err: "", list: null }));
    try {
      const j = await apiFetch("/spy/find", { body: { platform, q }, timeout: 30000 });
      setFind((f) => ({ ...f, busy: false, list: Array.isArray(j.brands) ? j.brands : [] }));
      track("spy_platform_search", { platform, results: (j.brands || []).length });
    } catch (e) { setFind((f) => ({ ...f, busy: false, err: e.message || "Search failed. Try again." })); }
  };
  const pick = (b) => { setPicked({ id: b.id, name: b.name }); setRaw(""); setFind({ q: "", busy: false, err: "", list: null }); setRun({ busy: false, err: "" }); };

  const analyze = async () => {
    if (!target || run.busy) return;
    setRun({ busy: true, err: "" });
    track("spy_analyze", { method: "platform", platform });
    try {
      const out = await apiFetch("/spy/read", { body: { platform, id: target.id, name: target.name }, timeout: 170000 });
      setRun({ busy: false, err: "" });
      onDone(out);
    } catch (e) {
      if (isCancel(e)) { setRun({ busy: false, err: "" }); return; }
      setRun({ busy: false, err: (e && e.message) || "Couldn't reach the AdDoctor server. Try again." });
      notify && notify("The analysis didn't finish");
    }
  };

  return (
    <div>
      <p className="mt-1 text-sm text-slate-500">Search a brand by name, or paste its <a href={lib.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">{lib.label}</a> link. AdDoctor reads the ads from that page, studies the creatives and writes the analysis.</p>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }} role="search">
        <div className="relative min-w-0 flex-1">
          <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={find.q} onChange={(e) => setFind((f) => ({ ...f, q: e.target.value }))} placeholder={lib.searchPh} aria-label={`Search a brand in the ${lib.label}`} className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
        </div>
        <button type="submit" disabled={find.q.trim().length < 2 || find.busy} className="h-12 shrink-0 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50">{find.busy ? "Searching…" : "Search"}</button>
      </form>
      {!find.list && !find.busy && (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          Try
          {lib.tries.map((b) => (
            <button key={b} type="button" onClick={() => search(b)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700">{b}</button>
          ))}
        </p>
      )}
      {find.err && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{find.err}</p>}
      {find.list && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          {find.list.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No advertisers found with that name.</p>}
          {find.list.map((b) => (
            <button key={b.id} onClick={() => pick(b)} className="flex w-full items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 text-left transition last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 focus:outline-none">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">{b.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{b.name}</span>
                {b.sub && <span className="block truncate text-xs text-slate-500">{b.sub}</span>}
              </span>
              <span className="shrink-0 text-xs font-semibold text-blue-600">Select</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">or paste a link</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input value={raw} onChange={(e) => { setRaw(e.target.value); setRun({ busy: false, err: "" }); }} onKeyDown={(e) => { if (e.key === "Enter" && target && !run.busy) analyze(); }} placeholder={lib.ph} aria-label={`${lib.label} link`} className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/10" />
        <button onClick={analyze} disabled={!target || run.busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-7 text-sm font-semibold text-white shadow-sm shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
          <Icon.Sparkle className="h-4 w-4" />{run.busy ? "Reading…" : `Analyze${billingOn ? ` · ${COSTS.analyze} credits` : ""}`}
        </button>
      </div>
      {link && link.error && <p role="alert" className="mt-2 text-sm font-medium text-rose-600">{link.error}</p>}
      {target && !run.busy && !run.err && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Icon.Check className="h-3.5 w-3.5" />Advertiser ready{target.name ? `: ${target.name}` : ""}</p>}
      {run.busy && (
        <div className="mt-4" role="status">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-slate-950" /></div>
          <p className="mt-2 text-xs text-slate-600">Reading the {lib.label}, looking at the creatives and writing the analysis… This can take a minute. Keep this page open.</p>
        </div>
      )}
      {run.err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{run.err}</p>}
    </div>
  );
}
