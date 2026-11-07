/* Meta Ads Plan: the questions and the rules that turn the answers into a campaign plan.
   Pure functions, no network: the plan is worked out in the browser, so it is instant and costs nothing.
   The numbers come from the visitor's own answers (order value, margin, budget); the structure follows how Meta's
   delivery system learns (about 50 results a week per ad set), so a small budget gets fewer ad sets, not more. */

const CURRENCIES = [["EUR", "€ EUR"], ["USD", "$ USD"], ["GBP", "£ GBP"]];

const MARGIN = { low: 0.25, mid: 0.4, high: 0.6, top: 0.75 };
const CLOSE = { c1: 0.1, c2: 0.2, c3: 0.35, c5: 0.5 };
const APP_PAY = 0.05;   // share of installs that become paying users, when we have nothing better
const LEARN = 50;       // results a week an ad set needs to leave Meta's learning phase
/* A cautious "what it usually costs" for results whose price the market sets, not the visitor's margin. In the
   visitor's currency, treating EUR, USD and GBP alike. A store's cost per sale follows its order value, so it has none. */
const TYPICAL = { leads: 60, local: 25, calls: 15, installs: 2.5, purchases: 40 };

/* type: text | area | choice | money. "options" may be a function of the answers so far. "when" hides a question. */
const QUESTIONS = [
  { id: "brand", part: "Your brand", label: "What is your brand called?", type: "text", ph: "e.g. Nova Skincare" },
  { id: "sells", part: "Your brand", label: "What do you sell, in a sentence?", type: "area", ph: "e.g. A lightweight daily sunscreen for sensitive skin" },
  { id: "site", part: "Your brand", label: "Your website", hint: "Optional.", type: "text", ph: "yourbrand.com", optional: true },
  { id: "model", part: "Your brand", label: "What kind of business is it?", type: "choice", options: [
    ["shop", "Online store", "You sell products on your site"],
    ["leads", "Services or B2B", "You need enquiries or booked calls"],
    ["local", "Local business", "Shop, clinic, gym, salon, restaurant"],
    ["app", "Mobile app", "You want installs or subscribers"],
  ] },
  { id: "geo", part: "Your brand", label: "Where are your customers?", type: "choice", options: [
    ["local", "One city or area"], ["country", "One country"], ["multi", "A few countries"], ["world", "Worldwide"],
  ] },
  { id: "who", part: "Your brand", label: "Who usually buys from you?", hint: "Optional. Helps us write your hooks, not to narrow targeting.", type: "text", ph: "e.g. Women 25-45 with sensitive skin", optional: true },

  { id: "goal", part: "Your goal", label: "What do you want from Meta ads most?", type: "choice", options: (a) => (
    a.model === "leads" ? [["leads", "More leads and enquiries"], ["aware", "Get the brand known"]]
    : a.model === "local" ? [["leads", "Bookings or form enquiries"], ["calls", "Calls, messages and visits"], ["aware", "Get known in the area"]]
    : a.model === "app" ? [["installs", "More installs"], ["purchases", "More subscribers or in-app purchases"]]
    : [["sales", "More online sales"], ["aware", "Get the brand known"]]
  ) },
  { id: "value", part: "Your goal", type: "money", label: (a) => (
    a.model === "leads" ? "What is a new client worth to you?"
    : a.model === "local" ? "What does a new customer spend with you?"
    : a.model === "app" ? "What does a paying user bring in, in the first year?"
    : "What is your average order value?"
  ), hint: (a) => (a.model === "shop" || !a.model ? "The average basket, before discounts." : "First purchase or first contract is fine. A rough number works."), ph: "e.g. 60" },
  { id: "margin", part: "Your goal", label: "What is left after product cost, shipping and fees?", hint: "Your gross margin. A guess is fine.", type: "choice", options: [
    ["low", "Under 30%"], ["mid", "30 to 50%"], ["high", "50 to 70%"], ["top", "Over 70%"],
  ] },
  { id: "close", part: "Your goal", label: "Out of 10 enquiries, how many become customers?", type: "choice", when: (a) => (a.model === "leads" || a.model === "local") && a.goal !== "aware", options: [
    ["c1", "About 1"], ["c2", "About 2"], ["c3", "3 or 4"], ["c5", "5 or more"],
  ] },
  { id: "budget", part: "Your goal", type: "money", label: "How much can you spend on Meta ads a month?", hint: "Ad spend only, not fees.", ph: "e.g. 1500" },

  { id: "history", part: "Your account", label: "Have you run Meta ads before?", type: "choice", options: [
    ["new", "Never"], ["tried", "Yes, but it didn't work"], ["running", "Running now, I want to scale"],
  ] },
  { id: "conv", part: "Your account", label: (a) => `How many ${resultWord(a, true)} did Meta ads bring last week?`, type: "choice", when: (a) => a.history && a.history !== "new" && a.goal !== "aware", options: [
    ["none", "None"], ["low", "1 to 10"], ["mid", "11 to 50"], ["high", "More than 50"],
  ] },
  { id: "tracking", part: "Your account", label: (a) => (a.model === "app" ? "Is the Meta SDK or an attribution tool (AppsFlyer, Adjust) set up?" : "Is your Meta tracking set up?"), type: "choice", options: (a) => (
    a.model === "app" ? [["capi", "Yes, events reach Meta"], ["none", "No"], ["unsure", "Not sure"]]
    : [["capi", "Pixel and Conversions API"], ["pixel", "Pixel only"], ["none", "No pixel yet"], ["unsure", "Not sure"]]
  ) },
  { id: "products", part: "Your account", label: "How many products do you sell?", type: "choice", when: (a) => a.model === "shop", options: [
    ["hero", "1 to 3 hero products"], ["range", "4 to 20 products"], ["catalog", "More than 20 (a catalog)"],
  ] },
  { id: "traffic", part: "Your account", label: "How many people visit your website a month?", type: "choice", when: (a) => a.model !== "app", options: [
    ["t0", "Under 1,000"], ["t1", "1,000 to 10,000"], ["t2", "10,000 to 50,000"], ["t3", "More than 50,000"],
  ] },
  { id: "list", part: "Your account", label: "Do you have a list of customer emails or phone numbers?", type: "choice", options: [
    ["none", "No"], ["small", "Under 1,000"], ["mid", "1,000 to 10,000"], ["big", "More than 10,000"],
  ] },
  { id: "creative", part: "Your account", label: "Which ads do you have ready?", type: "choice", options: [
    ["none", "Nothing yet"], ["photos", "Product photos only"], ["some", "A few videos or UGC"], ["lots", "Lots of photos and videos"],
  ] },
];

