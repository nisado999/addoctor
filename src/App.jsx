import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, useDeferredValue, Suspense } from "react";
import { CATEGORIES, TEMPLATES } from "./data";
import { Icon, TemplateCard, TemplateGrid, Sidebar, BottomNav, holdClips } from "./ui";
import { Hero } from "./hero";
import { TONE, inputKey } from "./shared.js";
import { track, setConsent, needsConsent } from "./track.js";
import { authWanted, watchAuth, signOut, deleteAccount } from "./auth.js";
import { ErrorBoundary, lazyRetry } from "./boundary.jsx";
import { useDialog, confirmDiscard, openDialogCount } from "./dialog.jsx";
import { loadVault, sanitizeVault, loadFavs, loadCredits, saveCredits, writeJSON } from "./storage.js";
import { ApiError } from "./api.js";

// What every template event carries, so GTM can report by template, category and type.
const tplInfo = (t) => ({ template_id: t.id, template_category: t.category, template_type: t.type === "video" ? "video" : "image" });
import { LookModal } from "./look";
import { TEMPLATE_VIDS } from "./templateImgs.js";

/* The gallery loads first. Each other screen is its own file, fetched when it is opened, and fetched again (a few
   times) when the network drops it. */
const ExamineModal = lazyRetry(() => import("./modal"), (m) => m.ExamineModal);
const StudioModal = lazyRetry(() => import("./studio"), (m) => m.StudioModal);
const BrandModal = lazyRetry(() => import("./use"), (m) => m.BrandModal);
const InspireModal = lazyRetry(() => import("./use"), (m) => m.InspireModal);
const ProductModal = lazyRetry(() => import("./use"), (m) => m.ProductModal);
const AuthModal = lazyRetry(() => import("./account"), (m) => m.AuthModal);
const SpyView = lazyRetry(() => import("./spy"), (m) => m.SpyView);
const PackView = lazyRetry(() => import("./pack"), (m) => m.PackView);
const LabView = lazyRetry(() => import("./lab"), (m) => m.LabView);

const scrollTop = () => {
  const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
};
const PAGE = 30; // cards added per step as the gallery scrolls
const viewWait = <p role="status" className="mt-16 text-center text-sm text-slate-500">Loading...</p>;
const STORAGE_FAIL = "Couldn't save: this browser's storage is full or blocked.";

/* While a dialog's file is still loading: a small card that says so and can be closed (Close, Escape or a click
   outside), rather than a blank veil. */
function ModalWait({ onClose }) {
  const panelRef = useRef(null);
  const { overlayProps, requestClose } = useDialog({ onClose, panelRef });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-6" {...overlayProps}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Loading" className="flex w-full max-w-[15rem] flex-col items-center rounded-3xl bg-white px-6 py-7 text-center shadow-2xl shadow-slate-900/20">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true" />
        <p role="status" className="mt-3 text-sm font-medium text-slate-600">Loading…</p>
        <button onClick={requestClose} className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Close</button>
      </div>
    </div>
  );
}

/* Each dialog loads and fails on its own: one that breaks shows its own message, and the page behind keeps working. */
function DialogSlot({ label, onClose, children }) {
  return (
    <ErrorBoundary variant="dialog" label={label} onClose={onClose}>
      <Suspense fallback={<ModalWait onClose={onClose} />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/* -------------------------------- Vault -------------------------------- */

function VaultView({ items, total, query, onClearSearch, onOpen, onRemove, onExamine }) {
  // The search box is shared with the gallery, so a search typed there can hide every saved report.
  if (!items.length && total > 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icon.Search className="h-5 w-5" /></div>
        <p className="mt-4 text-sm font-semibold text-slate-900">No saved reports match{query ? ` "${query}"` : " this search"}</p>
        <p className="mt-1 text-sm text-slate-500">You have {total} saved {total === 1 ? "report" : "reports"}.</p>
        <button onClick={onClearSearch} className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">Clear search</button>
      </div>
    );
  }
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
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{it.brand || "Untitled brand"} · {it.type === "video" ? "Video" : "Static"}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{it.headline || "No headline"}</p>
              <p className={`mt-1 text-xs font-medium ${(TONE[it.tone] || TONE.bad).text}`}>{it.status}</p>
            </div>
            {it.asset && it.asset.thumb && <img src={it.asset.thumb} alt="" className="ml-auto h-14 w-11 shrink-0 rounded-md border border-slate-200 object-cover" />}
          </button>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">Saved {new Date(it.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
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
  explore: { title: "Explore Templates", sub: "Proven direct-response formats. Pick one, add your logo, or make a new one in its style." },
  video: { title: "Video Generator", studio: true },
  static: { title: "Static Ads", studio: true },
  pack: { title: "Social Pack", sub: "A month of organic posts with photos, on-image text and captions. Check each one, fix it, download it." },
  lab: { title: "Template Lab", sub: "Owner tool: create the photographic template images once." },
  spy: { title: "Competitor Spy", sub: "See what a competitor is really running: their main focus, top products, promotions and sales." },
  vault: { title: "Saved Vault", sub: "Prescriptions you saved. Reopen one to re-read it or copy it again." },
};
// Screens that keep running work (a crawl, a pack being made): once opened they stay mounted, just hidden.
const KEEP = ["spy", "pack", "lab"];

const VAULT_KEY = "addoctor.vault.v1";
const FAVS_KEY = "addoctor.favs.v1";
const CREDITS_KEY = "addoctor.credits.v1";
const PER_DAY = 15; // free credits a day on this device
const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));
const SORTS = [["featured", "Featured"], ["trending", "Trending first"], ["az", "A to Z"]];
const QUICK = [["new", "New"], ["trending", "Trending"], ["video", "Video"], ["favs", "Favourites"]];
// The words each template can be found by, worked out once rather than on every keystroke.
const HAY = new Map(TEMPLATES.map((t) => [t.id, [
  t.title, t.label, t.category, t.niche, t.framework, t.format, t.headline, t.desc,
  ...(Array.isArray(t.tags) ? t.tags : []), t.type === "video" ? "video" : "static",
].filter((x) => typeof x === "string").join(" ").toLowerCase()]));

