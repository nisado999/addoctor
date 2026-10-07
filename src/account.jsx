import { useState, useEffect, useRef } from "react";
import { Icon } from "./ui";
import { field } from "./shared.js";
import { track } from "./track.js";
import { signInGoogle, signInEmail, signUpEmail, authOptions } from "./auth.js";

/* Sign in or create an account. Closing on success is the caller's job: it hears about the new session
   from watchAuth and closes this dialog. */
function AuthModal({ onClose, notify }) {
  const [mode, setMode] = useState("in");            // "in" = sign in, "up" = create account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");              // "" | "google" | "email"
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);           // a confirmation email is on its way
  const [opts, setOpts] = useState({ google: false, email: true });
  const first = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (first.current) first.current.focus();
    let dead = false;
    authOptions().then((o) => { if (!dead) setOpts(o); });
    return () => { dead = true; window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const google = async () => {
    setBusy("google"); setErr("");
    try { await signInGoogle(); }                     // the browser leaves for Google here
    catch (e) { setErr(e.message); setBusy(""); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setErr("Use a password of at least 8 characters."); return; }
    setBusy("email"); setErr("");
    try {
      if (mode === "up") {
        const ready = await signUpEmail(email.trim(), password);
        track("sign_up", { method: "email" });
        if (!ready) setSent(true);
        else notify("Account created. You're signed in.", 2600);
      } else {
        await signInEmail(email.trim(), password);
      }
    } catch (e2) {
      setErr(/invalid login/i.test(e2.message) ? "That email and password don't match an account." : /not confirmed/i.test(e2.message) ? "Confirm your email first: open the link we sent you." : e2.message);
    }
    setBusy("");
  };

  const btn = "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        id="auth" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        className="relative w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl shadow-slate-900/20 sm:rounded-3xl sm:p-7"
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/25">
          <Icon.Close className="h-4 w-4" />
        </button>

        {sent ? (
          <>
            <h2 id="auth-title" className="pr-10 text-xl font-semibold tracking-tight text-slate-900">Check your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">We sent a confirmation link to <b className="font-semibold text-slate-900">{email.trim()}</b>. Open it to finish creating your account, then come back here.</p>
            <button onClick={onClose} className={`${btn} mt-6 bg-blue-600 text-white hover:bg-blue-700`}>Done</button>
          </>
        ) : (
          <>
            <h2 id="auth-title" className="pr-10 text-xl font-semibold tracking-tight text-slate-900">{mode === "up" ? "Create your account" : "Sign in to AdDoctor"}</h2>
            <p className="mt-1 text-[13px] text-slate-500">{mode === "up" ? "Free to start. No card needed." : "Welcome back."}</p>

            {opts.google && (
              <>
                <button id="auth-google" onClick={google} disabled={!!busy} className={`${btn} mt-5 border border-slate-200 bg-white text-slate-800 hover:border-slate-300`}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
                  </svg>
                  {busy === "google" ? "Opening Google…" : "Continue with Google"}
                </button>
                <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
              </>
            )}

            <form onSubmit={submit} className={opts.google ? "" : "mt-5"}>
              <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-slate-700">Email</label>
              <input id="auth-email" ref={first} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@company.com" />
              <label htmlFor="auth-password" className="mb-1.5 mt-3 block text-xs font-semibold text-slate-700">Password</label>
              <input id="auth-password" type="password" required minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} placeholder={mode === "up" ? "At least 8 characters" : "Your password"} />
              {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-rose-100">{err}</p>}
              <button id="auth-submit" type="submit" disabled={!!busy} className={`${btn} mt-4 bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700`}>
                {busy === "email" ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}
              </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-slate-500">
              {mode === "up" ? "Already have an account?" : "New to AdDoctor?"}{" "}
              <button id="auth-switch" type="button" onClick={() => { setMode(mode === "up" ? "in" : "up"); setErr(""); }} className="font-semibold text-blue-600 hover:text-blue-700">{mode === "up" ? "Sign in" : "Create an account"}</button>
            </p>
            <p className="mt-3 text-center text-[11px] text-slate-400">By continuing you agree to how AdDoctor handles data. <a href="./privacy.html" className="underline hover:text-slate-600">Privacy</a></p>
          </>
        )}
      </div>
    </div>
  );
}

export { AuthModal };
