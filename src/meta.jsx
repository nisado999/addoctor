import { useEffect, useState } from "react";
import { Icon } from "./ui";
import { readJSON, writeJSON } from "./storage.js";
import { copyText, hasFeature } from "./shared.js";
import { apiFetch } from "./api.js";
import { track } from "./track.js";
import { metaAds, useMetaAds } from "./metaQueue.js";
import { useMyAds } from "./myads.jsx";
import { MetaPublish } from "./metaPublish.jsx";
import { GuidedView } from "./guided.jsx";
import { GOALS, CATS, MARGIN, REPEAT, CONV, CLOSE, EXP, HAVE, SEASON, SALES_A_DAY, PER_AD, GUESS_CONV, nice, suggest, recommend } from "./adBudget.js";

/* Create an ad, the guided way to run an ad on Meta. One flow, as automatic as it can be:
   1. Quiz: paste the website and we read the brand, then only the few things we cannot know (goal, order value, tracking,
      budget, country). We work out the budget, the ad type, the structure and the copy.
   2. Choose ads: make new ones, start from a template, or upload your own.
   3. Ready: every ad with its copy, an Examine check, and the steps to post it.
   It guides; it does not connect to Meta. Answers are kept in this browser, the ads only in this tab. */

const KEY = "addoctor.meta.v1";
let freshLoad = true;   // true until this page load has opened the wizard once
const HOOKS = {
  fashion: "Clothes that feel as good as they look.",
  beauty: "Skincare that fits your routine.",
  home: "Make your home feel like yours.",
  food: "Made fresh, made to share.",
  tech: "Smart gear that makes life easier.",
  health: "Small steps that add up.",
  jewel: "The little detail that finishes the look.",
  service: "Book a time that suits you.",
  other: "Made with care, made for you.",
};
const ITEMS = [["one", "Just one product"], ["few", "A few (2 to 10)"], ["many", "A whole shop (more than 10)"]];
const TRACK = [["yes", "Yes, it is set up"], ["no", "No, not yet"], ["unsure", "I'm not sure"]];

// Every country (ISO 3166 codes), less the places nobody lives. Names come from the browser, sorted for the list.
const CODES = "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { /* older browser: codes are shown instead */ }
const countryName = (c) => { try { return (regionNames && regionNames.of(c)) || c; } catch (e) { return c; } };
const COUNTRIES = CODES.map((c) => ({ c, n: countryName(c) })).sort((a, b) => a.n.localeCompare(b.n));

const links = {
  hub: "https://business.facebook.com/",
  manager: "https://adsmanager.facebook.com/",
  pixel: "https://business.facebook.com/events_manager2/",
  domain: "https://business.facebook.com/settings/owned-domains",
};

/* Shown when someone says tracking is missing or they are not sure. */
const TRACK_HELP = {
  no: {
    title: "Add the Meta Pixel first (about 15 minutes)",
    steps: [
      "Open Events Manager, press Connect data, choose Web, and create a Pixel (Meta now calls it a dataset). Name it after your brand.",
      "On Shopify, WooCommerce, Wix or Squarespace, choose the partner integration and log in. It adds the Pixel for you, no code needed.",
      "On a site built by hand, copy the Pixel code Meta shows you into the head of every page, or send it to whoever built your site.",
      "Make sure the Purchase event is tracked too. A shop integration does this for you. Meta also suggests the Conversions API, and the shop integration usually switches it on.",
      "Test it: install the free Meta Pixel Helper extension for Chrome, open your site, and check that it shows a green Pixel. Then use the Test events tab in Events Manager.",
    ],
    links: [["Open Events Manager", links.pixel]],
  },
  unsure: {
    title: "Check if you have it (2 minutes)",
    steps: [
      "Open Events Manager and look under Data sources. If you see a Pixel or dataset linked to your website, you have one.",
      "Click it. Under Overview you should see events such as Page view, Add to cart and Purchase, with recent activity.",
      "Or install the free Meta Pixel Helper extension for Chrome, open your product page, and see if it shows a green Pixel.",
      "If you see a Pixel and a Purchase event, you are set. If not, treat it as \"No, not yet\" and add it before you spend anything.",
    ],
    links: [["Open Events Manager", links.pixel]],
  },
};

