import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { CATEGORIES, TEMPLATES } from "./data";
import { Icon, Creative, TemplateCard, Sidebar } from "./ui";
import { TONE, inputKey, ExamineModal } from "./modal";
import { headline, StudioModal } from "./studio";
import { SPY_ANGLE, SpyView } from "./spy";
import { PackView } from "./pack";
import { LabView } from "./lab";
import { clamp } from "./analysis.js";

/* -------------------------------- Vault -------------------------------- */

function VaultView({ items, onOpen, onRemove, onExamine }) {
  if (!items.length) {
    return (
      <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Icon.Bookmark className="h-6 w-6" /></span>
        <p className="mt-4 text-base font-semibold text-slate-900">Your vault is empty</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">Examine an ad, then choose Save to Vault to keep the prescription here.</p>
        <button onClick={onExamine} className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700">
          <Icon.Plus className="h-4 w-4" /> Examine an ad
        </button>
      </div>
    );
  }
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <li key={it.id} onClick={() => onOpen(it)} className="flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
          <button onClick={(e) => { e.stopPropagation(); onOpen(it); }} aria-label={`Open report: ${it.headline || "saved ad"}`} className="flex items-start gap-4 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-semibold tabular-nums ring-4 ${it.tone === "good" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : it.tone === "warn" ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-rose-50 text-rose-700 ring-rose-100"}`}>{it.score}</span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{it.brand || "Untitled brand"} · {it.type === "video" ? "Video" : "Static"}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{it.headline || "No headline"}</p>
              <p className={`mt-1 text-xs font-medium ${TONE[it.tone].text}`}>{it.status}</p>
            </div>
            {it.asset && it.asset.thumb && <img src={it.asset.thumb} alt="" className="ml-auto h-14 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />}
          </button>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">Saved {new Date(it.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            <span className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); onOpen(it); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">View report</button>
              <button onClick={(e) => { e.stopPropagation(); onRemove(it.id); }} aria-label={`Remove ${it.headline || "saved report"} from vault`} className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/20"><Icon.Trash className="h-4 w-4" /></button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- App --------------------------------- */

const VIEWS = {
  explore: { title: "Explore Templates", sub: "Proven direct-response formats. Pick one, add your product, and get a prescription." },
  video: { title: "Video Generator", studio: true },
  static: { title: "Static Ads", studio: true },
  pack: { title: "Social Pack", sub: "A month of organic posts with photos, on-image text and captions. Check each one, fix it, download it." },
  lab: { title: "Template Lab", sub: "Owner tool: create the photographic template images once." },
  spy: { title: "Competitor Spy", sub: "See what a competitor is really running: their main focus, top products, promotions and sales." },
  vault: { title: "Saved Vault", sub: "Prescriptions you saved. Reopen one to re-read it or copy it again." },
};

const VAULT_KEY = "addoctor.vault.v1";
function loadVault() {
  try {
    const v = JSON.parse(localStorage.getItem(VAULT_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function App() {
  const [view, setView] = useState(() => (typeof location !== "undefined" && location.hash === "#lab" ? "lab" : "explore"));
  const [exam, setExam] = useState(null); // null = closed, else init object
  const [examKey, setExamKey] = useState(0);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [credits, setCredits] = useState(15);
  const [vault, setVault] = useState(loadVault);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [studio, setStudio] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(VAULT_KEY, JSON.stringify(vault)); } catch (e) {}
  }, [vault]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(id);
  }, [toast]);

  const notify = useCallback((msg, ms = 2000) => setToast({ msg, ms, id: Date.now() }), []);
  const openExam = useCallback((init) => { setExamKey((k) => k + 1); setExam(init || {}); }, []);
  const closeExam = useCallback(() => setExam(null), []);
  const closeStudio = useCallback(() => setStudio(null), []);
  const spend = useCallback((n) => setCredits((c) => Math.max(0, c - (Number.isFinite(n) ? n : 1))), []);

  const goto = (id) => {
    if (id === "video") { notify("The Video Generator is coming soon."); return; }
    if (id === "examine") return openExam({});
    setExam(null);
    setStudio(null);
    setView(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rebuild = (ad) => {
    const t = TEMPLATES.find((x) => x.id === SPY_ANGLE[ad.angle].tpl) || TEMPLATES[0];
    setStudio(t);
    notify(`Opened "${t.title}", the closest match to this ad's angle.`, 2600);
  };

  const saveReport = (input, r) => {
    setVault((v) => [
      { id: Date.now() + Math.random(), ...input, score: r.score, status: r.status, tone: r.tone, savedAt: Date.now() },
      ...v,
    ]);
    notify("Saved to Vault");
  };
  const removeSaved = (id) => { setVault((v) => v.filter((x) => x.id !== id)); notify("Removed from Vault"); };

  const s = q.trim().toLowerCase();
  const list = useMemo(() => {
    return TEMPLATES.filter(
      (t) =>
        (view === "explore" || t.type === view) &&
        (cat === "All" || t.category === cat) &&
        (!s || [t.title, t.label, t.category, t.framework, t.format, t.type === "video" ? "video" : "static"].join(" ").toLowerCase().includes(s))
    );
  }, [view, cat, s]);
  const vaultList = useMemo(
    () => vault.filter((v) => !s || [v.brand, v.headline, v.copy, v.status].join(" ").toLowerCase().includes(s)),
    [vault, s]
  );

  const active = exam ? "examine" : view;
  const isGrid = view !== "vault" && view !== "spy" && view !== "pack" && view !== "lab";
  const V = VIEWS[view];
  const inStudio = !!V.studio;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <Sidebar
        active={active} onNav={goto} open={menu} onClose={() => setMenu(false)} onExamine={() => openExam({})}
        credits={credits} vaultCount={vault.length} onUpgrade={() => notify("Plan upgrades aren't available in this preview.")}
      />

      <div className="min-h-screen bg-slate-50/50 lg:pl-64">
        <header className="sticky z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMenu(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Icon.Menu className="h-5 w-5" />
            </button>
            <div className="relative min-w-0 flex-1 md:max-w-md">
              <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search templates, niches, formats..." aria-label="Search templates, niches, formats"
                className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10"
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 xl:inline-flex">
                <Icon.Badge className="h-3.5 w-3.5" />
                Doctor Tier: <span className="font-semibold">Growth Specialist</span>
              </span>
              <button onClick={() => notify("Credit packs aren't available in this preview.")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700">
                <Icon.Bolt className="h-3.5 w-3.5 text-blue-600" />
                Get Credits
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
                {inStudio ? "Creative Studio" : V.title}
                {inStudio && <span className="ml-3 inline-flex translate-y-[-3px] items-center rounded-full bg-blue-50 px-2.5 py-1 align-middle text-xs font-semibold text-blue-700 ring-1 ring-blue-100">{view === "video" ? "Video" : "Static"}</span>}
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                {inStudio ? "Choose a direct-response template to synthesize a high-converting creative with your product photo." : V.sub}
              </p>
            </div>
            {view !== "spy" && view !== "pack" && view !== "lab" && <p className="text-xs font-medium tabular-nums text-slate-400">
              {isGrid ? `${list.length} ${list.length === 1 ? "template" : "templates"}` : `${vaultList.length} saved`}
            </p>}
          </div>

          {isGrid && (
            <div className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2" role="group" aria-label="Filter by niche">
                {CATEGORIES.map((c) => {
                  const on = cat === c;
                  return (
                    <button
                      key={c} onClick={() => setCat(c)} aria-pressed={on}
                      className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-100/70 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isGrid ? (
            list.length ? (
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-x-5">
                {list.map((t) => <TemplateCard
                    key={t.id} t={t}
                    {...(inStudio ? { verb: "Open Studio:", action: "Open Studio" } : {})}
                    onInspect={(tp) => (inStudio ? setStudio(tp) : openExam({ template: tp }))}
                  />)}
              </div>
            ) : (
              <div className="mt-16 flex flex-col items-center text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icon.Search className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">No templates match{q.trim() ? ` "${q.trim()}"` : " these filters"}</p>
                <p className="mt-1 text-sm text-slate-500">Try a niche like "skincare" or a format like "static".</p>
                <button onClick={() => { setQ(""); setCat("All"); }} className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">Clear filters</button>
              </div>
            )
          ) : view === "lab" ? (
            <LabView notify={notify} />
          ) : view === "pack" ? (
            <PackView notify={notify} credits={credits} onSpend={spend} />
          ) : view === "spy" ? (
            <SpyView notify={notify} onRebuild={rebuild} />
          ) : (
            <VaultView
              items={vaultList}
              onOpen={(it) => openExam({ input: { brand: it.brand, headline: it.headline, copy: it.copy, type: it.type, asset: it.asset || null } })}
              onRemove={removeSaved}
              onExamine={() => openExam({})}
            />
          )}
        </main>
      </div>

      {exam && (
        <ExamineModal
          key={examKey} init={exam} onClose={closeExam} credits={credits} onSpend={spend}
          onSave={saveReport} savedKeys={vault.map(inputKey)} notify={notify}
        />
      )}

      {studio && <StudioModal key={studio.id} tpl={studio} onClose={closeStudio} notify={notify} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div key={toast.id} role="status" className="toast-in pointer-events-auto rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-xl shadow-slate-900/25">{toast.msg}</div>
        </div>
      )}
    </div>
  );
}


export { VaultView, VIEWS, VAULT_KEY, loadVault, App };
