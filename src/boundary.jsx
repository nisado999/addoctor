import { Component, forwardRef, lazy, useId, useRef } from "react";
import { Icon } from "./ui";
import { useDialog } from "./dialog.jsx";
import { reportError } from "./report.js";

/* When part of the app breaks, only that part says so. The rest of AdDoctor (the sidebar, other screens, an open
   dialog's neighbours) keeps working, and the owner gets a crash report. */

/* ------------------------------ Loading screens ------------------------------ */

const WAITS = [600, 1800];   // pauses before the second and the third try
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Offline, a retry cannot work: wait for the connection to come back, but not for ever, so the screen can say so.
function online(maxMs = 20000) {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(id); window.removeEventListener("online", done); resolve(); };
    const id = setTimeout(done, maxMs);
    window.addEventListener("online", done);
  });
}

function chunkError(cause) {
  const e = new Error("Part of AdDoctor could not be loaded" + (cause && cause.message ? ": " + cause.message : "."));
  e.name = "ChunkLoadError";
  e.cause = cause;
  return e;
}

const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading (CSS )?chunk \S+ failed/i;
const isChunkError = (err) => !!err && (err.name === "ChunkLoadError" || CHUNK_RE.test(String(err.message || "")));

/* Chromium remembers a failed module fetch for the life of the page: importing the same file again fails at once,
   without touching the network. So a retry asks for the file under a fresh address (file.js?retry=n), which the
   browser treats as new. The file's address comes from the error, or from Vite's preload event when Vite has
   swallowed the error. */