const textOf = (q, a, key) => (typeof q[key] === "function" ? q[key](a) : q[key]);
const optionsOf = (q, a) => (typeof q.options === "function" ? q.options(a) : q.options) || [];
const visibleQuestions = (a) => QUESTIONS.filter((q) => !q.when || q.when(a));

function resultWord(a, plural) {
  const g = a.goal, m = a.model;
  const w = g === "installs" ? "install" : g === "purchases" ? "paying user" : g === "calls" ? "call or message" : (m === "leads" || m === "local") ? "lead" : "sale";
  if (!plural) return w;
  return w === "call or message" ? "calls or messages" : w === "paying user" ? "paying users" : w + "s";
}

const num = (v) => { const n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
function money(v, cur) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "EUR", maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v); }
  catch (e) { return `${Math.round(v)} ${cur || ""}`; }
}
const round = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* --------------------------------------------- the plan --------------------------------------------- */

function buildPlan(a) {
  const cur = a.cur || "EUR";
  const $ = (v) => money(v, cur);
  const model = a.model || "shop";
  const goal = a.goal || (model === "app" ? "installs" : model === "shop" ? "sales" : "leads");
  const aware = goal === "aware";
  const value = num(a.value);
  const m = MARGIN[a.margin] || 0.4;
  const close = CLOSE[a.close] || 0.2;
  const monthly = num(a.budget);
  const daily = monthly / 30;
  const word = resultWord({ ...a, goal }), words = resultWord({ ...a, goal }, true);
  const brand = (a.brand || "").trim() || "your brand";
  const who = (a.who || "").trim();

  // What one result may cost before it loses money, and a target that leaves a profit.
  const breakEven = model === "shop" ? value * m
    : model === "app" ? (goal === "installs" ? value * m * APP_PAY : value * m)
    : value * m * close;
  const target = breakEven * 0.7;
  const typical = model === "shop" ? 0 : TYPICAL[goal === "calls" ? "calls" : model === "app" ? goal : model] || 0;
  const likely = typical && target > 0 ? Math.min(target, typical) : target;   // what the plan is sized on
  const perWeek = likely > 0 ? (daily * 7) / likely : 0;
  const learnDaily = (LEARN * likely) / 7;

  const stage = a.history === "running" && (a.conv === "mid" || a.conv === "high") ? "scale"
    : a.history === "tried" ? "rebuild" : "launch";
  const traffic = a.traffic || "t0";
  const warm = traffic === "t2" || traffic === "t3";
  const bigList = a.list === "mid" || a.list === "big";
  const catalog = a.products === "catalog";
  const instantForms = (model === "leads" || model === "local") && (a.tracking !== "capi" || traffic === "t0");

  /* ---- the headline numbers ---- */
  const numbers = [];
  numbers.push({ label: "Daily budget", value: $(daily), note: `${$(monthly)} a month` });
  if (!aware && breakEven > 0) {
    if (model === "shop") numbers.push({ label: "Break-even ROAS", value: `${(1 / m).toFixed(2)}x`, note: `Under this, each sale loses money` });
    numbers.push({ label: `Max cost per ${word}`, value: $(breakEven), note: "Break-even on the first " + (model === "shop" ? "order" : "sale") });
    numbers.push({ label: `Target cost per ${word}`, value: $(target), note: "Leaves about 30% profit" });
    if (typical && typical < target) numbers.push({ label: `Typical cost per ${word}`, value: `~${$(typical)}`, note: "A cautious guess. Your market sets it" });
    numbers.push({ label: `${words[0].toUpperCase()}${words.slice(1)} a week, roughly`, value: `~${round(perWeek)}`, note: `Meta learns best at ${LEARN}+ per ad set` });
  }

  /* ---- readiness checks ---- */
  const checks = [];
  const tr = a.tracking;
  if (model === "app") {
    if (tr === "capi") checks.push({ tone: "good", title: "App events reach Meta", text: "Make sure install and purchase (or subscribe) events show in Events Manager, and that iOS uses Aggregated Event Measurement." });
    else checks.push({ tone: "bad", title: "Set up the Meta SDK or your attribution tool first", text: "Without app events Meta can only find people who install, not people who pay. Connect the SDK or AppsFlyer/Adjust and send install, trial and purchase events." });
  } else if (tr === "capi") checks.push({ tone: "good", title: "Tracking is ready", text: "Pixel plus Conversions API is the setup Meta needs. Check the Event Match Quality score in Events Manager is 6 or higher." });
  else if (tr === "pixel") checks.push({ tone: "warn", title: "Add the Conversions API", text: "With the pixel alone, iPhone users and ad blockers hide a large share of your results, so Meta learns from less data. Shopify and WooCommerce have free official Meta apps that add it in minutes." });
  else if (tr === "none") checks.push({ tone: "bad", title: "Install the Meta pixel before you spend anything", text: `Without it Meta cannot see who ${model === "shop" ? "buys" : "becomes a lead"}, so it cannot find more people like them. Set up the pixel and Conversions API (Shopify: the Facebook & Instagram app; WordPress: Meta for WooCommerce).` });
  else checks.push({ tone: "warn", title: "Check your tracking", text: "Open Events Manager and confirm your pixel fires on the key steps (view, add to cart or lead, purchase) and that Conversions API is connected." });

  if (!aware && model !== "app" && goal !== "calls") checks.push({ tone: "warn", title: "Verify your domain and set your key event", text: "Business Settings › Brand safety › Domains. Then in Events Manager put " + (model === "shop" ? "Purchase" : "Lead") + " at the top of your web event priority." });

  if (!aware && target > 0) {
    if (daily < likely) checks.push({ tone: daily < likely / 2 ? "bad" : "warn", title: "The budget is very small for this goal", text: `At ${$(daily)} a day you can expect less than one ${word} a day (each may cost around ${$(likely)}). Results will be slow and noisy. Start with at least ${$(likely)} a day (${$(likely * 30)} a month)${model === "shop" ? ", or raise the order value with a bundle" : ""}.` });
    else if (perWeek < LEARN) checks.push({ tone: "warn", title: "Keep everything in one ad set", text: `You can expect roughly ${round(perWeek)} ${words} a week, under the ${LEARN} Meta needs per ad set to learn. Splitting the budget would make it worse, so the plan uses one campaign and one ad set. Around ${$(learnDaily)} a day would give the algorithm a full learning signal.` });
    else checks.push({ tone: "good", title: "Budget is big enough to learn", text: `Roughly ${round(perWeek)} ${words} a week, above the ${LEARN} Meta needs per ad set.` });
  }
  if (model === "shop" && m <= 0.25) checks.push({ tone: "warn", title: "Thin margins", text: `You need a ROAS of ${(1 / m).toFixed(1)}x just to break even. Raise the order value with bundles, a free-shipping threshold or an upsell before scaling.` });
  if (a.creative === "none") checks.push({ tone: "bad", title: "You need ads before you launch", text: "Make at least 4 different ads first. AdDoctor's Create Static Ads and Explore Templates can make them for you." });
  if (a.history === "tried") checks.push({ tone: "warn", title: "Why it may not have worked before", text: "The usual causes: too many ad sets splitting a small budget, narrow interest targeting, one or two ads only, and editing campaigns every day so they never leave learning. This plan avoids all four." });

  /* ---- campaigns ---- */
  const ads = a.creative === "none" ? 4 : a.creative === "photos" ? 3 : a.creative === "some" ? 4 : 6;
  const adCount = clamp(daily < 2 * Math.max(likely, 1) ? Math.min(ads, 4) : ads, 3, 6);
  const country = a.geo === "local" ? "your city, radius 10 to 20 km" : a.geo === "country" ? "your country" : a.geo === "multi" ? "your countries (one campaign per language)" : "your best 3 to 5 countries first";
  const broad = { title: "Broad, Advantage+ audience", text: `Location: ${country}. Age 18 to 65+, all genders. Turn Advantage+ audience on and let the ads find the buyer.` };
  const campaigns = [];
  let testing = false;

  const mainName = model === "app" ? "Advantage+ app campaign" : model === "shop" ? "Sales: Main" : model === "local" ? (goal === "calls" ? "Leads: Calls and messages" : "Leads: Local") : "Leads: Main";
  const objective = aware ? "Awareness" : model === "app" ? "App promotion" : model === "shop" ? "Sales" : "Leads";
  const optimise = aware ? "Reach, frequency capped at 2 per 7 days (or ThruPlay for video)"
    : model === "app" ? (goal === "purchases" && (a.conv === "mid" || a.conv === "high") ? "App event: Purchase or Subscribe" : "App installs (switch to the purchase event once you have 50 a week)")
    : model === "shop" ? "Purchase (conversion event), highest volume"
    : goal === "calls" ? "Calls or conversations (WhatsApp / Messenger)"
    : instantForms ? "Leads, using an Instant Form with the 'Higher intent' type" : "Leads on your website (Lead event)";

  if (aware) {
    campaigns.push({
      name: "Awareness: Reach", objective: "Awareness", share: 1, type: "Campaign budget on",
      why: "Brand reach is cheap, but it does not sell by itself. Use it to build an audience of video viewers, then sell to them.",
      adsets: [{ name: "Broad", audience: broad.text, optimise, ads: `${adCount} ads, mostly short vertical video` }],
    });
  } else if (stage === "scale" && perWeek >= LEARN) {
    const retarget = warm && model !== "app";
    const mainShare = retarget ? 0.7 : 0.8;
    campaigns.push({
      name: model === "shop" ? "Advantage+ sales campaign" : mainName, objective, share: mainShare, type: model === "shop" ? "Advantage+ sales (all on)" : "Campaign budget on",
      why: "Your scaling engine. One ad set with everything that already works. Only proven winners from the testing campaign move in here.",
      adsets: [{ name: "Broad, all winners", audience: broad.text + (bigList ? " Upload your customer list as 'existing customers' and cap spend on them at 10 to 20%." : ""), optimise, ads: `Your best 6 to 10 ads${catalog ? " plus a catalog ad" : ""}` }],
    });
    testing = true;
    campaigns.push({
      name: "Creative testing", objective, share: 0.2, type: "Ad set budgets (ABO)",
      why: "New ideas get a fair, equal budget here before they touch the main campaign. Winners are copied over with their post ID so they keep their likes and comments.",
      adsets: [1, 2, 3].map((i) => ({ name: `Concept ${i}`, audience: "Broad, same as main", optimise, ads: "3 to 4 versions of one idea (different hooks or first frames)" })),
    });
    if (retarget) campaigns.push({
      name: model === "shop" ? "Retargeting" : "Retargeting: warm visitors", objective, share: 0.1, type: "Campaign budget on",
      why: "You have enough traffic for a separate warm campaign. Keep it small: Advantage+ already reaches many warm people.",
      adsets: [{ name: "Visited or engaged, last 30 days", audience: `Website visitors 30 days${model === "shop" ? ", added to cart 14 days" : ""}, Instagram and Facebook engagers 30 days. Exclude ${model === "shop" ? "purchasers 30 days" : "people who already became leads"}.`, optimise, ads: catalog ? "Catalog ads (dynamic) showing the products they viewed, plus 2 reviews / offer ads" : "3 ads: reviews, objection handling, an offer or guarantee" }],
    });
  } else if (perWeek >= LEARN && model !== "local") {
    campaigns.push({
      name: mainName, objective, share: 0.8, type: model === "shop" ? "Sales with Advantage+ on (budget, audience, placements)" : "Campaign budget on",
      why: "One campaign does the selling. Fewer, bigger ad sets learn faster than many small ones.",
      adsets: [{ name: "Broad", audience: broad.text + (bigList ? " Add a 1% lookalike of your customer list as an audience suggestion." : ""), optimise, ads: `${adCount} different ads${catalog ? " plus one catalog ad" : ""}` }],
    });
    testing = true;
    campaigns.push({
      name: "Creative testing", objective, share: 0.2, type: "Ad set budgets (ABO)",
      why: "From week 2, test new ideas here with an equal budget each. Move winners into the main campaign.",
      adsets: [1, 2].map((i) => ({ name: `Concept ${i}`, audience: "Broad, same as main", optimise, ads: "3 versions of one idea" })),
    });
  } else {
    campaigns.push({
      name: mainName, objective, share: 1, type: model === "shop" ? "Sales with Advantage+ on (budget, audience, placements)" : "Campaign budget on",
      why: perWeek < LEARN ? "Your budget gives Meta one strong signal instead of several weak ones, so everything goes into one campaign and one ad set. Test new ads inside it." : "Keep it simple until you have proof: one campaign, one ad set, several ads.",
      adsets: [{ name: model === "local" ? "Local area" : "Broad", audience: model === "local" ? `Your address or city, radius 5 to 15 km (bigger in the countryside). Age 18 to 65+. Advantage+ audience on.${who ? ` Speak to ${who} in the ad, not in the targeting.` : ""}` : broad.text, optimise, ads: `${adCount} different ads${catalog ? " (one can be a catalog ad)" : ""}` }],
    });
  }
  campaigns.forEach((c) => { c.daily = daily * c.share; });

  /* ---- targeting ---- */
  const targeting = [
    "Go broad. In 2025 and 2026 Meta's system finds buyers from the ad itself far better than from interests, so the creative does the targeting.",
    who ? `Speak to ${who} in the first line and first frame of each ad; leave the audience settings wide.` : "Name the buyer in the first line and first frame of each ad; leave the audience settings wide.",
    "Placements: Advantage+ placements. Give every ad a 4:5 version for feeds and a 9:16 version for Stories and Reels.",
  ];
  if (bigList) targeting.push("Upload your customer list as a Custom Audience. Use it to exclude buyers from offers for new customers, and as an audience suggestion or 1% lookalike.");
  else if (a.list === "small") targeting.push("Your customer list is small; upload it anyway and exclude it from first-order offers.");
  if (model === "leads") targeting.push("B2B: still start broad. If leads are poor, add job titles or industries as an audience suggestion, and add a qualifying question to the form instead of narrowing.");
  if (a.geo === "multi") targeting.push("One campaign per language. Countries that share a language can share a campaign.");

  /* ---- creative plan ---- */
  const concepts = model === "shop" ? [
    "UGC or a customer talking to camera: problem, product, result",
    "Product demo in 3 seconds: the 'how it works' moment up close",
    "Static benefit ad: one big claim, the product, a review star line",
    "Us vs them comparison (your product vs the usual option)",
    catalog ? "Catalog / carousel of best sellers" : "Offer or bundle ad with a clear reason to buy now",
  ] : model === "leads" ? [
    "Founder or expert to camera: the one mistake your buyer makes",
    "Case study: before, what you did, the result in numbers",
    "Problem-agitate static: the pain in the headline, the fix below",
    "FAQ / objection ad: price, time, risk answered straight",
  ] : model === "local" ? [
    "A face from the business inviting people in (phone video is fine)",
    "Offer with the area named in the headline ('New in Athens?')",
    "Reviews: real Google reviews over a photo of the place",
    "Behind the scenes: the space, the team, the result",
  ] : [
    "Screen recording of the app doing the main job in 5 seconds",
    "UGC reaction: someone using it and saying why",
    "Feature list static: the 3 things it fixes",
    "Before / after: life without it vs with it",
  ];
  const hooks = model === "shop" ? [
    who ? `"For ${who} who are tired of…"` : `"If you're tired of [the problem]…"`,
    `"I tried everything until I found ${brand}"`,
    `"3 reasons people switch to ${brand}"`,
    `"Stop buying [the usual option]. Here's why."`,
  ] : model === "app" ? [
    `"This app replaced 3 others on my phone"`,
    `"POV: you finally ${who ? "found an app for " + who : "fixed [the problem]"}"`,
    `"Here's what ${brand} does in 10 seconds"`,
  ] : [
    who ? `"${who[0].toUpperCase() + who.slice(1)}: are you making this mistake?"` : `"Are you making this mistake with [the problem]?"`,
    `"How we helped a client get [result] in [time]"`,
    `"What [service] really costs (and what it should)"`,
  ];

  /* ---- rules ---- */
  const rules = [
    { title: "Leave it alone for the first 3 to 4 days", text: "Every big edit (budget jumps, new targeting, new ad set) restarts learning. Only switch off ads that are clearly failing." },
    aware ? { title: "Watch cost per 1,000 people reached and video hold rate", text: "Keep ads whose viewers watch past 3 seconds (hook rate 25%+). Swap the rest." }
      : { title: "Switch off an ad", text: `when it has spent ${$(Math.max(likely * 2, 5))} (2x the cost you expect per ${word}) with no ${word}, or when its link click-through rate is under about 0.8% after 2,000 impressions.` },
    aware ? { title: "Sell to the people you reached", text: "After 2 weeks, retarget people who watched 50%+ of your videos with a Sales or Leads campaign." }
      : { title: "Scale what works", text: `When a campaign stays under ${$(target)} per ${word} for 3 days in a row, raise its budget by 20%. Wait 2 to 3 days between raises.` },
    { title: "Feed it new ads", text: `Add ${daily >= 100 ? "4 to 6" : "2 to 3"} new ads every ${daily >= 100 ? "week" : "2 weeks"}. When frequency passes 3 and the cost rises, the audience is tired of the ad, not of you.` },
  ];

  /* ---- 30 days ---- */
  const weeks = [
    { title: "Week 1: set up and launch", items: [
      tr === "capi" || model === "app" ? "Double-check events in Events Manager" : "Install the pixel and Conversions API, verify the domain",
      a.creative === "none" || a.creative === "photos" ? `Make ${adCount} ads in different styles (4:5 and 9:16)` : `Pick your ${adCount} strongest, most different ads`,
      `Launch ${campaigns[0].name} at ${$(campaigns[0].daily)} a day`,
    ] },
    { title: "Week 2: read, don't react", items: [
      "Switch off ads that hit the off rule; keep the rest running",
      testing ? "Start the creative testing campaign with your first concepts" : "Add 2 new ads in the style of your best one",
      aware ? "Check reach, frequency and hook rate" : `Compare the cost per ${word} with your target of ${$(target)}`,
    ] },
    { title: "Week 3: new angles", items: [
      "Make new ads on the angle that won (new hook, same idea)",
      model === "shop" ? "Try an offer or bundle ad if conversion rate is low" : "Tighten the form or landing page if leads are poor",
      "Answer comments on your ads: they are social proof",
    ] },
    { title: "Week 4: scale or fix", items: [
      aware ? "Launch the warm retargeting campaign" : `If on target: raise budget 20% every 2 to 3 days`,
      aware ? "Keep the best 2 videos running" : "If not: change the creative or the offer, not the targeting",
      "Write down what won and why, for next month's ads",
    ] },
  ];

  const verdict = aware ? `Start with one Awareness campaign for ${brand}, then sell to the people who watched.`
    : campaigns.length === 1 ? `Start with one ${objective} campaign, one ${model === "local" ? "local" : "broad"} ad set and ${adCount} ads. Keep it simple until it proves itself.`
    : `Run ${campaigns.length} campaigns: ${campaigns.map((c) => `${c.name} (${Math.round(c.share * 100)}%)`).join(", ")}.`;

  const assumptions = [];
  if (model === "leads" || model === "local") assumptions.push(`About ${Math.round(close * 100)}% of enquiries become customers (your answer).`);
  if (typical && typical < target) assumptions.push(`The plan is sized on a typical cost of about ${$(typical)} per ${word}. Your real cost after 2 weeks replaces it.`);
  if (model === "app" && goal === "installs") assumptions.push(`About ${Math.round(APP_PAY * 100)}% of installs become paying users. Replace this with your real number.`);
  assumptions.push("The target cost leaves 30% of your margin as profit on the first sale. Repeat buyers make it better than this.");
  assumptions.push("Rules of thumb, not guarantees. Your own results after 2 weeks beat any benchmark.");

  return { brand, cur, stage, objective, word, words, value, monthly, daily, breakEven, target, perWeek, numbers, checks, campaigns, targeting, concepts, hooks, rules, weeks, verdict, assumptions, adCount };
}

