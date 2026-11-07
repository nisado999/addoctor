import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJSON, writeJSON } from "./storage.js";
import { track } from "./track.js";
import { metaStatus, metaConnectStart, metaAssets, metaSelect, metaDisconnect, metaLaunch, metaActivate } from "./metaApi.js";

/* Publish on Meta: connect Facebook, pick the ad account, Page and Pixel once, then create the ad PAUSED and turn it on
   with a second, confirmed click. The Meta login lives on the server; this file only shows state and sends clicks.
   Only a small launch record (ids, no pictures, no login) is kept in this browser. */

const KEY = "addoctor.meta.launch.v1";
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const main = "inline-flex items-center justify-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-40";
const quiet = "inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40";
const REASONS = {
  denied: "You pressed Cancel on Facebook, so nothing was connected.",
  state: "That login took too long or did not match. Press Connect to try again.",
  failed: "Facebook did not accept the login. Try again.",
  off: "Connecting Meta is not switched on yet.",
};
const toData = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// Meta takes PNG and JPEG only. Anything else (a web address, a WebP) is turned into a data URL, WebP as JPEG.
async function sendable(src) {
  if (/^data:image\/(png|jpeg);base64,/.test(src)) return src;
  const url = src.startsWith("data:") ? src : await toData(await (await fetch(src)).blob());
  if (/^data:image\/(png|jpeg);base64,/.test(url)) return url;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

export function MetaPublish({ user, notify, plan, ads }) {
  const [st, setSt] = useState(null);          // the server's /meta/status answer
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");        // connect, save, create or on
  const [assets, setAssets] = useState(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState({ adAccountId: "", pageId: "", instagramId: "", pixelId: "" });
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(() => readJSON(KEY, null));
  const lock = useRef(false);

  // The same pictures and settings always mean the same request id, so a retry never makes a second campaign.
  const sig = JSON.stringify([plan.goal, plan.budget, plan.adsets, plan.country, plan.site, ads.map((a) => [a.name, a.src.length, a.primary, a.headline, a.description])]);
  const fresh = useMemo(() => crypto.randomUUID(), [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestId = saved && saved.sig === sig ? saved.requestId : fresh;
  const shown = saved && saved.result && (saved.sig === sig || ads.length === 0) ? saved : null;

  const refresh = useCallback(async () => {
    try { setSt(await metaStatus()); setErr(""); setBusy((b) => (b === "connect" ? "" : b)); } catch (e) { setErr(e.message); setBusy((b) => (b === "connect" ? "" : b)); }
  }, []);
  useEffect(() => { if (user) refresh(); else setSt(null); }, [user && user.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let ch;
    try {
      ch = new BroadcastChannel("addoctor-meta");
      ch.onmessage = (e) => { if (e.data && e.data.error) { setBusy(""); setErr(REASONS[e.data.error] || REASONS.failed); } else notify("Facebook connected"); refresh(); };
    } catch (x) { /* no channel: the check on focus below still works */ }
    window.addEventListener("focus", refresh);
    return () => { if (ch) ch.close(); window.removeEventListener("focus", refresh); };
  }, [refresh, notify]);

  const needsPixel = plan.goal === "sales" || plan.goal === "leads";
  const picking = !!st && st.connected && (!st.selection || edit);
  useEffect(() => {
    if (!picking || assets) return;
    metaAssets().then((a) => {
      setAssets(a);
      const acct = (st.selection && a.adAccounts.find((x) => x.id === st.selection.adAccountId)) || a.adAccounts[0];
      const page = (st.selection && a.pages.find((x) => x.id === st.selection.pageId)) || a.pages[0];
      setDraft({ adAccountId: acct ? acct.id : "", pageId: page ? page.id : "", instagramId: page && page.instagram ? page.instagram.id : "", pixelId: (acct && (a.pixels[acct.id] || [])[0] || {}).id || "" });
    }).catch((e) => setErr(e.message));
  }, [picking, assets, st]);

  const fail = (e) => {
    if (e && e.data && e.data.code === "meta_reconnect") setSt((s) => (s ? { ...s, connected: false, expired: true } : s));
    setErr((e && e.message) || "Something went wrong. Try again.");
  };
  const connect = async () => {
    setErr(""); setBusy("connect");
    // Opened first, straight from the click, so the browser allows it; the Facebook address is filled in after.
    const w = window.open("", "addoctor-meta", "width=620,height=760");
    if (!w) { setBusy(""); setErr("Your browser blocked the Facebook window. Allow pop-ups for this site, then press Connect again."); return; }
    try { const { url } = await metaConnectStart(); w.location.href = url; track("meta_connect_start", {}); } catch (e) { w.close(); setBusy(""); fail(e); }
  };
  const disconnect = async () => {
    setBusy("save");
    try { await metaDisconnect(); setAssets(null); setEdit(false); await refresh(); notify("Meta disconnected"); } catch (e) { fail(e); }
    setBusy("");
  };
  const saveSel = async () => {
    setBusy("save"); setErr("");
    try { await metaSelect(draft); setEdit(false); setAssets(null); await refresh(); } catch (e) { fail(e); }
    setBusy("");
  };
  const create = async () => {
    if (busy || lock.current) return;   // the ref stops a double click that lands before the next render
    lock.current = true;
    setBusy("create"); setErr("");
    const rec = { sig, requestId, result: null, active: false };
    writeJSON(KEY, rec); setSaved(rec);
    try {
      const list = [];
      for (const a of ads) list.push({ src: await sendable(a.src), name: a.name, primary: a.primary, headline: a.headline, description: a.description });
      if (list.reduce((n, a) => n + a.src.length, 0) > 60e6) throw new Error("Those pictures are too large to send together. Remove a few, or use smaller files.");
      const r = await metaLaunch({ plan: { goal: plan.goal, budget: plan.budget, adsets: plan.adsets, ads: ads.length, country: plan.country, site: plan.site, name: plan.name }, ads: list, requestId });
      const done = { sig, requestId, result: r, active: false };
      writeJSON(KEY, done); setSaved(done); track("meta_launch_paused", { goal: plan.goal });
    } catch (e) { fail(e); }
    lock.current = false;
    setBusy("");
  };
  const turnOn = async () => {
    if (busy || lock.current) return;
    lock.current = true;
    setBusy("on"); setErr("");
    try { await metaActivate(saved.requestId); const d = { ...saved, active: true }; writeJSON(KEY, d); setSaved(d); setConfirm(false); track("meta_launch_active", { goal: plan.goal }); } catch (e) { fail(e); }
    lock.current = false;
    setBusy("");
  };

  const sel = st && st.selection;
  const cur = sel && sel.currency ? " " + sel.currency : "";
  const acct = assets && assets.adAccounts.find((x) => x.id === draft.adAccountId);
  const page = assets && assets.pages.find((x) => x.id === draft.pageId);
  const pixels = (assets && acct && assets.pixels[acct.id]) || [];
  const n = Math.min(plan.adsets, Math.max(1, ads.length));

  let body;
  if (shown) {
    body = (
      <div className="mt-3">
        <p className="text-[15px] font-semibold text-slate-900">{shown.active ? "Your ad is on." : "Created on Meta, paused."}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          {shown.active ? "Meta checks new ads first, usually within a day. After that they start showing." : "Nothing is spending yet. Look at it in Ads Manager if you like, then turn it on."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a href={shown.result.managerUrl} target="_blank" rel="noopener noreferrer" className={quiet}>Open in Ads Manager ↗</a>
          {!shown.active && !confirm && <button type="button" onClick={() => setConfirm(true)} className={main}>Turn it on</button>}
          <button type="button" onClick={() => { writeJSON(KEY, null); setSaved(null); setConfirm(false); }} className="px-2 text-xs font-semibold text-slate-500 hover:text-slate-900">Make another</button>
        </div>
        {confirm && !shown.active && (
          <div className="mt-3 rounded-xl bg-blue-50 p-3 ring-1 ring-blue-200">
            <p className="text-[13px] leading-relaxed text-slate-800">This starts spending up to <b>{plan.budget}{cur} a day</b> from your Meta ad account. You can pause it any time in Ads Manager.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy === "on"} onClick={turnOn} className={main}>{busy === "on" ? "Turning on…" : "Yes, turn it on"}</button>
              <button type="button" disabled={busy === "on"} onClick={() => setConfirm(false)} className={quiet}>Not yet</button>
            </div>
          </div>
        )}
      </div>
    );
  } else if (!user) {
    body = (
      <div className="mt-3">
        <p className="text-[13px] leading-relaxed text-slate-600">Sign in to AdDoctor first, then connect your Facebook account.</p>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("addoctor:signin-required"))} className={`${main} mt-3`}>Sign in</button>
      </div>
    );
  } else if (!st) {
    body = <p className="mt-3 text-[13px] text-slate-600">{err ? "" : "Checking your Meta connection…"}</p>;
  } else if (!st.enabled) {
    body = <p className="mt-3 text-[13px] leading-relaxed text-slate-700">Publishing from AdDoctor is not switched on yet, so nothing was sent. For now, download your ads and follow the steps at the bottom of this page. The text above is ready to paste.</p>;
  } else if (!st.connected) {
    body = (
      <div className="mt-3">
        <p className="text-[13px] leading-relaxed text-slate-600">{st.expired ? "Your Meta connection ended. Connect again to keep publishing." : "Connect your Facebook account once. AdDoctor then creates the ad on Meta for you, paused, and only turns it on when you confirm."}</p>
        <button type="button" disabled={busy === "connect"} onClick={connect} className={`${main} mt-3`}>{busy === "connect" ? "Waiting for Facebook…" : st.expired ? "Reconnect Facebook" : "Connect Facebook"}</button>
      </div>
    );
  } else if (picking) {
    body = !assets ? <p className="mt-3 text-[13px] text-slate-600">{err ? "" : "Loading your ad accounts…"}</p> : (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!assets.adAccounts.length && <p className="text-[13px] text-slate-700 sm:col-span-2">No active ad account was found on this Facebook login. Create one in Meta Business Settings, add a payment method, then come back.</p>}
        {!assets.pages.length && <p className="text-[13px] text-slate-700 sm:col-span-2">No Facebook Page was found. Ads need a Page to show from. Create one, then come back.</p>}
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Ad account</span>
          <select className={field} value={draft.adAccountId} onChange={(e) => setDraft({ ...draft, adAccountId: e.target.value, pixelId: ((assets.pixels[e.target.value] || [])[0] || {}).id || "" })}>
            {assets.adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Facebook Page</span>
          <select className={field} value={draft.pageId} onChange={(e) => { const p = assets.pages.find((x) => x.id === e.target.value); setDraft({ ...draft, pageId: e.target.value, instagramId: p && p.instagram ? p.instagram.id : "" }); }}>
            {assets.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Instagram account</span>
          <select className={field} value={draft.instagramId} onChange={(e) => setDraft({ ...draft, instagramId: e.target.value })}>
            <option value="">None, show as the Page</option>
            {page && page.instagram && <option value={page.instagram.id}>@{page.instagram.username || page.instagram.id}</option>}
          </select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Pixel{needsPixel ? " (needed for sales and leads)" : ""}</span>
          <select className={field} value={draft.pixelId} onChange={(e) => setDraft({ ...draft, pixelId: e.target.value })}>
            <option value="">None</option>
            {pixels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        {needsPixel && !pixels.length && <p className="text-[13px] text-slate-700 sm:col-span-2">This ad account has no Pixel yet. Sales and leads need one so Meta can find buyers. Install it in Events Manager, then come back.</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" disabled={busy === "save" || !draft.adAccountId || !draft.pageId || (needsPixel && !draft.pixelId)} onClick={saveSel} className={main}>{busy === "save" ? "Saving…" : "Save"}</button>
          {sel && <button type="button" onClick={() => { setEdit(false); setAssets(null); }} className={quiet}>Cancel</button>}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="mt-3">
        <p className="text-[13px] leading-relaxed text-slate-700">{plan.objective}, {n} ad set{n === 1 ? "" : "s"}, {ads.length} ad{ads.length === 1 ? "" : "s"}, {plan.budget}{cur} a day, {plan.countryName}.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">The budget is charged in your ad account currency{sel && sel.currency ? ` (${sel.currency})` : ""}. The ad is created paused: nothing spends until you turn it on.</p>
        {ads.length > 0 && ads.length < plan.ads && <p className="mt-1 text-xs text-slate-500">The plan suggests {plan.ads} ads. You can start with {ads.length} and add more later.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!busy || !ads.length} onClick={create} className={main}>{busy === "create" ? "Creating on Meta…" : "Create on Meta (paused)"}</button>
          <button type="button" onClick={() => { setEdit(true); setAssets(null); }} className={quiet}>Change account</button>
          <button type="button" disabled={!!busy} onClick={disconnect} className="px-2 text-xs font-semibold text-slate-500 hover:text-slate-900">Disconnect</button>
        </div>
        {busy === "create" && <p className="mt-2 text-xs text-slate-500">This can take up to a minute. Keep this page open.</p>}
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl bg-blue-50/60 p-4 ring-1 ring-blue-200" aria-live="polite">
      <h3 className="text-sm font-semibold text-slate-900">Publish on Meta</h3>
      {body}
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-[13px] leading-relaxed text-slate-800 ring-1 ring-rose-200">{err}</p>}
    </section>
  );
}