const FILE_RE = /(https?:\/\/[^\s'"?#]+\.jsx?)(?=[\s'"?#]|$)/;
const fileOf = (err) => { const m = FILE_RE.exec(String((err && err.message) || "")); return m ? m[1] : ""; };
let lastFailed = "";
if (typeof window !== "undefined") window.addEventListener("vite:preloadError", (e) => { lastFailed = fileOf(e.payload) || lastFailed; });
let seq = 0;
const working = new Map();   // file -> the retry address that loaded, so every screen in one file shares one copy

const importFile = (url) => import(/* @vite-ignore */ url);

async function load(factory, pick) {
  let last = null;
  let file = "";
  for (let i = 0; i <= WAITS.length; i++) {
    if (i) { await online(); await sleep(WAITS[i - 1]); }
    let url = "";
    try {
      lastFailed = "";
      let m;
      if (file) { url = working.get(file) || `${file}?retry=${++seq}`; m = await importFile(url); }
      else m = await factory();
      // Vite's preload helper hands back undefined when a failed fetch was "handled", so empty counts as failed.
      const v = m == null ? undefined : pick(m);
      if (v != null) { if (file) working.set(file, url); return v; }
      last = new Error(m == null ? "The import came back empty" : "The import has no such export");
      if (m == null && !file) file = lastFailed;
    } catch (err) {
      last = err;
      if (!file) file = fileOf(err);
    }
    // Another screen in the same file already got it under a retry address: use that one now, no wait.
    if (file && working.has(file) && url !== working.get(file)) {
      try { const v = pick(await importFile(working.get(file))); if (v != null) return v; } catch (e) { /* carry on retrying */ }
    }
  }
  throw chunkError(last);
}

/* A dynamic import that is tried three times before it fails. Each call starts afresh, so one bad moment on the
   network is never remembered. */
const retryImport = (factory) => load(factory, (m) => m);

const failed = new Set();   // screens whose last load failed: the next render after a reset fetches them again
function forgetFailed() {
  const list = [...failed];
  failed.clear();
  list.forEach((reset) => reset());
}

/* React.lazy, but a failed fetch is retried, and after "Try again" the screen is fetched again instead of React
   repeating the old failure. pick chooses the export: lazyRetry(() => import("./spy"), (m) => m.SpyView). */
function lazyRetry(factory, pick = (m) => m.default) {
  let Comp = null;      // the component, once it has loaded
  let Lazy = null;      // the React.lazy in use while it loads
  let pending = null;   // the load in flight, shared by preload and render

  const get = () => {
    if (Comp) return Promise.resolve(Comp);
    if (!pending) {
      pending = load(factory, pick).then(
        (C) => { Comp = C; pending = null; return C; },
        (err) => { pending = null; throw err; }
      );
    }
    return pending;
  };

  const make = () => {
    const L = lazy(() => get().then((C) => ({ default: C }), (err) => {
      failed.add(() => { if (Lazy === L) Lazy = null; });
      throw err;
    }));
    return L;
  };

  // Once loaded, the component is drawn directly, so a preloaded screen opens without a loading flash.
  const Loader = forwardRef(function Loader(props, ref) {
    const C = Comp || Lazy || (Lazy = make());
    return <C ref={ref} {...props} />;
  });
  // Idle warm-up. Never rejects, and does nothing offline, where it could only fail.
  Loader.preload = () => (typeof navigator !== "undefined" && navigator.onLine === false ? Promise.resolve(false) : get().then(() => true, () => false));
  return Loader;
}

/* ------------------------------ Error boundary ------------------------------ */

const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25";
const secondaryBtn = "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20";

function Message({ error, onRetry, retryRef, titleId, textId }) {
  const chunk = isChunkError(error);
  return (
    <>
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Icon.Alert className="h-6 w-6" /></span>
      <p id={titleId} className="mt-4 text-base font-semibold text-slate-900">{chunk ? "This part of AdDoctor didn't load." : "Something went wrong here."}</p>
      <p id={textId} className="mt-1 text-sm leading-relaxed text-slate-500">{chunk ? "Check your connection and try again." : "Your other work is safe."}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button ref={retryRef} onClick={onRetry} className={primaryBtn}>Try again</button>
        <button onClick={() => location.reload()} className={secondaryBtn}>Reload page</button>
      </div>
    </>
  );
}

const noop = () => {};

// In place of a dialog: still a dialog, so Escape, focus and the page behind behave as they did.
function DialogFallback({ error, onRetry, onClose }) {
  const panelRef = useRef(null);
  const retryRef = useRef(null);
  const id = useId();
  const { overlayProps, requestClose } = useDialog({ onClose: onClose || noop, panelRef, initialFocusRef: retryRef, closeOnBackdrop: !!onClose });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" {...overlayProps}>
      <div
        ref={panelRef} role="alertdialog" aria-modal="true" aria-labelledby={id + "t"} aria-describedby={id + "d"}
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}
        className="relative w-full max-w-sm rounded-t-3xl bg-white px-6 pt-10 text-center shadow-2xl shadow-slate-900/20 sm:rounded-3xl"
      >
        {onClose && (
          <button onClick={requestClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
            <Icon.Close className="h-4 w-4" />
          </button>
        )}
        <Message error={error} onRetry={onRetry} retryRef={retryRef} titleId={id + "t"} textId={id + "d"} />
      </div>
    </div>
  );
}

const changed = (a = [], b = []) => a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

/* Wraps a part of the app. variant: "page" (the whole app), "view" (a screen in the main column) or "dialog".
   resetKeys: when any of them changes (the screen, the template) the part is drawn afresh. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error: error || new Error("Unknown error") };
  }

  componentDidCatch(error) {
    reportError(error, { where: this.props.label || "app" });
  }

  componentDidUpdate(prevProps, prevState) {
    // Moving on (another screen, another template) clears the error. Not in the update that caught it.
    if (this.state.error && prevState.error && changed(prevProps.resetKeys, this.props.resetKeys)) this.retry();
  }

  retry() {
    forgetFailed();   // a screen that failed to load is fetched again rather than failing from memory
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    const { variant = "view", onClose, children } = this.props;
    if (!error) return children;
    if (variant === "dialog") return <DialogFallback error={error} onRetry={this.retry} onClose={onClose} />;
    if (variant === "page") {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 px-4 font-sans text-slate-900 antialiased">
          <div role="alert" className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/10">
            <Message error={error} onRetry={this.retry} />
          </div>
        </div>
      );
    }
    return (
      <div role="alert" className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
        <Message error={error} onRetry={this.retry} />
      </div>
    );
  }
}

export { ErrorBoundary, lazyRetry, retryImport, isChunkError };