// index.html paints a static copy of the first screen; React takes over from it.
const FROM_SHELL = typeof document !== "undefined" && !!document.querySelector("[data-shell]");

// The site owner's sign-in emails (a comma list in .env). The server checks this as well; here it only decides what
// the Template Lab shows.
const OWNERS = String(import.meta.env.VITE_OWNER_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/* The view lives in the URL hash, so reload and the back button keep your place. */
const isView = (id) => Object.prototype.hasOwnProperty.call(VIEWS, id) && id !== "video"; // not #constructor and the like
function viewFromHash() {
  const id = typeof location !== "undefined" ? location.hash.slice(1) : "";
  return isView(id) ? id : "explore";
}
const viewUrl = (id) => (id === "explore" ? location.pathname + location.search : "#" + id);
// A screen name that does not exist (#nope, #video) is dropped from the address. Anything else in the hash
// (sign-in replies such as #error=...) is left alone.
function tidyHash() {
  const h = location.hash.slice(1);
  if (!h || isView(h) || !/^[\w-]+$/.test(h)) return;
  try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* keep the address */ }
}

/* Each open dialog adds a history entry with the same address, so Back (or a swipe back on a phone) closes the
   dialog on top instead of leaving the page. */
const DLG = "addoctorDialog";
const onDialogEntry = (n) => { try { return !!history.state && history.state[DLG] === n; } catch (e) { return false; } };

/* Free credits on this device: PER_DAY each day, refilled at the visitor's midnight and shared by every tab.
   When storage is blocked the count in memory still goes down, so a failed write never hands credits back. */
function useCredits() {
  const cur = useRef(null);
  if (!cur.current) cur.current = loadCredits(CREDITS_KEY, PER_DAY);
  const [state, setState] = useState(cur.current);
  const show = useCallback((s) => { cur.current = s; setState((p) => (p.day === s.day && p.left === s.left ? p : s)); }, []);

  // Another tab may have spent some, or a new day may have started.
  const fresh = useCallback(() => {
    const s = loadCredits(CREDITS_KEY, PER_DAY);
    const c = cur.current;
    const next = s.day === c.day ? { day: s.day, left: Math.min(s.left, c.left) } : s;
    show(next);
    return next;
  }, [show]);

  const spend = useCallback((n) => {
    const cost = Number.isFinite(n) ? Math.max(0, n) : 1;
    const c = fresh();
    const next = { day: c.day, left: Math.max(0, c.left - cost) };
    saveCredits(CREDITS_KEY, next);
    show(next);
  }, [fresh, show]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") fresh(); };
    const onStore = (e) => { if (!e.key || e.key === CREDITS_KEY) fresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fresh);
    window.addEventListener("storage", onStore);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fresh);
      window.removeEventListener("storage", onStore);
    };
  }, [fresh]);

  // A tab left open past midnight refills too.
  useEffect(() => {
    const now = new Date();
    const id = setTimeout(fresh, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now + 1000);
    return () => clearTimeout(id);
  }, [fresh, state.day]);

  return [state.left, spend];
}