function TrackHelp({ kind, onFixed }) {
  const h = TRACK_HELP[kind];
  if (!h) return null;
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="text-sm font-semibold text-slate-900">{h.title}</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-700">{h.steps.map((t) => <li key={t}>{t}</li>)}</ol>
      <div className="mt-3 flex flex-wrap gap-2">
        {h.links.map(([t, href]) => <a key={t} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">{t} ↗</a>)}
        {onFixed && <button type="button" onClick={onFixed} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">It's set up now</button>}
      </div>
    </div>
  );
}



/* Which kind of ad to run. AdDoctor makes static ads today, so the others say how to get there from them. */
const AD_TYPES = {
  static: { name: "Static image ads", why: "One strong picture per ad. The fastest to make and the best first test: you find out which picture and line your customers respond to.", how: "AdDoctor makes these for you." },
  carousel: { name: "Carousel ad", why: "Two to ten swipeable pictures in one ad. It suits showing several products, or the steps of one.", how: "Make 3 to 5 static ads here, then add them as the cards of one carousel ad in Ads Manager." },
  catalog: { name: "Catalog ads (Advantage+ catalog)", why: "Meta pulls your products from a catalog and shows each person the ones they looked at. It is strongest for a shop with many products, once tracking works.", how: "It needs your products in a Meta catalog (Commerce Manager). Add it after your static ads have a winner." },
  video: { name: "Video or Reels ads", why: "Good for showing a product in use and for reaching new people cheaply.", how: "Video creation is coming soon in AdDoctor." },
};
function adAdvice(s) {
  const sales = s.goal === "sales";
  const tracked = s.track === "yes";
  if (sales && s.items === "many") {
    return { main: "static", note: "You sell a lot of products, so start with static ads to find what works.", more: [["catalog", tracked ? "Add it next." : "Add it once tracking works."], ["carousel", ""]] };
  }
  if (sales && s.items === "few") return { main: "carousel", note: "You sell a few products, so one ad can show them together.", more: [["static", "Also run these: they are the easiest to test."]] };
  if (s.goal === "aware") return { main: "static", note: "Video is best for reach, but it is not ready here yet, so start with static ads.", more: [["video", ""]] };
  return { main: "static", note: "One picture, one clear message.", more: sales ? [["video", ""]] : [] };
}

/* The copy, written from what the site really says (selling points and offer) and the answers. Never a made-up claim. */
function copyKit(s) {
  const name = (s.name || "").trim(); // without a name the copy simply leaves it out
  const at = name ? ` ${name}` : "";
  const sentence = (t) => { const x = String(t || "").trim().replace(/[.!?]+$/, ""); return x ? x + "." : ""; };
  // A selling point from the site only when it is short enough to read like a line, not a product spec.
  const usp = (s.usps || []).find((u) => typeof u === "string" && u.trim().length > 0 && u.trim().length <= 60);
  const hook = sentence(usp) || HOOKS[s.product] || HOOKS.other;
  const ask = { sales: name ? `Order from ${name} today.` : "Order today.", leads: name ? `Get in touch with ${name} today.` : "Get in touch today.", traffic: name ? `Take a look at ${name}.` : "Take a look.", aware: name ? `Say hello to ${name}.` : "Say hello." }[s.goal] || "Take a look.";
  const host = (s.site || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const short = (t) => (t.length <= 40 ? t.replace(/\.$/, "") : name || "Take a look");
  return {
    primary: [`${hook} ${ask}`, name ? `${name} is here. ${hook}` : `Meet something new. ${hook}`, s.offer ? `${s.offer}. ${ask}` : `New${name ? " from" + at : ""}. ${ask}`],
    headline: [short(hook), name ? `New from ${name}` : "Something new", name ? `${name}: take a look` : "Take a look"],
    description: [s.offer || host || name || ask, ask],
    cta: (GOALS[s.goal] || GOALS.sales).cta,
  };
}

function buildSteps(s, r) {
  const g = GOALS[s.goal] || GOALS.sales;
  const brand = s.name || "your brand";
  const country = s.countryCode ? countryName(s.countryCode) : "";
  const url = s.site ? (/^https?:\/\//i.test(s.site) ? s.site : `https://${s.site}`) : "https://your-site.com";
  const utm = `${url}${url.includes("?") ? "&" : "?"}utm_source=meta&utm_medium=paid&utm_campaign=addoctor`;
  const wantsTrack = s.goal === "sales" || s.goal === "leads";
  return [
    { id: "setup", title: "Set up your accounts", time: "10 min", body: [
      "You need a Facebook Page for your brand, a Meta Business portfolio, and an ad account with a card on it. All three live in Meta Business Suite.",
      "Add the Page and the ad account to the same Business portfolio, so ads can run from the Page and Instagram.",
      wantsTrack ? (s.track === "yes" ? "Your tracking is set up. Open Events Manager once and check the Pixel is active." : "Install the Meta Pixel (or connect your shop: Shopify and WooCommerce have a built-in connection) so Meta can see who buys. Do this before you spend anything.") : "Tracking is optional for this goal, but add the Pixel now so it starts learning.",
    ], links: [["Open Business Suite", links.hub], ["Open Events Manager", links.pixel]] },
    { id: "domain", title: "Verify your website", time: "5 min", body: [
      "Add your domain under Brand safety > Domains and verify it. Without this, Meta can limit what your Pixel is allowed to report.",
    ], links: [["Verify domain", links.domain]] },
    { id: "campaign", title: `Create the campaign: ${g.objective}`, time: "3 min", body: [
      "In Ads Manager press Create, then choose the objective in the title above.",
      g.note,
      `Your set-up: 1 campaign, ${r.adsets} ad set${r.adsets > 1 ? "s" : ""}, ${r.ads} ads in each.`,
      ...(r.lowVolume ? ["At this budget you will get under one sale a day in each ad set. In the ad set, set the conversion event to Add to cart for now, and move to Purchase once the budget grows."] : []),
    ], links: [["Open Ads Manager", links.manager]] },
    { id: "budget", title: `Set your budget: ${r.budget} a day`, time: "2 min", body: [
      `Use a daily budget of ${r.budget}${r.adsets > 1 ? `, split over ${r.adsets} ad sets` : ""}. Over the ${r.days} days Meta needs to settle, that is about ${r.total} in total.`,
      "Leave the start date as today and do not set an end date. You can pause the campaign yourself.",
      r.budget < 10 ? "Under about 10 a day teaches Meta very little. If you can, raise it, or run fewer ads and keep the audience wide." : "Do not change the budget in the first few days.",
      ...(s.exp === "never" ? ["New ad accounts start with a low daily spending limit. If your budget is above it, Meta pauses delivery until the limit rises. You can see it in Billing."] : []),
    ] },
    { id: "audience", title: `Choose who sees it: ${country || "your country"}`, time: "3 min", body: [
      `Location: ${country || "the country you sell in"}. Add only places you can deliver to.`,
      "Age and gender: leave them wide open unless the product really needs it. Meta finds buyers better than a guess does.",
      "Leave Advantage+ audience switched on and do not stack lots of interests. Add your customer list under Excluded audiences so you do not pay to reach people who already bought.",
      ...(s.have === "lots" ? ["You have a good number of people to reach, so add a second ad set: a Lookalike audience (1%) built from your customer list, and a retargeting ad set for site visitors from the last 30 days that did not buy. Give retargeting about 20% of the budget."] : []),
    ] },
    { id: "placements", title: "Choose where it shows", time: "1 min", body: [
      "Leave Advantage+ placements on. Meta puts the ad on Facebook, Instagram and Messenger wherever it costs least.",
      "Make sure each ad has a tall version (9:16, 1080 x 1920) for Stories and Reels, and a feed version (4:5, 1080 x 1350). A square (1:1, 1080 x 1080) works everywhere as a fallback.",
      "Keep the important part of the picture away from the top and bottom 14%: Reels and Stories cover it with buttons and captions.",
    ] },
    { id: "ad", title: "Add your ads and paste the text", time: "10 min", body: [
      "Choose your Page and Instagram account, then upload your ads. Add each size you have.",
      `Paste your website, with tracking, as the link: ${utm}`,
      `Set the button to "${g.cta}". The button belongs to Meta, so your picture stays free of buttons.`,
      `Paste each ad's text from the cards above (${brand}).`,
    ] },
    { id: "check", title: "Check before you publish", time: "3 min", body: [
      "Use Preview on every placement: Feed, Stories, Reels. Look for cropped text and covered faces.",
      "Click your link in the preview. It must open the right product page on a phone, quickly.",
      "In Events Manager, test the Pixel by visiting your site: the event should show up within a minute.",
      "Press Publish. Meta reviews new ads, normally within a day. Wait for Active.",
    ], links: [["Open Events Manager", links.pixel]] },
    { id: "after", title: `After you publish: wait ${r.days} days`, time: "ongoing", body: [
      `Do not change the budget, audience or ads for ${r.days} days. Edits restart Meta's learning and you pay to learn again.`,
      "Then look at three numbers per ad: cost per result, click-through rate (aim for over 1%) and spend. Turn off ads that spent twice your target cost per result with no result.",
      "To scale a winner, raise the budget by about 20% every few days. A big jump unsettles delivery.",
      "Make new ads every week or two. People get tired of the same picture, and this is the part that keeps ads working.",
      ...(s.season === "yes" ? ["For a sale, publish 2 to 3 days before it starts and expect higher costs while others compete. Plan to turn the ads off or swap the offer the day it ends."] : []),
    ] },
  ];
}

/* The questions, in order. `when` hides one that does not apply. */
const moneyGoal = (s) => s.goal !== "traffic" && s.goal !== "aware"; // also true before a goal is picked, so the count does not jump
const QUESTIONS = [
  { id: "site", title: "Paste your website and we'll fill in the rest" },
  { id: "goal", title: "What do you want your ad to do?" },
  { id: "product", title: "What do you sell?", when: (s) => moneyGoal(s) && !s.fromSite },
  { id: "items", title: "How many products will the ads show?", when: (s) => (s.goal === "sales" || !s.goal) && !s.fromSite },
  { id: "value", title: (s) => (s.goal === "leads" ? "What is one new customer or booking worth to you?" : "What is the average order value?"), when: moneyGoal },
  { id: "margin", title: (s) => (s.goal === "leads" ? "How much of that is profit?" : "How much of each sale is profit?"), when: moneyGoal },
  { id: "repeat", title: "Do customers buy from you again?", when: moneyGoal },
  { id: "conv", title: (s) => (s.goal === "leads" ? "Out of 100 people who visit your site, how many contact you?" : "Out of 100 people who visit your site, how many buy?"), when: moneyGoal },
  { id: "close", title: "Out of 10 enquiries, how many become paying customers?", when: (s) => s.goal === "leads" },
  { id: "track", title: "Is Meta tracking your sales?", when: moneyGoal },
  { id: "exp", title: "Have you run ads on Meta before?" },
  { id: "have", title: "Do you already have people to reach?" },
  { id: "season", title: "Is this ad for a sale or a special season?" },
  { id: "budget", title: "How much can you spend each day?" },
  { id: "country", title: "Where do you sell?" },
];

/* The questions that are a plain pick-one list: the choices, and the line under the question. */
const OPTIONS = { margin: MARGIN, repeat: REPEAT, conv: CONV, close: CLOSE, exp: EXP, have: HAVE, season: SEASON };
const HELP = {
  margin: "What is left after what the product costs you, shipping and payment fees, but before you pay for ads. A rough range is fine.",
  repeat: "Over a year, do the same people order again? Repeat buyers let you pay a little more to win the first sale.",
  conv: (s) => `Your shop's stats call this the conversion rate. Not sure? Pick that and we'll assume about ${Math.round(GUESS_CONV * 1000) / 10}.${s.goal === "leads" ? "" : " Under 1 usually means the product page needs work before you spend on ads."}`,
  close: "Of the people who get in touch, how many end up paying you.",
  exp: "A new ad account starts with a low daily spending limit that Meta raises over time, so it changes how we start you off.",
  have: "A customer email list, past buyers, or people who visit your site every month. These let us add a second, cheaper audience.",
  season: "Black Friday, Christmas and big sales cost more to advertise in, and need to start earlier.",
};

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-600";
const chip = (on) => `rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${on ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`;
const darkBtn = "inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25 disabled:cursor-not-allowed disabled:opacity-40";
const lightBtn = "inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const smallBtn = "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

const fileToDataUrl = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

function CopyRow({ label, text, onCopy }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
      <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 break-words text-[13px] text-slate-800">{text}</p></div>
      <button type="button" onClick={() => onCopy(text)} className={smallBtn}><Icon.Copy className="h-3.5 w-3.5" />Copy</button>
    </div>
  );
}

/* How the ad looks in a Facebook feed. Fixed light colours on purpose: it is a picture of Meta, not of this app. */
function FeedPost({ ad, brand, host, copy: c, children }) {
  const grey = { color: "#65676b" };
  return (
    <article className="overflow-hidden rounded-xl text-left ring-1 ring-slate-200" style={{ background: "#fff", color: "#050505" }}>
      <header className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-600 text-base font-bold text-white" aria-hidden="true">{(brand || "A").charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{brand}</p>
          <p className="text-[13px] leading-tight" style={grey}>Sponsored</p>
        </div>
        <span className="text-xl leading-none" style={grey} aria-hidden="true">···</span>
      </header>
      {c.primary && <p className="whitespace-pre-line break-words px-3 pb-3 text-[15px] leading-snug">{c.primary}</p>}
      <img src={ad.src} alt={ad.name} className="max-h-[520px] w-full object-cover" style={{ background: "#f0f2f5" }} />
      <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: "#f0f2f5" }}>
        <div className="min-w-0 flex-1">
          {host && <p className="truncate text-xs uppercase" style={grey}>{host}</p>}
          <p className="truncate text-base font-semibold leading-snug">{c.headline}</p>
          {c.description && <p className="truncate text-sm" style={grey}>{c.description}</p>}
        </div>
        <span className="shrink-0 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: "#e4e6eb" }}>{c.cta}</span>
      </div>
      <div className="flex justify-around border-t py-2 text-sm font-semibold" style={{ ...grey, borderColor: "#ced0d4" }} aria-hidden="true"><span>Like</span><span>Comment</span><span>Share</span></div>
      {children}
    </article>
  );
}

export function MetaView({ user, notify, onNav, onExamine, credits, onSpend, onUseTemplate, onBrowse }) {
  const [making, setMaking] = useState(false); // the static ad builder, open inside the "Choose your ads" step
  const [s, setS] = useState(() => {
    const v = freshLoad ? null : readJSON(KEY, null);
    const o = v && typeof v === "object" ? v : {};
    const stage = ["quiz", "plan", "creative", "ready"].includes(o.stage) ? o.stage : (o.finished ? "plan" : "quiz");
    return { goal: "", product: "", items: "", aov: "", margin: "", repeat: "", conv: "", close: "", exp: "", have: "", season: "", budget: "", track: "", countryCode: "", site: "", name: "", sells: "", offer: "", fromSite: false, ...o, stage, step: Number.isInteger(o.step) ? o.step : 0, done: Array.isArray(o.done) ? o.done : [], usps: Array.isArray(o.usps) ? o.usps : [] };
  });
  // The first time this page is opened after a load or refresh, drop the old answers so the user starts over. Leaving for the
  // builder or a template and coming back keeps them, because "come back with Create an ad" relies on it.
  useEffect(() => { if (freshLoad) { freshLoad = false; writeJSON(KEY, null); } }, []);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");
  const ads = useMetaAds();
  const saved = useMyAds(); // ads kept in the Saved Vault
  const [showVault, setShowVault] = useState(false);
  const [pub, setPub] = useState(() => { const v = readJSON("addoctor.meta.launch.v1", null); return !!(v && v.result); }); // a launch made earlier stays visible
  const set = (patch) => setS((p) => { const n = { ...p, ...patch }; writeJSON(KEY, n); return n; });
  const copy = async (text, msg = "Copied") => notify((await copyText(text)) === false ? "Couldn't copy. Select the text instead." : msg);
  const toTop = () => { try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ } };
  const go = (stage) => { set({ stage, step: 0 }); toTop(); };

  /* ---- Read the website: fills in the brand, category, offer and selling points ---- */
  const readSite = async () => {
    const url = (s.site || "").trim();
    if (url.length < 4) { setErr("Paste your website link first."); return; }
    setErr(""); setReading(true);
    try {
      const deep = await hasFeature("brandread");
      if (!deep) throw new Error("Reading a website is not switched on yet. Choose \"I'll answer by hand\".");
      const r = await apiFetch("/brand/read", { body: { url, niches: Object.values(CATS).map((c) => c[0]), tones: [] }, timeout: 180000 });
      const key = Object.keys(CATS).find((k) => CATS[k][0] === r.niche) || "other";
      const n = Array.isArray(r.products) ? r.products.length : 0;
      set({ fromSite: true, name: r.name || s.name, sells: r.description || "", offer: r.offer || "", usps: Array.isArray(r.usps) ? r.usps.slice(0, 4) : [], product: key, items: n >= 5 ? "many" : n >= 2 ? "few" : "one" });
      track("meta_site_read", {});
    } catch (e) { setErr((e && e.message) || "We could not read that site. You can answer by hand instead."); }
    setReading(false);
  };

  const qs = QUESTIONS.filter((q) => !q.when || q.when(s));
  const at = Math.min(s.step, qs.length - 1);
  const q = qs[at];
  const ready = { site: s.fromSite, goal: !!s.goal, product: !!s.product, items: !!s.items, value: Number(s.aov) > 0, margin: !!s.margin, repeat: !!s.repeat, conv: !!s.conv, close: !!s.close, exp: !!s.exp, have: !!s.have, season: !!s.season, track: !!s.track, budget: Number(s.budget) >= 1, country: !!s.countryCode }[q.id];
  const sug = suggest(s);
  const next = () => { if (at === qs.length - 1) { track("meta_finish", { goal: s.goal }); go("plan"); } else set({ step: at + 1 }); };
  const pick = (patch) => set(patch);

  /* ---- Ads: upload, remove, examine ---- */
  const upload = async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type) && f.size <= 8 * 1024 * 1024);
    e.target.value = "";
    if (!files.length) { notify("Choose PNG, JPG or WebP pictures up to 8 MB."); return; }
    let n = 0;
    for (const f of files) { try { if (metaAds.add({ src: await fileToDataUrl(f), name: f.name.replace(/\.[^.]+$/, "") })) n++; } catch (x) { /* skip an unreadable file */ } }
    notify(n ? `${n} ad${n > 1 ? "s" : ""} added` : "Those pictures are already added.");
  };
  const examine = async (a) => {
    try {
      const b = await (await fetch(a.src)).blob();
      onExamine && onExamine(new File([b], `${a.name || "ad"}.${b.type.includes("png") ? "png" : "jpg"}`, { type: b.type || "image/png" }));
    } catch (x) { notify("Couldn't open this ad for a check."); }
  };

  /* ---------- 4. Ads ready ---------- */
  if (s.stage === "ready") {
    const r = recommend(s);
    const kit = copyKit(s);
    const host = (s.site || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    const steps = buildSteps(s, r);
    // What each ad says in the feed: its own copy, else the proposed copy, a different option for each ad.
    const copyOf = (a, i) => {
      const own = a.copy || {};
      const pickOf = (arr) => (arr && arr.length ? arr[i % arr.length] : "");
      return { primary: own.primary || pickOf(kit.primary), headline: own.headline || pickOf(kit.headline), description: own.description || pickOf(kit.description), cta: own.cta || kit.cta };
    };
    const doneN = steps.filter((x) => s.done.includes(x.id)).length;
    const toggle = (id) => { set({ done: s.done.includes(id) ? s.done.filter((d) => d !== id) : [...s.done, id] }); if (!s.done.includes(id)) track("meta_step_done", { step: id }); };
    return (
      <div className="mt-6 max-w-3xl">
        <section className={`${card} border-blue-200`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Ready to post</p>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900">{ads.length} ad{ads.length === 1 ? "" : "s"} with copy, for {r.objective} at {r.budget} a day.</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">This is how your ads will look in the feed. Check each one with Examine if you like, then publish.</p>
          {ads.length === 0 && <p className="mt-3 text-[13px] text-slate-600">You have no ads yet. <button type="button" className="font-semibold text-blue-700 underline" onClick={() => go("creative")}>Choose your ads</button>.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!ads.length && !pub} onClick={() => setPub(!pub)} aria-expanded={pub} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:opacity-40">Publish on Meta</button>
            <button type="button" onClick={() => go("creative")} className={lightBtn}>Add or change ads</button>
            <button type="button" onClick={() => { metaAds.clear(); set({ stage: "quiz", step: 0, done: [] }); toTop(); }} className={lightBtn}>Start a new ad</button>
          </div>
          {pub && <MetaPublish user={user} notify={notify} ads={ads.map((a, i) => ({ src: a.src, name: a.name, ...copyOf(a, i) }))} plan={{ goal: s.goal, objective: r.objective, budget: r.budget, adsets: r.adsets, ads: r.ads, country: s.countryCode, countryName: s.countryCode ? countryName(s.countryCode) : "", site: s.site, name: s.name }} />}
        </section>

        {ads.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {ads.map((a, i) => {
              const c = copyOf(a, i);
              return (
                <div key={a.id} className="flex min-w-0 flex-col gap-2">
                  <p className="px-1 text-xs font-semibold text-slate-500">Ad {i + 1} · {a.name}</p>
                  <FeedPost ad={a} brand={s.name || host || "Your brand"} host={host} copy={c} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => examine(a)} className={darkBtn}><Icon.Stethoscope className="h-4 w-4" />Examine this ad</button>
                    <a href={a.src} download={`${(a.name || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`} className={lightBtn}><Icon.Download className="h-4 w-4" />Download</a>
                    <button type="button" onClick={() => metaAds.remove(a.id)} className="px-2 text-xs font-semibold text-slate-500 hover:text-slate-900">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className={`${card} mt-6`}>
          <h3 className="text-sm font-semibold text-slate-900">Proposed copy</h3>
          <p className="mt-1 text-xs text-slate-500">Written from your answers{s.fromSite ? " and what your website says" : ""}. Keep only what is true for your business, and add your real offer or delivery promise.</p>
          <div className="mt-3 space-y-2">
            {kit.primary.map((t, i) => <CopyRow key={"p" + i} label={`Text option ${i + 1}`} text={t} onCopy={copy} />)}
            {kit.headline.map((t, i) => <CopyRow key={"h" + i} label={`Headline option ${i + 1}`} text={t} onCopy={copy} />)}
            {kit.description.map((t, i) => <CopyRow key={"d" + i} label={`Description option ${i + 1}`} text={t} onCopy={copy} />)}
            <p className="px-1 text-xs text-slate-600"><span className="font-semibold text-slate-400">Button </span>{kit.cta}</p>
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">How to post it in Ads Manager</h3>
          <p className="text-xs font-semibold tabular-nums text-slate-500" aria-live="polite">{doneN} of {steps.length} done</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${(doneN / steps.length) * 100}%` }} /></div>
        <ol className="mt-4 space-y-3">
          {steps.map((x, i) => {
            const on = s.done.includes(x.id);
            return (
              <li key={x.id} className={`${card} transition ${on ? "!border-emerald-200" : ""}`}>
                <div className="flex items-start gap-3">
                  <button type="button" role="checkbox" aria-checked={on} aria-label={`Mark step ${i + 1} done: ${x.title}`} onClick={() => toggle(x.id)}
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${on ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-500 hover:border-slate-500"}`}>
                    {on ? <Icon.Check className="h-3.5 w-3.5" /> : i + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h4 className={`text-[15px] font-semibold ${on ? "text-slate-400 line-through decoration-slate-300" : "text-slate-900"}`}>{x.title}</h4>
                      <span className="text-xs text-slate-400">{x.time}</span>
                    </div>
                    <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-slate-600">{x.body.map((p, j) => <p key={j} className="break-words">{p}</p>)}</div>
                    {x.links && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {x.links.map(([t, href]) => <a key={t} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/25">{t} ↗</a>)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-slate-400">This is a guide, not advice on your results. Meta changes its menus often, so a button may be named a little differently.</p>
      </div>
    );
  }

  /* ---------- 3. Choose your ads ---------- */
  if (s.stage === "creative") {
    const r = recommend(s);
    const want = r.ads * r.adsets;
    return (
      <div className="mt-6 max-w-3xl">
        <section className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 3: your ads</p>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900">Choose your ads</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">This set-up wants about {want} ad{want > 1 ? "s" : ""}. You have <b className="text-slate-900">{ads.length}</b>. More than one lets Meta find the one that works.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-blue-300 bg-blue-50/60 p-4">
              <p className="text-sm font-semibold text-slate-900">Make new ads</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">Answer a few questions and we design the ads with your product. Recommended.</p>
              <button type="button" onClick={() => setMaking(!making)} aria-expanded={making} className={`${darkBtn} mt-3 justify-center`}>{making ? "Hide the ad maker" : "Create a static ad"}</button>
            </div>
            <div className="flex flex-col rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Start from a template</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">Pick a proven layout and put your product in it.</p>
              <button type="button" onClick={() => onNav("explore")} className={`${lightBtn} mt-3 justify-center`}>Browse templates</button>
            </div>
            <div className="flex flex-col rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">I already have ads</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">Upload pictures from your computer.</p>
              <label className={`${lightBtn} mt-3 cursor-pointer justify-center`}>Upload ads<input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={upload} /></label>
            </div>
            <div className="flex flex-col rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">From my Saved Vault</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">Use ads you saved before{saved.length ? ` (${saved.length} saved)` : ""}.</p>
              <button type="button" onClick={() => setShowVault(!showVault)} aria-expanded={showVault} className={`${lightBtn} mt-3 justify-center`}>{showVault ? "Hide saved ads" : "Choose from Vault"}</button>
            </div>
          </div>
          {showVault && (
            <div className="mt-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              {saved.length === 0 ? (
                <p className="text-[13px] text-slate-600">No saved ads yet. In a template, make your ad and choose <b>Save to Vault</b>, then it shows up here.</p>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-slate-900">Tap the ads you want to use</p>
                  <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {saved.filter((x) => x.thumb).map((x) => {
                      const on = ads.find((a) => a.src === x.thumb);
                      return (
                        <li key={x.id}>
                          <button type="button" aria-pressed={!!on} aria-label={`${on ? "Remove" : "Use"} ${x.title || "saved ad"}`} onClick={() => (on ? metaAds.remove(on.id) : metaAds.add({ src: x.thumb, name: x.title || "Saved ad" }))}
                            className={`relative block w-full overflow-hidden rounded-xl bg-slate-100 ring-2 transition focus:outline-none focus-visible:ring-blue-600 ${on ? "ring-blue-600" : "ring-transparent hover:ring-slate-300"}`}>
                            <img src={x.thumb} alt="" className="aspect-[4/5] w-full object-cover" loading="lazy" />
                            {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white"><Icon.Check className="h-3 w-3" /></span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-xs text-slate-500">The Vault keeps a small copy of each ad (540 pixels). It is fine for planning and checking. For the sharpest ads on Meta, upload the original file instead.</p>
                </>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Made an ad in the builder or a template? Press <b>Add to my Meta ad</b> on it, then come back with <b>Create an ad</b> at the top of the menu.</p>
        </section>

        {ads.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {ads.map((a) => (
              <div key={a.id} className="group relative overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                <img src={a.src} alt={a.name} className="aspect-square w-full object-cover" />
                <button type="button" onClick={() => metaAds.remove(a.id)} aria-label={`Remove ${a.name}`} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-slate-950/80 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"><Icon.Close className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {making && (
          <section className={`${card} mt-4`}>
            <GuidedView inline kind="static" siteUrl={s.site} notify={notify} credits={credits} onSpend={onSpend} onUseTemplate={onUseTemplate} onBrowse={onBrowse} />
          </section>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => go("plan")} className={lightBtn}>Back</button>
          <button type="button" onClick={() => go("ready")} disabled={!ads.length} className={darkBtn}>{ads.length ? `My ${ads.length} ad${ads.length > 1 ? "s are" : " is"} ready` : "Add an ad to continue"} <Icon.Arrow className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }

  /* ---------- 2. Your plan ---------- */
  if (s.stage === "plan" && s.goal) {
    const r = recommend(s);
    const g = GOALS[s.goal];
    const adv = adAdvice(s);
    const main = AD_TYPES[adv.main];
    const unit = s.goal === "leads" ? "enquiry" : "sale";
    const f = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 100) / 100); // 2 decimals for small amounts
    const line = `${g.objective} campaign, ${r.adsets} ad set${r.adsets > 1 ? "s" : ""}, ${r.ads} ads each, ${r.budget} a day for ${r.days} days.`;
    const rows = [
      ["Campaign objective", g.objective],
      ["Ad type", main.name],
      ["Campaigns", "1"],
      ["Ad sets", `${r.adsets}${r.adsets > 1 ? " (same ads in each, different audiences)" : ""}`],
      ["Ads", `${r.ads} in ${r.adsets > 1 ? "each ad set" : "the ad set"}`],
      ["Daily budget", `${r.budget}${r.adsets > 1 ? ` (${Math.round(r.budget / r.adsets)} per ad set)` : ""}`],
      ["Audience", `${s.countryCode ? countryName(s.countryCode) : "Your country"}, wide open, Advantage+ on`],
      ["Where it shows", "Advantage+ placements (Feed, Stories, Reels)"],
      ["Leave it alone for", `${r.days} days (about ${r.total} spent)`],
    ];
    return (
      <div className="mt-6 max-w-3xl">
        <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 2: your Meta set-up</p>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-slate-900">{line}</h2>
          <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>
            ))}
          </dl>

          <div className="mt-4 rounded-xl bg-blue-50 p-4 text-[13px] leading-relaxed text-slate-800 ring-1 ring-blue-200">
            <p className="font-semibold text-slate-900">Which ad type to run: {main.name}</p>
            <p className="mt-1">{adv.note} {main.why}</p>
            <p className="mt-1 text-slate-600">{main.how}</p>
            {adv.more.length > 0 && (
              <div className="mt-3 border-t border-blue-200 pt-3">
                <p className="font-semibold text-slate-900">Also worth adding</p>
                <ul className="mt-1 space-y-1.5">
                  {adv.more.map(([id, tip]) => <li key={id}><b className="font-semibold text-slate-900">{AD_TYPES[id].name}.</b> {AD_TYPES[id].why} {tip} <span className="text-slate-600">{AD_TYPES[id].how}</span></li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-blue-50 p-4 text-[13px] leading-relaxed text-slate-800 ring-1 ring-blue-200">
            <p className="font-semibold text-slate-900">Why {r.budget} a day</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {r.sug.cpa > 0 && <li>{s.goal === "leads" ? "One new customer" : "An average order"} brings in {r.sug.aov}.{r.sug.margin ? ` About ${Math.round(r.sug.margin * 100)}% is profit, so ${f(r.sug.aov * r.sug.margin)} each.` : ` You were not sure of your profit, so we used a typical ${Math.round(r.sug.share * 100)}% for a ${(CATS[s.product] || CATS.other)[0].toLowerCase()} business. Tell us the real figure (Change my answers) to sharpen this.`}{r.sug.back > 1 ? ` Customers who come back make each one worth about ${Math.round((r.sug.back - 1) * 100)}% more over time.` : ""}</li>}
              {r.sug.cpa > 0 && s.goal === "leads" && <li>About {Math.round(r.sug.close * 100)} in 100 enquiries become customers, so one enquiry is worth about {f(r.sug.aov * (r.sug.margin || r.sug.share) * r.sug.back * r.sug.close)}.</li>}
              {r.sug.breakEven > 0 && <li>The most you could pay in ads for one {unit} before you lose money is about <b>{f(r.sug.breakEven)}</b> (break-even). We aim for <b>{f(r.sug.cpa)}</b>, which keeps about 30% of that as profit.</li>}
              {r.sug.cpa > 0 && !r.sug.breakEven && <li>So a {unit} can cost around {f(r.sug.cpa)} in ads and still pay.</li>}
              {r.sug.cpa > 0 && <li>We suggest {r.sug.daily} a day, enough for Meta to see about {SALES_A_DAY} {unit === "enquiry" ? "enquiries" : "sales"} a day while it learns.</li>}
              {r.sug.cpa > 0 && <li>At {r.sug.conv ? "your" : "an assumed"} {Math.round((r.sug.conv || GUESS_CONV) * 1000) / 10} in 100 visitors {s.goal === "leads" ? "contacting you" : "buying"}, {r.budget} a day needs about <b>{Math.max(1, Math.round(r.visitors))} visitors a day</b>, and each click has to cost under about <b>{f(r.maxCpc)}</b> for it to pay. Check this in Ads Manager after a few days: it is the number that tells you whether the ad works.</li>}
              {r.lowVolume && <li>That is under one {unit} a day in each ad set, too few for Meta to learn from. Ask it to optimise for <b>Add to cart</b> (a step before buying) at first, or use fewer ad sets.</li>}
              {r.sug.margin > 0 && r.sug.margin < 0.15 && <li>Your margin is thin, so a first sale may not cover its ad cost. Raising prices, selling bundles or getting repeat buyers helps more than any ad.</li>}
              {s.conv === "low" && s.goal !== "leads" && <li>Fewer than 1 in 100 visitors buying is low. Improve the product page first (photos, price, delivery) or ads will bring people who leave.</li>}
              {s.exp === "never" && <li>This looks like a new ad account. Meta starts these on a low daily spending limit and raises it as you pay your bills. If delivery stops, check the limit in Billing.</li>}
              {s.season === "yes" && <li>Sale seasons are crowded, so the same budget buys fewer {unit === "enquiry" ? "enquiries" : "sales"} than usual. Start the ads 2 to 3 days before the sale, so Meta has finished learning when the crowd arrives.</li>}
              {s.have === "lots" && <li>You already have 1,000 or more people to reach: use your customer list to build a lookalike audience and to exclude past buyers, and retarget your site visitors with part of the budget.</li>}
              {s.have === "some" && <li>Add your customer list under Excluded audiences so you do not pay to reach people who already bought. It is too small for a lookalike audience yet.</li>}
              {r.sug.cpa === 0 && <li>There is no sale to price for this goal, so {r.sug.daily} a day is a small, safe start.</li>}
              {r.short && !r.tooLow && <li>You chose {r.budget}, less than we suggest. It still works, but Meta learns more slowly, so give it {r.days} days before you judge it.{r.salesDay > 0 && ` If it reaches the cost above, expect about ${r.salesDay.toFixed(1)} a day.`}</li>}
              {r.tooLow && <li>{r.budget} a day is less than the cost of two {s.goal === "leads" ? "customers" : "sales"} in ads, so results will be slow and uneven. If you can, raise the budget. If you cannot, keep to the {r.ads} ads here and give it {r.days} days.</li>}
              {!r.short && !r.tooLow && r.sug.cpa > 0 && <li>You can spend this much, so Meta has what it needs. Going higher only makes it learn faster.</li>}
            </ul>
          </div>

          {(s.goal === "sales" || s.goal === "leads") && s.track !== "yes" && (
            <>
              <p className="mt-3 rounded-xl bg-rose-50 p-4 text-[13px] leading-relaxed text-slate-800 ring-1 ring-rose-200">Do this before you spend anything. Without tracking Meta cannot tell who bought, and you pay to guess.</p>
              <TrackHelp kind={s.track === "no" ? "no" : "unsure"} onFixed={() => set({ track: "yes" })} />
            </>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">Rules of thumb for a new ad account, not a promise of results: each ad needs about {PER_AD} a day to get a fair test, and more than ten ads in one ad set spreads the money too thin.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => go("creative")} className={darkBtn}>Next: choose your ads <Icon.Arrow className="h-4 w-4" /></button>
            <button type="button" onClick={() => copy(line, "Set-up copied")} className={lightBtn}><Icon.Copy className="h-4 w-4" />Copy this</button>
            <button type="button" onClick={() => go("quiz")} className={lightBtn}>Change my answers</button>
          </div>
        </section>
      </div>
    );
  }

  /* ---------- 1. One question at a time ---------- */
  return (
    <div className="mt-6 max-w-xl">
      <p className="text-xs font-semibold tabular-nums text-slate-500" aria-live="polite">Question {at + 1} of {qs.length}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((at + 1) / qs.length) * 100}%` }} /></div>

      <section className={`${card} mt-5 !p-6`} aria-labelledby="meta-q">
        <h2 id="meta-q" className="text-lg font-semibold text-slate-900">{typeof q.title === "function" ? q.title(s) : q.title}</h2>

        {q.id === "site" && (
          <div className="mt-4">
            <p className="mb-3 text-[13px] text-slate-500">We read your whole site, not just the page you paste: home, about, shop, reviews and FAQ. We use it to find what you sell, your offer and your selling points, so you answer less. Takes about a minute.</p>
            <label className={labelCls} htmlFor="meta-site">Website</label>
            <div className="flex gap-2">
              <input id="meta-site" className={inputCls} value={s.site} maxLength={200} placeholder="coldwear.com" onChange={(e) => pick({ site: e.target.value.trim(), fromSite: false })} onKeyDown={(e) => { if (e.key === "Enter" && !reading) readSite(); }} />
              <button type="button" onClick={readSite} disabled={reading || (s.site || "").length < 4} className={darkBtn}>{reading ? "Reading…" : s.fromSite ? "Read again" : "Read my website"}</button>
            </div>
            {err && <p role="alert" className="mt-2 text-[13px] text-rose-600">{err}</p>}
            {s.fromSite && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm font-semibold text-slate-900">We read {s.name || "your site"}</p>
                {s.sells && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{s.sells}</p>}
                {s.offer && <p className="mt-2 text-[13px] text-slate-700"><span className="font-semibold text-slate-400">Offer on your site </span>{s.offer}</p>}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><label className={labelCls} htmlFor="meta-cat">Looks like</label>
                    <select id="meta-cat" className={inputCls} value={s.product} onChange={(e) => pick({ product: e.target.value })}>{Object.entries(CATS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></div>
                  <div><label className={labelCls} htmlFor="meta-items">Products in the ads</label>
                    <select id="meta-items" className={inputCls} value={s.items} onChange={(e) => pick({ items: e.target.value })}>{ITEMS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
                </div>
                <p className="mt-2 text-xs text-slate-500">Change either if we guessed wrong.</p>
              </div>
            )}
            {!s.fromSite && <button type="button" onClick={() => set({ fromSite: false, step: at + 1 })} className="mt-4 text-[13px] font-semibold text-slate-600 underline hover:text-slate-900">I'll answer by hand instead</button>}
          </div>
        )}

        {q.id === "goal" && (
          <div className="mt-4 grid gap-2.5">
            {Object.entries(GOALS).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={s.goal === k} onClick={() => pick({ goal: k })} className={chip(s.goal === k)}>
                {v.label}<span className="block text-xs font-normal text-slate-500">{v.sub}</span>
              </button>
            ))}
          </div>
        )}

        {q.id === "product" && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {Object.entries(CATS).map(([k, [t]]) => <button key={k} type="button" aria-pressed={s.product === k} onClick={() => pick({ product: k })} className={chip(s.product === k)}>{t}</button>)}
          </div>
        )}

        {q.id === "items" && (
          <div className="mt-4 grid gap-2.5">
            {ITEMS.map(([k, t]) => <button key={k} type="button" aria-pressed={s.items === k} onClick={() => pick({ items: k })} className={chip(s.items === k)}>{t}</button>)}
          </div>
        )}

        {q.id === "value" && (
          <div className="mt-4">
            <p className="mb-3 text-[13px] text-slate-500">{s.goal === "leads" ? "About how much money does one new customer or booking bring in?" : "About how much does a customer spend in one order, on average?"} A rough number is fine.</p>
            <label className={labelCls} htmlFor="meta-aov">Amount, in your currency</label>
            <input id="meta-aov" type="number" min="1" max="100000" inputMode="decimal" className={inputCls} value={s.aov} placeholder="45" onChange={(e) => pick({ aov: e.target.value })} />
          </div>
        )}

        {OPTIONS[q.id] && (
          <div className="mt-4">
            <p className="mb-3 text-[13px] text-slate-500">{typeof HELP[q.id] === "function" ? HELP[q.id](s) : HELP[q.id]}</p>
            <div className="grid gap-2.5">
              {OPTIONS[q.id].map(([k, t]) => <button key={k} type="button" aria-pressed={s[q.id] === k} onClick={() => pick({ [q.id]: k })} className={chip(s[q.id] === k)}>{t}</button>)}
            </div>
          </div>
        )}

        {q.id === "track" && (
          <div className="mt-4">
            <p className="mb-3 text-[13px] text-slate-500">That means the Meta Pixel is on your website, or your shop is connected to Meta.</p>
            <div className="grid gap-2.5">
              {TRACK.map(([k, t]) => <button key={k} type="button" aria-pressed={s.track === k} onClick={() => pick({ track: k })} className={chip(s.track === k)}>{t}</button>)}
            </div>
            <TrackHelp kind={s.track} onFixed={() => pick({ track: "yes" })} />
          </div>
        )}

        {q.id === "budget" && (
          <div className="mt-4">
            <div className="rounded-xl bg-blue-50 p-4 text-[13px] leading-relaxed text-slate-800 ring-1 ring-blue-200">
              {sug.cpa > 0
                ? <>Your average {s.goal === "leads" ? "customer" : "order"} is worth {sug.aov}{sug.margin ? `, and about ${Math.round(sug.margin * 100)}% of it is profit` : ""}. {s.goal === "leads" ? "An enquiry" : "A sale"} can cost around {Math.round(sug.cpa * 100) / 100} in ads and still pay. To give Meta about {SALES_A_DAY} {s.goal === "leads" ? "enquiries" : "sales"} a day to learn from, we suggest about <b>{sug.daily} a day</b>.</>
                : <>For this goal we suggest starting at about <b>{sug.daily} a day</b>. There is no sale to price, so a small start is enough.</>}
            </div>
            <p className="mb-2 mt-5 text-sm font-semibold text-slate-900">How much are you willing to spend each day?</p>
            <div className="flex flex-wrap gap-2.5">
              {[...new Set([Math.max(1, nice(sug.daily / 2)), sug.daily, sug.daily * 2])].map((b) => (
                <button key={b} type="button" aria-pressed={Number(s.budget) === b} onClick={() => pick({ budget: b })} className={chip(Number(s.budget) === b)}>
                  {b} a day{b === sug.daily && <span className="block text-xs font-normal text-slate-500">Suggested</span>}
                </button>
              ))}
            </div>
            <label className={`${labelCls} mt-4`} htmlFor="meta-budget">Or type your own, in your currency</label>
            <input id="meta-budget" type="number" min="1" max="10000" inputMode="numeric" className={inputCls} value={s.budget} placeholder={String(sug.daily)} onChange={(e) => pick({ budget: e.target.value })} />
            <p className="mt-2 text-xs text-slate-500">Spend only what you can afford to lose while you learn what works. If you spend less than we suggest, we will adjust the plan.</p>
          </div>
        )}

        {q.id === "country" && (
          <div className="mt-4 grid gap-4">
            <div>
              <label className={labelCls} htmlFor="meta-country">Country</label>
              <select id="meta-country" className={inputCls} value={s.countryCode} onChange={(e) => pick({ countryCode: e.target.value })}>
                <option value="">Choose a country</option>
                {COUNTRIES.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
            {!s.fromSite && (
              <>
                <div><label className={labelCls} htmlFor="meta-name">Brand name (optional)</label><input id="meta-name" className={inputCls} value={s.name} maxLength={60} placeholder="Coldwear" onChange={(e) => pick({ name: e.target.value })} /></div>
                <div><label className={labelCls} htmlFor="meta-site2">Website (optional)</label><input id="meta-site2" className={inputCls} value={s.site} maxLength={200} placeholder="coldwear.com" onChange={(e) => pick({ site: e.target.value.trim() })} /></div>
              </>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => set({ step: at - 1 })} disabled={at === 0} className={`${lightBtn} disabled:invisible`}>Back</button>
          <button type="button" onClick={next} disabled={!ready} className={darkBtn}>{at === qs.length - 1 ? "Show my set-up" : "Next"} <Icon.Arrow className="h-4 w-4" /></button>
        </div>
        {(at > 0 || s.fromSite) && <button type="button" onClick={() => { writeJSON(KEY, {}); window.location.reload(); }} className="mt-4 text-xs font-semibold text-slate-500 underline hover:text-slate-900">Start over with a clean form</button>}
      </section>
    </div>
  );
}