/* The plan as plain text: for copying, the download, and the email to the agency. */
function planText(p, a) {
  const $ = (v) => money(v, p.cur);
  const L = [];
  L.push(`META ADS PLAN: ${p.brand}`);
  if (a.site) L.push(`Website: ${a.site}`);
  L.push("", p.verdict, "");
  p.numbers.forEach((n) => L.push(`${n.label}: ${n.value}`));
  L.push("", "CAMPAIGNS");
  p.campaigns.forEach((c, i) => {
    L.push(`${i + 1}. ${c.name}: ${c.objective}, ${c.type}, ${$(c.daily)}/day (${Math.round(c.share * 100)}%)`);
    c.adsets.forEach((s) => L.push(`   - Ad set "${s.name}": ${s.audience} Optimise for: ${s.optimise}. Ads: ${s.ads}.`));
  });
  L.push("", "CHECKS");
  p.checks.forEach((c) => L.push(`[${c.tone === "good" ? "OK" : c.tone === "warn" ? "!" : "X"}] ${c.title}: ${c.text}`));
  L.push("", "TARGETING");
  p.targeting.forEach((t) => L.push(`- ${t}`));
  L.push("", "AD CONCEPTS");
  p.concepts.forEach((t) => L.push(`- ${t}`));
  L.push("", "HOOKS TO TRY");
  p.hooks.forEach((t) => L.push(`- ${t}`));
  L.push("", "RULES");
  p.rules.forEach((r) => L.push(`- ${r.title}: ${r.text}`));
  L.push("", "FIRST 30 DAYS");
  p.weeks.forEach((w) => { L.push(w.title); w.items.forEach((t) => L.push(`  - ${t}`)); });
  L.push("", ...p.assumptions.map((t) => `* ${t}`));
  return L.join("\n");
}

export { QUESTIONS, CURRENCIES, visibleQuestions, optionsOf, textOf, buildPlan, planText, money, num };