function App() {
  const [view, setView] = useState(viewFromHash);
  const [exam, setExam] = useState(null); // null = closed, else init object
  const [examKey, setExamKey] = useState(0);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [credits, spend] = useCredits();
  const [vault, setVault] = useState(() => loadVault(VAULT_KEY));
  const vaultRef = useRef(vault); // the list as last stored, for writes that must know the result straight away
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [studio, setStudio] = useState(null);
  const [look, setLook] = useState(null); // template whose "use this template" view is open
  const [brand, setBrand] = useState(null); // template getting the user's logo
  const [inspire, setInspire] = useState(null); // video template being briefed as a new version
  const [user, setUser] = useState(null);                 // the signed-in visitor, or null
  const [authRun, setAuthRun] = useState(() => (authWanted() ? 1 : 0)); // 0 = no reason to load the sign-in library yet
  const [authReady, setAuthReady] = useState(() => !authWanted());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("in");         // what the sign-in dialog opens on: "in", "up" or "recovery"
  const [acct, setAcct] = useState(false);                // the account menu under the avatar
  const [askConsent, setAskConsent] = useState(needsConsent);
  const answerConsent = (ok) => { setConsent(ok); setAskConsent(false); };
  const [product, setProduct] = useState(null); // template being remade with the visitor's own product
  const [favs, setFavs] = useState(() => loadFavs(FAVS_KEY, TEMPLATE_IDS));
  const [sort, setSort] = useState("featured");
  const [quick, setQuick] = useState(null); // null | "new" | "trending" | "video" | "favs"
  const [toTop, setToTop] = useState(false);
  const searchRef = useRef(null);
  const [searchOn, setSearchOn] = useState(false); // the search box has focus
  const [shown, setShown] = useState(PAGE);
  const moreRef = useRef(null);
  const gridRef = useRef(null);
  const mainRef = useRef(null);
  const acctRef = useRef(null);
  const signinRef = useRef(null);
  const consentRef = useRef(null);
  const [consentH, setConsentH] = useState(0);

  // Spy, Pack and Lab stay mounted from their first visit, so a running job and its results survive a trip elsewhere.
  const [kept, setKept] = useState(() => (KEEP.includes(view) ? [view] : []));
  if (KEEP.includes(view) && !kept.includes(view)) setKept([...kept, view]);
  // A new screen rises in, but not the first one when index.html has already painted a copy of it.
  const [moved, setMoved] = useState(!FROM_SHELL);
  const firstView = useRef(view);
  if (!moved && view !== firstView.current) setMoved(true);
  // The Video chip can never match on the Static screen, so it is not offered there.
  if (view === "static" && quick === "video") setQuick(null);

  // Open dialogs, the one on top last.
  const open = [look && "look", brand && "brand", inspire && "inspire", product && "product", studio && "studio", exam && "exam", authOpen && "auth"].filter(Boolean);
  const anyModal = open.length > 0;
  const openRef = useRef(open);
  const viewRef = useRef(view);
  const authModeRef = useRef(authMode);
  useLayoutEffect(() => { openRef.current = open; viewRef.current = view; });

  const notify = useCallback((msg, ms = 2000) => setToast({ msg, ms, id: Date.now() }), []);

  /* "/" jumps to search, like most galleries. Ignored while typing or when a dialog is open. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (openDialogCount() > 0 || !searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    const onScroll = () => setToTop(window.scrollY > 900);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("scroll", onScroll); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    document.title = view === "explore" ? "AdDoctor – ad creative audits and templates" : `${VIEWS[view].title} – AdDoctor`;
    // The app is one page, so each screen is reported as its own page view.
    track("screen_view", { screen_name: view, page_title: document.title, page_path: location.pathname + location.hash });
  }, [view]);

  /* Saved reports and favourites live in this browser. Another tab can change them, so follow its writes. */
  const favsKept = useRef(favs); // the favourites as stored, which need no write
  const favWarned = useRef(false);
  useEffect(() => {
    const onStore = (e) => {
      if (!e.key || e.key === VAULT_KEY) { const v = loadVault(VAULT_KEY); vaultRef.current = v; setVault(v); }
      if (!e.key || e.key === FAVS_KEY) { const f = loadFavs(FAVS_KEY, TEMPLATE_IDS); favsKept.current = f; setFavs(f); }
    };
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
  }, []);
  useEffect(() => {
    if (favs === favsKept.current) return;
    favsKept.current = favs;
    if (writeJSON(FAVS_KEY, favs) || favWarned.current) return;
    favWarned.current = true; // said once is enough: the hearts still work for this visit
    notify("Couldn't save favourites: this browser's storage is full or blocked.", 3600);
  }, [favs, notify]);

  /* Videos pause behind a dialog. Focus moving in and out of dialogs is handled by each dialog (useDialog). */
  useEffect(() => { holdClips(anyModal); }, [anyModal]);

  /* Fetch the dialogs people open from the gallery once the page is idle, so the first click does not wait. Not on a
     slow or metered connection, where the visitor's own clicks come first. A failure here is simply ignored: the
     dialog is fetched again when it is opened. */
  useEffect(() => {
    const c = navigator.connection;
    if (c && (c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ""))) return;
    const warm = () => {
      ExamineModal.preload(); StudioModal.preload(); AuthModal.preload();
      // Three dialogs share one file: fetch it once, and the other two come from it.
      BrandModal.preload().then((ok) => { if (ok) { InspireModal.preload(); ProductModal.preload(); } });
    };
    const id = window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2500);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, []);

  const openExam = useCallback((init) => { setExamKey((k) => k + 1); setExam(init || {}); }, []);
  const closeExam = useCallback(() => setExam(null), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  const closeStudio = useCallback(() => setStudio(null), []);
  const closeLook = useCallback(() => setLook(null), []);
  const closeBrand = useCallback(() => setBrand(null), []);
  const closeInspire = useCallback(() => setInspire(null), []);
  const closeProduct = useCallback(() => setProduct(null), []);
  const closeAll = useCallback(() => {
    setExam(null); setStudio(null); setLook(null); setBrand(null); setInspire(null); setProduct(null); setAuthOpen(false);
  }, []);

  /* ------------------------------ Dialog history ------------------------------ */

  const pushed = useRef(0);   // our dialog entries in the history, above the screen's own entry
  const skipPop = useRef(0);  // Back steps we took ourselves, whose popstate is not the visitor's
  const depth = open.length;
  useEffect(() => {
    try {
      if (depth > pushed.current) {
        while (pushed.current < depth) { pushed.current += 1; history.pushState({ [DLG]: pushed.current }, "", location.href); }
      } else if (depth < pushed.current) {
        // Closed from inside the page: take our entries back off, so the history does not grow with every dialog.
        const top = pushed.current;
        const extra = top - depth;
        pushed.current = depth;
        if (onDialogEntry(top)) { skipPop.current += 1; history.go(-extra); }
      }
    } catch (e) { pushed.current = depth; }
  }, [depth]);
  useEffect(() => {
    const shut = (k) => {
      if (k === "auth") setAuthOpen(false);
      else if (k === "exam") setExam(null);
      else if (k === "studio") setStudio(null);
      else if (k === "product") setProduct(null);
      else if (k === "inspire") setInspire(null);
      else if (k === "brand") setBrand(null);
      else setLook(null);
    };
    const onPop = () => {
      if (skipPop.current > 0) { skipPop.current -= 1; return; }
      const list = openRef.current;
      if (!pushed.current || !list.length) return; // a move between screens: the hashchange handler deals with it
      pushed.current -= 1;
      const top = list[list.length - 1];
      // Signing in sits on top of other work and loses nothing; any other dialog asks first if it holds unsaved work.
      if (top !== "auth" && !confirmDiscard()) {
        pushed.current += 1;
        try { history.pushState({ [DLG]: pushed.current }, "", location.href); } catch (e) { /* stay anyway */ }
        return;
      }
      shut(top);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    tidyHash();
    // An email link that failed (expired, already used) comes back with the reason in the hash.
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("error_description")) {
      notify(h.get("error_description"), 4200);
      try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* keep the address */ }
    }
    const onHash = () => {
      if (openRef.current.length) {
        if (!confirmDiscard()) {
          // Stay: the address goes back to the screen that is still showing.
          try { history.replaceState(history.state, "", viewUrl(viewRef.current)); } catch (e) { /* keep the address */ }
          return;
        }
        pushed.current = 0;
        closeAll();
      }
      tidyHash();
      setView(viewFromHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [notify, closeAll]);

  /* ---------------------------------- Accounts ---------------------------------- */

  const watching = useRef(false);  // a watch on the sign-in state is running or starting
  const askedAuth = useRef(false); // the visitor pressed Sign in, so a failure to load it is worth telling them
  const quietAuth = useRef(false); // a retry the visitor did not ask for: no second message if it fails too
  const refocus = useRef(false);   // after signing in or out, focus goes to the button that took the old one's place
  const openSignIn = useCallback((mode = "in") => {
    askedAuth.current = true;
    quietAuth.current = false;
    authModeRef.current = mode;
    setAuthMode(mode);
    setAuthOpen(true);
    if (!watching.current) setAuthRun((n) => n + 1);
  }, []);
  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    // If the watch could not start, a sign-in made inside the dialog is picked up now.
    if (!watching.current && askedAuth.current) { quietAuth.current = true; setAuthRun((n) => n + 1); }
  }, []);

  useEffect(() => {
    if (!authRun) return;
    let off = null, dead = false;
    watching.current = true;
    watchAuth((u, how, event) => {
      if (dead) return;
      setUser(u);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        // Back from a reset-password email: the dialog opens on choosing a new password.
        authModeRef.current = "recovery";
        setAuthMode("recovery");
        setAuthOpen(true);
      } else if (u && authModeRef.current !== "recovery") setAuthOpen(false);
      if (u && how) {
        track("login", { method: how });
        notify(`Signed in as ${u.email}`, 2600);
        if (openRef.current.includes("auth")) refocus.current = true;
      }
      // back from Google: show any error, then drop the one-time code from the address and keep the screen
      const q = new URLSearchParams(location.search);
      if (q.has("code") || q.has("error_description")) {
        if (q.get("error_description")) notify(q.get("error_description"), 4200);
        try { history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) { /* keep the address */ }
      }
    }).then((stop) => { if (dead) stop(); else off = stop; }).catch(() => {
      watching.current = false;
      if (dead) return;
      setAuthReady(true);
      if (askedAuth.current && !quietAuth.current) notify("Couldn't load sign-in. Check your connection and try again.", 4200);
    });
    return () => { dead = true; watching.current = false; if (off) off(); };
  }, [authRun, notify]);

  // A paid feature the server only gives signed-in visitors.
  useEffect(() => {
    const onNeed = () => {
      if (!openRef.current.includes("auth")) openSignIn("in");
      notify("Sign in to use this feature.", 3200);
    };
    window.addEventListener("addoctor:signin-required", onNeed);
    return () => window.removeEventListener("addoctor:signin-required", onNeed);
  }, [openSignIn, notify]);

  useEffect(() => {
    if (!refocus.current) return;
    const el = user ? acctRef.current : signinRef.current;
    if (!el) return;
    refocus.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) el.focus({ preventScroll: true });
  }, [user, authOpen, authReady]);

  /* The account menu: arrow keys move between its items, Escape closes it and Tab moves on from the avatar. */
  const menuRef = useRef(null);
  useEffect(() => {
    if (!acct || !menuRef.current) return;
    const first = menuRef.current.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }, [acct]);
  const closeAcct = () => { if (acctRef.current) acctRef.current.focus(); setAcct(false); };
  const onMenuKey = (e) => {
    const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    const n = items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const down = e.key === "ArrowDown";
      items[i < 0 ? (down ? 0 : n - 1) : (i + (down ? 1 : -1) + n) % n].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : n - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAcct();
    } else if (e.key === "Tab") {
      closeAcct(); // focus is on the avatar now, so Tab carries on from there
    }
  };
  const doSignOut = async () => {
    closeAcct();
    refocus.current = true;
    try {
      await signOut();
      notify("Signed out");
    } catch (e) {
      refocus.current = false;
      notify("Couldn't sign out. Check your connection and try again.", 4200);
    }
  };
  const doDelete = async () => {
    closeAcct();
    if (!window.confirm("Delete your AdDoctor account? Your sign-in is removed for good. Saved reports stay in this browser.")) return;
    refocus.current = true;
    try {
      await deleteAccount();
      notify("Your account has been deleted.", 3600);
    } catch (err) {
      refocus.current = false;
      const off = !!err && (err.code === "not_configured" || err.code === "no_api" || (!!err.data && err.data.code === "not_configured"));
      notify(off ? "Account deletion isn't switched on yet. See the privacy page for how to ask." : err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.", 5200);
    }
  };

  /* ---------------------------------- Screens ---------------------------------- */

  // Returns false when the visitor chose to stay with unsaved work in a dialog.
  const goto = (id) => {
    if (id === "video") { notify("The Video Generator is coming soon."); return false; }
    if (id === "examine") { openExam({}); return true; }
    if (openRef.current.length) {
      if (!confirmDiscard()) return false;
      if (id !== view) {
        // The new screen takes the place of the dialog's entry, so Back does not land on a closed dialog.
        try { if (onDialogEntry(pushed.current)) history.replaceState(null, "", viewUrl(id)); else history.pushState(null, "", viewUrl(id)); } catch (e) { /* keep the address */ }
        pushed.current = 0;
      }
      closeAll();
    } else if (id !== view) {
      try { history.pushState(null, "", viewUrl(id)); } catch (e) { /* keep the address */ }
    }
    setView(id);
    scrollTop();
    return true;
  };

  const rebuild = (tplId) => {
    const t = TEMPLATES.find((x) => x.id === tplId) || TEMPLATES[0];
    setStudio(t);
    notify(`Opened "${t.title}", the closest match to this ad's angle.`, 2600);
  };

  // True only when the report is really stored, so Examine never says "Saved" for one that will be gone on reload.
  const saveReport = useCallback((input, r) => {
    const now = Date.now();
    const next = sanitizeVault([{ ...input, id: now + Math.random(), score: r.score, status: r.status, tone: r.tone, savedAt: now }, ...vaultRef.current]);
    if (!writeJSON(VAULT_KEY, next)) { notify(STORAGE_FAIL, 4200); return false; }
    vaultRef.current = next;
    setVault(next);
    notify("Saved to Vault");
    return true;
  }, [notify]);
  const removeSaved = useCallback((id) => {
    const next = vaultRef.current.filter((x) => x.id !== id);
    if (!writeJSON(VAULT_KEY, next)) { notify("Couldn't remove it: this browser's storage is full or blocked.", 4200); return false; }
    vaultRef.current = next;
    setVault(next);
    notify("Removed from Vault");
    return true;
  }, [notify]);
  const savedKeys = useMemo(() => vault.map(inputKey), [vault]);

  const toggleFav = useCallback((id) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f])), []);
  const pinned = useMemo(() => favs.map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean).slice(0, 4), [favs]);
  const pickPinned = useCallback((t) => {
    if (openRef.current.length && !confirmDiscard()) return;
    setExam(null); setStudio(null); setBrand(null); setInspire(null); setProduct(null); setAuthOpen(false); setLook(t);
  }, []);
  const showPinned = () => { if (!goto("explore")) return; setQ(""); setCat("All"); setQuick("favs"); };

  const dq = useDeferredValue(q); // typing stays instant while the grid catches up
  const s = dq.trim().toLowerCase();
  const words = useMemo(() => s.split(/\s+/).filter(Boolean), [s]);
  const passQuick = useCallback(
    (t) => !quick || (quick === "new" ? !!t.isNew : quick === "trending" ? !!t.trending : quick === "video" ? t.type === "video" : favs.includes(t.id)),
    [quick, favs]
  );
  const list = useMemo(() => {
    const out = TEMPLATES.filter((t) => {
      if (view !== "explore" && t.type !== view) return false;
      if (cat !== "All" && t.category !== cat) return false;
      if (!passQuick(t)) return false;
      if (!words.length) return true;
      const hay = HAY.get(t.id) || "";
      return words.every((w) => hay.includes(w));
    });
    if (sort === "az") return [...out].sort((x, y) => x.title.localeCompare(y.title));
    if (sort === "trending") return [...out].sort((x, y) => (y.trending ? 1 : 0) - (x.trending ? 1 : 0));
    return out;
  }, [view, cat, words, sort, passQuick]);
  const catCounts = useMemo(() => {
    const m = { All: 0 };
    TEMPLATES.forEach((t) => {
      if (view !== "explore" && t.type !== view) return;
      if (!passQuick(t)) return;
      m.All += 1;
      m[t.category] = (m[t.category] || 0) + 1;
    });
    return m;
  }, [view, passQuick]);
  // Niches to offer when nothing matches: the biggest ones on this screen.
  const niches = useMemo(() => {
    const m = {};
    TEMPLATES.forEach((t) => { if (view === "explore" || t.type === view) m[t.category] = (m[t.category] || 0) + 1; });
    return CATEGORIES.filter((c) => c !== "All" && c !== cat && m[c]).sort((x, y) => m[y] - m[x]).slice(0, 4);
  }, [view, cat]);
  /* The gallery is drawn a page at a time: more cards are added shortly before the end scrolls into view. */
  useEffect(() => { setShown(PAGE); }, [view, cat, quick, s, sort]);
  const more = shown < list.length;
  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShown((n) => n + PAGE); }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, more, view]);
  const filtered = cat !== "All" || !!quick || !!s;
  const clearFilters = () => { setQ(""); setCat("All"); setQuick(null); };
  const pickNiche = (c) => { setQ(""); setQuick(null); setCat(c); };
  const vaultList = useMemo(
    () => vault.filter((v) => !s || [v.brand, v.headline, v.copy, v.status].join(" ").toLowerCase().includes(s)),
    [vault, s]
  );

  /* Toasts sit above the cookie banner while it is showing, instead of covering it. */
  useLayoutEffect(() => {
    const el = consentRef.current;
    if (!el) { setConsentH(0); return; }
    const measure = () => setConsentH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [askConsent]);

  const active = exam ? "examine" : view;
  const isGrid = view !== "vault" && !KEEP.includes(view);
  const V = VIEWS[view];
  const inStudio = !!V.studio;
  const inspect = useCallback((tp) => { if (inStudio) return setStudio(tp); track("template_open", tplInfo(tp)); setLook(tp); }, [inStudio]);
  const isOwner = !!(user && user.email && OWNERS.includes(user.email.toLowerCase()));
  const quickChips = view === "static" ? QUICK.filter(([id]) => id !== "video") : QUICK;
  const noFavs = quick === "favs" && !favs.length;

  const screen = (id) => (
    id === "lab" ? <LabView notify={notify} active={view === "lab"} owner={isOwner} />
    : id === "pack" ? <PackView notify={notify} credits={credits} onSpend={spend} active={view === "pack"} />
    : <SpyView notify={notify} onRebuild={rebuild} active={view === "spy"} />
  );

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <a
        href="#main" onClick={(e) => { e.preventDefault(); if (mainRef.current) mainRef.current.focus(); }}
        className="sr-only rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-lg ring-1 ring-slate-200 focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"
      >
        Skip to main content
      </a>

      <Sidebar
        active={active} onNav={goto} open={menu} onClose={closeMenu} onExamine={() => openExam({})}
        credits={credits} creditsPerDay={PER_DAY} vaultCount={vault.length}
        pinned={pinned} pinnedTotal={favs.length} onPick={pickPinned} onShowPinned={showPinned}
      />

      <div className="min-h-screen bg-slate-50/50 lg:pl-64">
        <header className="sticky z-20 border-b border-slate-200/80 bg-white/95 lg:bg-white/85 lg:backdrop-blur" style={{ top: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setMenu(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open menu" aria-expanded={menu}>
              <Icon.Menu className="h-5 w-5" />
            </button>
            {/* Below lg the sidebar (and its logo) is off-screen, so the name goes here. On a phone it makes room
                while the visitor is typing a search. */}
            <button onClick={() => goto("explore")} aria-label="AdDoctor: Explore Templates" className={`-ml-1 shrink-0 rounded-lg p-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 lg:hidden ${searchOn ? "max-sm:hidden" : ""}`}>
              <img src="./logo.png" alt="AdDoctor" width={98} height={18} className="block h-[18px] w-auto select-none sm:h-5" draggable={false} />
            </button>
            <div className={`relative min-w-0 flex-1 md:max-w-md ${isGrid || view === "vault" ? "" : "invisible"}`}>
              <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="search" ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
                onFocus={() => setSearchOn(true)} onBlur={() => setSearchOn(false)}
                placeholder={view === "vault" ? "Search saved reports..." : "Search templates, niches, formats..."} aria-label={view === "vault" ? "Search saved reports" : "Search templates, niches, formats"}
                className="h-10 w-full rounded-full border border-slate-200 bg-slate-50/80 pl-10 pr-4 text-base text-slate-900 sm:text-sm placeholder:text-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-600/10"
              />
              {!q && <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 md:block">/</kbd>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {user ? (
                <div className="relative">
                  <button
                    id="acct" ref={acctRef} onClick={() => setAcct((v) => !v)} aria-haspopup="menu" aria-expanded={acct} aria-controls={acct ? "acct-menu" : undefined} aria-label="Your account"
                    className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"
                  >
                    {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : (user.name || user.email || "?").charAt(0).toUpperCase()}
                  </button>
                  {acct && (
                    <>
                      <button aria-hidden="true" tabIndex={-1} onClick={() => setAcct(false)} className="fixed inset-0 z-30 cursor-default" />
                      <div className="absolute right-0 top-11 z-40 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                        <p className="px-3 py-2 text-xs text-slate-500">Signed in as<span className="block truncate text-sm font-semibold text-slate-900">{user.email}</span></p>
                        <div id="acct-menu" ref={menuRef} role="menu" aria-label="Account" onKeyDown={onMenuKey}>
                          <button id="signout" role="menuitem" tabIndex={-1} onClick={doSignOut} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">Sign out</button>
                          <button id="delete-account" role="menuitem" tabIndex={-1} onClick={doDelete} className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus:bg-rose-50 focus:outline-none">Delete account</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : authReady ? (
                <button id="signin" ref={signinRef} onClick={() => openSignIn("in")} className="inline-flex items-center rounded-full bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">Sign in</button>
              ) : (
                <span className="h-9 w-9" aria-hidden="true" />
              )}
            </div>
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1} className="px-4 pb-28 pt-6 focus:outline-none sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
          <ErrorBoundary variant="view" label={view} resetKeys={[view]}>
          <div key={view} className={moved ? "view-in" : undefined}>
          {view === "explore" ? (
            <Hero onExamine={() => openExam({})} onPick={inspect} onBrowse={() => gridRef.current && gridRef.current.scrollIntoView({ behavior: "smooth", block: "start" })} />
          ) : (
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
            {view === "vault" && <p className="text-xs font-medium tabular-nums text-slate-500">{s ? `${vaultList.length} of ${vault.length}` : vault.length} saved</p>}
          </div>
          )}

          {isGrid && (
            <div ref={gridRef} className="-mx-4 mt-6 scroll-mt-20 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2" role="group" aria-label="Filter by niche">
                {CATEGORIES.map((c) => {
                  const on = cat === c;
                  return (
                    <button
                      key={c} onClick={() => setCat(c)} aria-pressed={on}
                      className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-medium transition active:scale-95 [@media(pointer:coarse)]:min-h-10 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${on ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"}`}
                    >
                      {c}
                      <span className={`ml-1.5 text-[11px] tabular-nums ${on ? "text-white/70" : "text-slate-500"}`}>{catCounts[c] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isGrid && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick filters">
                {quickChips.map(([id, label]) => {
                  const on = quick === id;
                  return (
                    <button
                      key={id} onClick={() => setQuick(on ? null : id)} aria-pressed={on}
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition [@media(pointer:coarse)]:min-h-10 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20 ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}
                    >
                      {id === "new" ? <Icon.Sparkle className="h-3.5 w-3.5" /> : id === "trending" ? <Icon.Flame className="h-3.5 w-3.5" /> : id === "video" ? <Icon.Video className="h-3.5 w-3.5" /> : <Icon.Heart className="h-3.5 w-3.5" />}
                      {label}
                      {id === "favs" && favs.length > 0 && <span className="tabular-nums text-slate-500">{favs.length}</span>}
                    </button>
                  );
                })}
                {filtered && (
                  <button onClick={clearFilters} className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">Clear filters</button>
                )}
              </div>
              <p aria-live="polite" className="ml-auto text-xs font-medium tabular-nums text-slate-500">{list.length} {list.length === 1 ? "template" : "templates"}</p>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                Sort
                <select
                  value={sort} onChange={(e) => setSort(e.target.value)}
                  className="h-8 rounded-full border border-slate-200 bg-white pl-3 pr-7 text-xs font-semibold text-slate-700 transition [@media(pointer:coarse)]:h-10 hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                >
                  {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
            </div>
          )}

          {isGrid ? (
            list.length ? (
              <>
              <TemplateGrid label={inStudio ? "Static templates" : "Templates"} className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-x-5">
                {list.slice(0, shown).map((t, i) => <TemplateCard
                    key={t.id} t={t} i={i % 10} fav={favs.includes(t.id)} onFav={toggleFav}
                    {...(inStudio ? { verb: "Open Studio:", action: "Open Studio" } : {})}
                    onInspect={inspect}
                  />)}
              </TemplateGrid>
              {more && <div ref={moreRef} className="h-24" aria-hidden="true" />}
              </>
            ) : (
              <div className="mt-16 flex flex-col items-center text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Icon.Search className="h-5 w-5" /></div>
                <p className="mt-4 text-sm font-semibold text-slate-900">{noFavs ? "No favourites yet" : `No templates match${q.trim() ? ` "${q.trim()}"` : " these filters"}`}</p>
                <p className="mt-1 text-sm text-slate-500">{noFavs ? "Tap the heart on any template to keep it here." : niches.length ? "Try one of these niches instead:" : 'Try a niche like "skincare" or a format like "static".'}</p>
                {!noFavs && niches.length > 0 && (
                  <div className="mt-4 flex max-w-md flex-wrap justify-center gap-2">
                    {niches.map((c) => (
                      <button key={c} onClick={() => pickNiche(c)} className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 [@media(pointer:coarse)]:min-h-10 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20">{c}</button>
                    ))}
                  </div>
                )}
                <button onClick={clearFilters} className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">Clear filters</button>
              </div>
            )
          ) : view === "vault" ? (
            <VaultView
              items={vaultList}
              total={vault.length}
              query={q.trim()}
              onClearSearch={() => setQ("")}
              onOpen={(it) => openExam({ input: { brand: it.brand, headline: it.headline, copy: it.copy, type: it.type, asset: it.asset || null } })}
              onRemove={removeSaved}
              onExamine={() => openExam({})}
            />
          ) : null}
          </div>
          </ErrorBoundary>

          {kept.map((id) => (
            <div key={id} hidden={view !== id}>
              <ErrorBoundary variant="view" label={id} resetKeys={[view]}>
                <Suspense fallback={viewWait}>{screen(id)}</Suspense>
              </ErrorBoundary>
            </div>
          ))}
        </main>
      </div>

      {exam && (
        <DialogSlot key={examKey} label="examine" onClose={closeExam}>
          <ExamineModal init={exam} onClose={closeExam} credits={credits} onSpend={spend} onSave={saveReport} savedKeys={savedKeys} notify={notify} />
        </DialogSlot>
      )}

      {look && (
        <DialogSlot key={look.id} label="look" onClose={closeLook}>
          <LookModal
            tpl={look} onClose={closeLook}
            onBrand={(tp) => { track("template_use", { method: "add_logo", ...tplInfo(tp) }); setLook(null); setBrand(tp); }}
            onInspire={(tp) => { track("template_use", { method: "inspired_version", ...tplInfo(tp) }); setLook(null); if (TEMPLATE_VIDS[tp.id]) setInspire(tp); else setStudio(tp); }}
            onExamine={(tp) => { track("template_use", { method: "examine", ...tplInfo(tp) }); setLook(null); openExam({ template: tp }); }}
            onProduct={(tp) => { track("template_use", { method: "my_product", ...tplInfo(tp) }); setLook(null); setProduct(tp); }}
          />
        </DialogSlot>
      )}

      {brand && <DialogSlot key={brand.id} label="brand" onClose={closeBrand}><BrandModal tpl={brand} onClose={closeBrand} notify={notify} /></DialogSlot>}
      {inspire && <DialogSlot key={inspire.id} label="inspire" onClose={closeInspire}><InspireModal tpl={inspire} onClose={closeInspire} notify={notify} credits={credits} onSpend={spend} /></DialogSlot>}
      {product && <DialogSlot key={product.id} label="product" onClose={closeProduct}><ProductModal tpl={product} onClose={closeProduct} notify={notify} credits={credits} onSpend={spend} /></DialogSlot>}
      {studio && <DialogSlot key={studio.id} label="studio" onClose={closeStudio}><StudioModal tpl={studio} onClose={closeStudio} notify={notify} /></DialogSlot>}
      {authOpen && <DialogSlot key={authMode} label="auth" onClose={closeAuth}><AuthModal onClose={closeAuth} notify={notify} initialMode={authMode} /></DialogSlot>}

      <BottomNav active={active} onNav={goto} vaultCount={vault.length} />

      {toTop && isGrid && !anyModal && (
        <button
          onClick={scrollTop} aria-label="Back to top"
          className="fixed bottom-24 right-5 z-20 grid h-11 w-11 lg:bottom-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg shadow-slate-900/10 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25"
        >
          <Icon.Arrow className="h-4 w-4 -rotate-90" />
        </button>
      )}

      {/* A notice, not a dialog: the page stays usable (and keyboard focus free) until it is answered. */}
      {askConsent && (
        <div id="consent" ref={consentRef} role="region" aria-label="Analytics cookies" className="view-in fixed inset-x-3 bottom-24 z-[55] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/15 lg:bottom-5 lg:left-auto lg:right-5 lg:mx-0">
          <p className="text-[13px] leading-relaxed text-slate-600">AdDoctor would like to use analytics cookies to see which features get used. Nothing is loaded unless you accept. <a href="./privacy.html" className="font-semibold text-blue-600 hover:text-blue-700">Privacy</a></p>
          <div className="mt-3 flex justify-end gap-2">
            <button id="consent-no" onClick={() => answerConsent(false)} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300">Decline</button>
            <button id="consent-yes" onClick={() => answerConsent(true)} className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">Accept</button>
          </div>
        </div>
      )}

      {/* Always in the page, so screen readers hear each toast as it arrives. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${askConsent && consentH ? consentH + 12 : 0}px)` }}
      >
        <div role="status" aria-live="polite" aria-atomic="true">
          {toast && <div key={toast.id} className="toast-in pointer-events-auto rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-xl shadow-slate-900/25">{toast.msg}</div>}
        </div>
      </div>
    </div>
  );
}


export { App };
