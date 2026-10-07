/* Accounts, through Supabase. The library is large, so it is fetched only when it is needed: when a visitor opens
   the sign-in dialog, comes back from Google, or already has a saved session. */

const SUPA_URL = "https://ivzyyeokjcmsucldawja.supabase.co";
const SUPA_KEY = "sb_publishable_U5tc2OA2H7vyDAYyVWPE9Q_U9W-aZWu";   // the publishable key is meant to be in the page
const STORE = "addoctor.auth.v1";
const PENDING = "addoctor.auth.pending";   // how the visitor chose to sign in, kept across the trip to Google

let client = null;
function supa() {
  if (!client) {
    client = import("@supabase/supabase-js").then(({ createClient }) =>
      // "pkce" returns from Google with ?code=..., which leaves the #screen part of the address alone
      createClient(SUPA_URL, SUPA_KEY, { auth: { flowType: "pkce", storageKey: STORE, detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
    );
  }
  return client;
}

/* True when there is a reason to load the library at start-up: a saved session, or a return from Google. */
function authWanted() {
  try { return !!localStorage.getItem(STORE) || /[?&](code|error_description)=/.test(location.search); } catch (e) { return false; }
}

const here = () => location.origin + location.pathname;
const toUser = (session) => {
  const u = session && session.user;
  if (!u) return null;
  const m = u.user_metadata || {};
  return { id: u.id, email: u.email || "", name: m.full_name || m.name || "", avatar: m.avatar_url || m.picture || "" };
};

/* Calls cb(user or null, how) now and on every change. "how" is the sign-in method the first time a sign-in
   completes, otherwise "". Resolves to a function that stops watching. */
async function watchAuth(cb) {
  const c = await supa();
  const { data } = c.auth.onAuthStateChange((event, session) => {
    let how = "";
    if (event === "SIGNED_IN") { try { how = sessionStorage.getItem(PENDING) || ""; sessionStorage.removeItem(PENDING); } catch (e) { /* private window */ } }
    cb(toUser(session), how);
  });
  return () => data.subscription.unsubscribe();
}

const pending = (how) => { try { sessionStorage.setItem(PENDING, how); } catch (e) { /* private window */ } };
const fail = (error) => { if (error) throw new Error(error.message || "Something went wrong. Try again."); };

async function signInGoogle() {
  pending("google");
  const c = await supa();
  fail((await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } })).error);
}

async function signInEmail(email, password) {
  pending("email");
  const c = await supa();
  fail((await c.auth.signInWithPassword({ email, password })).error);
}

/* Resolves to true when the account is ready, false when Supabase has sent a confirmation email first. */
async function signUpEmail(email, password) {
  pending("email");
  const c = await supa();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: here() } });
  fail(error);
  return !!data.session;
}

async function signOut() {
  const c = await supa();
  await c.auth.signOut();
}

/* The signed-in visitor's token, for calls to the AdDoctor server. Empty when signed out. */
async function accessToken() {
  if (!client && !authWanted()) return "";
  const c = await supa();
  const { data } = await c.auth.getSession();
  return (data.session && data.session.access_token) || "";
}

/* Which ways of signing in the project has switched on, so the dialog only offers what works. */
async function authOptions() {
  try {
    const r = await fetch(SUPA_URL + "/auth/v1/settings", { headers: { apikey: SUPA_KEY } });
    const j = await r.json();
    return { google: !!(j.external && j.external.google), email: !(j.external && j.external.email === false) };
  } catch (e) { return { google: false, email: true }; }
}

export { authWanted, watchAuth, signInGoogle, signInEmail, signUpEmail, signOut, accessToken, authOptions };
