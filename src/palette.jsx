import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui";
import { TEMPLATES } from "./data";
import { useDialog } from "./dialog.jsx";

/* Ctrl/Cmd+K: one box to jump anywhere. Pages and actions first, then templates by name, niche or format.
   Arrow keys move, Enter runs, Escape closes. */

const PAGES = [
  { id: "home", label: "Home", hint: "Start page", icon: Icon.Home, keys: "home start main" },
  { id: "explore", label: "Explore Templates", hint: "Proven ad formats", icon: Icon.Grid, keys: "templates gallery browse" },
  { id: "static", label: "Create Static Ads", hint: "Make an image ad", icon: Icon.Layout, keys: "image create make" },
  { id: "pack", label: "30-Day Drop", hint: "A month of organic posts", icon: Icon.Image, keys: "posts instagram organic month" },
  { id: "spy", label: "Competitor Spy", hint: "See what a brand runs", icon: Icon.Eye, keys: "competitor ad library meta research" },
  { id: "vault", label: "Saved Vault", hint: "Reports and saved ads", icon: Icon.Bookmark, keys: "saved library reports" },
];
const ACTIONS = [
  { id: "examine", label: "Examine an ad", hint: "Score it and find the leaks", icon: Icon.Stethoscope, keys: "audit check score diagnose" },
];

const norm = (s) => String(s || "").toLowerCase();

export function CommandPalette({ onClose, onGo, onExamine, onTemplate, extra = [] }) {
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const { overlayProps } = useDialog({ onClose, panelRef, initialFocusRef: inputRef });

  const groups = useMemo(() => {
    const s = norm(q).trim();
    const hit = (x) => !s || norm(`${x.label} ${x.hint} ${x.keys}`).includes(s);
    const out = [];
    const acts = [...ACTIONS, ...extra].filter(hit).map((x) => ({ ...x, kind: "action" }));
    const pages = PAGES.filter(hit).map((x) => ({ ...x, kind: "page" }));
    if (acts.length) out.push(["Actions", acts]);
    if (pages.length) out.push(["Go to", pages]);
    if (s) {
      const tpl = TEMPLATES.filter((t) => norm(`${t.title} ${t.label} ${t.niche || ""} ${t.type}`).includes(s)).slice(0, 8)
        .map((t) => ({ id: "tpl:" + t.id, label: t.title, hint: t.label + (t.type === "video" ? " · Video" : ""), icon: t.type === "video" ? Icon.Video : Icon.Grid, kind: "template", t }));
      if (tpl.length) out.push(["Templates", tpl]);
    }
    return out;
  }, [q, extra]);
  const flat = useMemo(() => groups.flatMap(([, items]) => items), [groups]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector(`[data-i="${sel}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (it) => {
    if (!it) return;
    onClose();
    if (it.kind === "template") onTemplate(it.t);
    else if (it.id === "examine") onExamine();
    else if (it.run) it.run();
    else onGo(it.id);
  };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(flat[sel]); }
  };

  let i = -1;
  return (
    <div className="dlg-veil fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" {...overlayProps}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Jump to" className="w-full max-w-xl dlg-panel overflow-hidden rounded-[22px]">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Icon.Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Jump to a page, run an action, or find a template…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={flat[sel] ? "pal-" + sel : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {!flat.length && <p className="px-3 py-8 text-center text-sm text-slate-500">Nothing matches “{q}”.</p>}
          {groups.map(([head, items]) => (
            <div key={head} className="mb-1">
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{head}</p>
              {items.map((it) => {
                i += 1;
                const k = i;
                const on = k === sel;
                const I = it.icon;
                return (
                  <div
                    key={it.id} id={"pal-" + k} data-i={k} role="option" aria-selected={on}
                    onMouseMove={() => setSel(k)} onClick={() => run(it)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${on ? "bg-slate-100" : ""}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${on ? "border-slate-200 bg-white text-blue-600" : "border-slate-100 bg-slate-50 text-slate-500"}`}><I className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{it.label}</span>
                      <span className="block truncate text-xs text-slate-500">{it.hint}</span>
                    </span>
                    {on && <Icon.Arrow className="h-4 w-4 shrink-0 text-slate-400" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/70 px-4 py-2 font-mono text-[10px] text-slate-500">
          <span><kbd className="font-semibold">↑↓</kbd> move</span>
          <span><kbd className="font-semibold">Enter</kbd> open</span>
          <span><kbd className="font-semibold">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
