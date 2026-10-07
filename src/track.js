/* Google Tag Manager. The app only describes what happened by pushing events into window.dataLayer; which of them
   go to Google Analytics or anywhere else is decided inside the GTM container, not here.

   GTM is loaded only after the visitor accepts analytics on the banner.
   Events are pushed either way, so anything that happened before the visitor accepted is still there for GTM to read. */

// The container ID is public (it is in every page that uses GTM). VITE_GTM_ID in .env overrides it, e.g. for a test container.
const GTM_DEFAULT = "GTM-N8WXL37Z";
const GTM_ID = /^GTM-[A-Z0-9]+$/.test(import.meta.env.VITE_GTM_ID || "") ? import.meta.env.VITE_GTM_ID : GTM_DEFAULT;
const CONSENT_KEY = "addoctor.consent.v1";

const layer = () => (window.dataLayer = window.dataLayer || []);
// Consent commands must be pushed as an arguments object, the way Google's own gtag() does it.
function gtag() { layer().push(arguments); }

/* One thing the visitor did. Names are snake_case, like GA4's own events. Never throws: a broken dataLayer (another
   script can replace it) must not break the screen that reported the event. */
function track(event, params = {}) {
  try { layer().push({ event, ...params }); } catch (e) { /* nothing to report to */ }
}

const consentChoice = () => { try { return localStorage.getItem(CONSENT_KEY) || ""; } catch (e) { return ""; } };

let loaded = false;
function loadGtm() {
  if (loaded || !GTM_ID) return;
  loaded = true;
  layer().push({ "gtm.start": Date.now(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtm.js?id=" + GTM_ID;
  document.head.appendChild(s);
}

/* Called once when the app starts: everything is denied until the visitor says otherwise. */
function initTracking() {
  gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  if (consentChoice() === "granted") { gtag("consent", "update", { analytics_storage: "granted" }); loadGtm(); }
}

/* The visitor's answer on the banner. Only analytics is ever granted; the site runs no ads. */
function setConsent(ok) {
  try { localStorage.setItem(CONSENT_KEY, ok ? "granted" : "denied"); } catch (e) { /* private window */ }
  if (ok) { gtag("consent", "update", { analytics_storage: "granted" }); loadGtm(); }
}

const needsConsent = () => !!GTM_ID && !consentChoice();

export { track, initTracking, setConsent, needsConsent, GTM_ID };
