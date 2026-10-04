import { Creative, pill } from "./ui";
import { txt, headline } from "./studio";

/* AdDoctor diagnostic engine. Rule-based checks grounded in direct-response
   copy principles: hook, value clarity, offer friction, call to action. */

var STOP_RE = /\b(stop|myth|mistakes?|never|secret|why|truth|wrong|nobody|quit|warning|don'?t|worst|hate)\b/i;
var GENERIC_RE = /\b(best|premium|high[- ]quality|introducing|new|revolutionary|innovative|cutting[- ]edge|game[- ]changing|state[- ]of[- ]the[- ]art|world[- ]class|amazing|awesome)\b/gi;
var JARGON_RE = /\b(revolutionary|innovative|cutting[- ]edge|game[- ]changing|state[- ]of[- ]the[- ]art|solutions?|leverage|synergy|seamless|next[- ]level|designed for all)\b/gi;
var OUTCOME_RE = /\b(get|gets|without|fix|fixes|clear|clearer|lose|grow|save|stop|no more|gone|stays?|lasts?|smoother|stronger|faster|longer|calmer|relief|crash)\b|\b(in|within)\s+\d+/i;
var OFFER_RE = /(\d+\s?%\s?off|\bfree\b|\bdiscount\b|\bsave\b|\bbonus\b|\btrial\b|\bbundle\b|\bgift\b|\$\s?\d+)/gi;
var RISK_RE = /\b(guarantee|guaranteed|money[- ]back|free returns?|returns?|refund|risk[- ]free|cancel anytime|no questions)\b/i;
var CTA_RE = /\b(shop|get|try|book|claim|order|start|grab|buy|join|download|reserve|unlock)\b/i;
var URGENCY_RE = /\b(today|now|tonight|tomorrow|ends?|limited|only|left|last chance|this week|this weekend|hurry|before)\b|\b\d+\s?(hours?|days?)\s+left\b/i;
var WEAK_CTA_RE = /\b(learn more|find out more|discover|explore|check out)\b/i;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function matches(re, s) {
  return s.match(re) || [];
}
function clip(s, n) {
  s = (s || "").trim();
  return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
}


/* ---------- Creative asset + copy alignment helpers ---------- */
var STOP_WORDS = /^(the|and|for|with|your|you|our|that|this|from|have|has|are|was|were|not|but|all|any|can|get|its|into|more|than|then|them|they|their|what|when|will|just|like|make|made|only|over|also|each|every|per|new|one|two|here|there|been|being|about)$/;
var NAME_SKIP = /^(img|image|images|photo|screenshot|screen|shot|final|copy|export|thumbnail|thumb|video|creative|untitled|static|banner|design|file|jpeg|jpg|png|webp|mp4|mov|edit|edited|version|draft|frame)$/;

function stem(w) {
  return w.replace(/s$/, "").replace(/(ing|ed)$/, function (m, a, off, str) { return str.length - m.length >= 3 ? "" : m; });
}
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(function (w) { return w.length >= 4 && !STOP_WORDS.test(w) && !/^\d+$/.test(w); })
    .map(stem);
}
function nameTokens(name) {
  return tokens((name || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " "))
    .filter(function (w) { return !NAME_SKIP.test(w); });
}

function ratioInfo(w, h) {
  var r = w / h;
  if (Math.abs(r - 9 / 16) < 0.04) return { label: "9:16", good: true };
  if (Math.abs(r - 4 / 5) < 0.04) return { label: "4:5", good: true };
  if (Math.abs(r - 1) < 0.04) return { label: "1:1", good: true };
  if (r > 1.15) return { label: r.toFixed(2) + ":1", land: true };
  return { label: w + ":" + h, good: false };
}

function scoreCreative(a, type) {
  var s = 40, notes = [], flags = {};
  var shortSide = Math.min(a.w, a.h);
  var ri = ratioInfo(a.w, a.h);
  if (ri.good) { s += 18; notes.push(a.w + "x" + a.h + " (" + ri.label + ") fills the feed without letterboxing."); }
  else if (ri.land) { s -= 14; flags.landscape = a.w + "x" + a.h + " (" + ri.label + ")"; notes.push(a.w + "x" + a.h + " is landscape (" + ri.label + "), which wastes vertical feed space."); }
  else { s += 6; notes.push(a.w + "x" + a.h + " is portrait but not a standard ratio; 4:5 or 9:16 crop cleanly."); }
  if (shortSide >= 1080) { s += 12; notes.push("Resolution is sharp."); }
  else if (shortSide >= 720) { s += 5; notes.push("Only " + shortSide + " px on the short side; export at 1080 for a crisp feed."); flags.midRes = shortSide; }
  else if (shortSide < 600) { s -= 14; flags.lowRes = shortSide; notes.push("Only " + shortSide + " px on the short side. It will look soft."); }
  if (a.lumStd >= 60) { s += 16; notes.push("Contrast is strong (spread " + a.lumStd + "), so the subject separates from the background."); }
  else if (a.lumStd >= 45) { s += 10; notes.push("Contrast is good (spread " + a.lumStd + ")."); }
  else if (a.lumStd >= 30) { s += 2; notes.push("Contrast is moderate (spread " + a.lumStd + "); push the product harder against the background."); }
  else { s -= 12; flags.lowContrast = a.lumStd; notes.push("Contrast is low (spread " + a.lumStd + "), so the creative blends into the feed."); }
  if (a.lumMean < 30 || a.lumMean > 230) { s -= 10; flags.extreme = a.lumMean; notes.push("The frame is almost " + (a.lumMean < 30 ? "black" : "white") + ", which hides detail."); }
  if (a.sat >= 0.35) s += 6;
  else if (a.sat < 0.12) { s -= 6; notes.push("Colors are muted, so nothing draws the eye."); }
  if (a.kind === "video" && a.dur) {
    if (a.dur >= 6 && a.dur <= 25) { s += 8; notes.push("Length of " + Math.round(a.dur) + "s suits short-form."); }
    else if (a.dur > 40) { s -= 8; flags.long = Math.round(a.dur); notes.push("At " + Math.round(a.dur) + "s it is long for a cold audience; hook-first cuts of 15 to 25s hold more viewers."); }
    else if (a.dur > 25) notes.push("At " + Math.round(a.dur) + "s, trim toward 25s or less.");
  }
  return { score: clamp(s, 8, 96), notes: notes, flags: flags };
}

function alignment(h, c, asset, type) {
  var s = 50, notes = [], flags = {};
  var ht = tokens(h), ct = tokens(c);
  if (ht.length && ct.length) {
    var shared = ht.filter(function (t) { return ct.indexOf(t) > -1; });
    var ratio = shared.length / ht.length;
    if (ratio >= 0.5) { s += 20; notes.push("Headline and copy repeat the same promise (\"" + shared[0] + "\")."); }
    else if (shared.length) { s += 12; notes.push("Headline and copy share \"" + shared[0] + "\", a partial match."); }
    else { s -= 8; flags.hcMismatch = ht[0]; notes.push("Headline and copy share no key words, so the headline's promise is never paid off."); }
  } else {
    s -= 10;
    notes.push("Headline or copy is missing, so message match cannot be checked.");
  }
  if (asset) {
    var at = asset.tags || [];
    if (at.length) {
      var txt = ht.concat(ct);
      var hit = at.filter(function (t) { return txt.indexOf(t) > -1; });
      var src = asset.tagSource === "sample" ? "The creative shows" : "The file name points to";
      if (hit.length) { s += 18; notes.push(src + " \"" + hit[0] + "\", and the copy mentions it."); }
      else { s -= 12; flags.acMismatch = at[0]; notes.push(src + " \"" + at[0] + "\", but the copy never mentions it."); }
    } else {
      notes.push("The scan reads pixels, not subjects. Check the creative shows the product your headline names.");
    }
  }
  if (h) {
    if (h.length <= 40) { s += 6; notes.push(type === "video" ? "Headline is short enough to run as on-screen text in the first 3 seconds." : "Headline fits without truncating."); }
    else { s -= 6; notes.push("Headline is over 40 characters, too long to work as overlay text."); }
  }
  return { score: clamp(s, 10, 95), notes: notes, flags: flags };
}

function detectCategory(text) {
  var s = text.toLowerCase();
  if (/pre-?workout|protein|creatine|magnesium|supplement|capsule|gummies|\bgym\b|workout/.test(s)) return "supp";
  if (/skin|serum|cream|moistur|cleanser|spf|retinol|vitamin c|acne|makeup|concealer|lipstick/.test(s)) return "skin";
  if (/apparel|jacket|coat|hoodie|dress|jeans|collection|outfit|sneaker|shoe|fashion|styles?\b|wardrobe/.test(s)) return "apparel";
  if (/headphone|earbuds?|controller|charger|smartwatch|battery|gadget|laptop|keyboard|speaker/.test(s)) return "tech";
  if (/coffee|espresso|tea\b|snack|sauce|beverage|flavou?rs?|drink|meal|recipe/.test(s)) return "food";
  if (/clinic|dentist|dental|cleaning|plumb|salon|appointment|repair|near you/.test(s)) return "local";
  return "generic";
}

var LIB = {
  skin: {
    headlines: [
      ["Dry skin by 3pm? Fixed in 14 days", "Pain point + outcome"],
      ["Why your serum stops working by week 2", "Contrarian"],
    ],
    hooks: [
      ["Stop scrolling if your skin feels tight by lunchtime. This is the one change that finally stopped it for me.", "Pain point"],
      ["Everyone told me to add more steps. I cut my routine down to two products and my skin finally calmed down.", "Contrarian story"],
    ],
    layout: {
      video: "Open on a bare-faced close-up at 0 to 1 seconds with the pain as on-screen text (\"tight by 3pm\"). Cut to a texture macro at 1.5 seconds, then a Day 1 vs Day 14 split at 5 seconds. Keep captions inside the 720x1200 safe zone.",
      static: "Use a Day 1 vs Day 14 split-screen with one metric under each side and the hook on a dark band across the top. Place the bottle bottom-right. One focal point and fewer than 7 words of overlay text.",
    },
  },
  supp: {
    headlines: [
      ["Train harder. Skip the 3pm crash.", "Outcome"],
      ["Why your pre-workout dies at rep 8", "Curiosity"],
    ],
    hooks: [
      ["If your pre-workout wears off mid-session, read the label before you buy another tub.", "Pain point"],
      ["I quit hidden-blend formulas after seeing what \"proprietary\" really hides. Here is what I switched to.", "Authority story"],
    ],
    layout: {
      video: "Hard cut between two 1-second beats: energy dropping at rep 8, then the same set with the product. Hold the supplement label on screen for 2 seconds so the doses are readable.",
      static: "Center the tub on a dark background and set the dose numbers in large type beside it, so the facts do the selling. Put one benefit line above the product.",
    },
  },
  apparel: {
    headlines: [
      ["The fall edit: free 60-day returns", "Offer stack"],
      ["3 pieces. 5 outfits. Zero guessing.", "Outcome"],
    ],
    hooks: [
      ["Stop rebuying jackets that pill after one winter. Here is the fall edit built to last.", "Pain point"],
      ["I styled three pieces five different ways. This is the outfit I wore all week.", "Social proof story"],
    ],
    layout: {
      video: "Open on the rack, then cut every 0.7 seconds between outfit changes with the offer pinned as a text sticker. End on a size-availability card for urgency.",
      static: "Use one full-length editorial shot with an offer bar across the bottom (discount plus free returns) and size availability as small chips.",
    },
  },
  tech: {
    headlines: [
      ["Same specs. Half the price.", "Comparison"],
      ["Why cheap earbuds die in a month", "Curiosity"],
    ],
    hooks: [
      ["Watch what happens when I put this next to the brand you are paying double for.", "Comparison"],
      ["I tested three at once for 30 days. Only one made it through the week.", "Proof story"],
    ],
    layout: {
      video: "Start in a split screen at second 0 with the same test running on both devices and a counter on screen. Finish on a hands-in-frame product close-up for the last 2 seconds.",
      static: "Build a comparison grid with three rows of specs buyers already compare, check marks for you and crosses for the competitor, and the price in the footer.",
    },
  },
  food: {
    headlines: [
      ["Fresh in 20 minutes or it's free", "Risk reversal"],
      ["Why your coffee tastes flat by 10am", "Curiosity"],
    ],
    hooks: [
      ["Pour one cup of this and you will never go back to the pods.", "Outcome"],
      ["Watch this pour in slow motion, then tell me you are not hungry.", "Sensory hook"],
    ],
    layout: {
      video: "Put a slow-motion pour or steam in the very first frame, because motion breaks the scroll. Add the product name as a lower-third at 2 seconds and the offer in the last 2 seconds.",
      static: "Use a tight macro of the product with steam or a pour, one benefit line on top, and the offer as a sticker bottom-left.",
    },
  },
  local: {
    headlines: [
      ["Same-week appointments, booked online", "Outcome"],
      ["Booked in 60 seconds, no phone call", "Friction removal"],
    ],
    hooks: [
      ["If you have been putting this off for months, here is the 60-second way to finally book it.", "Pain point"],
      ["Here is exactly what a first visit looks like, so there are no surprises.", "Objection handling"],
    ],
    layout: {
      video: "Walk through the first visit in three shots (arrive, treatment, result) with the fixed price on screen. Finish on the booking screen.",
      static: "Use a real practitioner portrait in your actual location, the neighborhood name in the headline, one fixed price, and a clear Book button at the bottom.",
    },
  },
  generic: {
    headlines: [
      ["The fastest fix, without the guesswork", "Outcome"],
      ["What nobody tells you before you buy", "Curiosity"],
    ],
    hooks: [
      ["Stop scrolling if you are still paying for a fix that never worked.", "Pain point"],
      ["I tried the popular options first. Here is what finally changed.", "Story"],
    ],
    layout: {
      video: "Show the problem in the first second as on-screen text, cut to the product solving it by second 3, and end on the offer. Keep every caption inside the safe zone.",
      static: "Use one focal point, a hook of fewer than 7 words at the top, proof (a number or a review) in the middle, and the offer and button at the bottom.",
    },
  },
};

function analyze(input) {
  var brand = (input.brand || "").trim();
  var h = (input.headline || "").trim();
  var c = (input.copy || "").trim();
  var type = input.type === "video" ? "video" : "static";
  var all = h + " " + c;
  var sentences = c ? c.split(/(?<=[.!?])\s+/) : [];
  var firstTwo = sentences.slice(0, 2).join(" ");
  var words = c ? c.split(/\s+/).length : 0;

  /* Visual stop-rate (hook) */
  var hook = 38;
  var generic = matches(GENERIC_RE, h);
  if (!h) hook -= 20;
  if (/\d/.test(h)) hook += 12;
  if (/\?/.test(h)) hook += 8;
  if (STOP_RE.test(h)) hook += 12;
  if (h.length >= 14 && h.length <= 40) hook += 8;
  else if (h.length > 40) hook -= 8;
  hook -= 8 * Math.min(2, generic.length);
  if (/\b(you|your)\b/i.test(h)) hook += 6;
  if (type === "video") hook += 6;
  hook = clamp(hook, 8, 96);
  var headlineHook = hook;
  var asset = input.asset || null;
  var creativeRes = asset ? scoreCreative(asset, type) : null;
  var align = alignment(h, c, asset, type);
  hook = asset
    ? clamp(0.4 * creativeRes.score + 0.35 * headlineHook + 0.25 * align.score, 8, 96)
    : clamp(0.7 * headlineHook + 0.3 * align.score, 8, 96);
  var hookNotes = [];
  if (!h) hookNotes.push("No headline to stop the scroll.");
  else {
    if (generic.length) hookNotes.push("Opens with \"" + generic[0].toLowerCase() + "\", a word every competitor uses.");
    if (/\d/.test(h) || /\?/.test(h) || STOP_RE.test(h)) hookNotes.push("Has a curiosity trigger (number, question or contrarian word).");
    else hookNotes.push("No curiosity trigger: no number, question or contrarian word.");
  }
  var hookParts = [
    creativeRes
      ? { key: "asset", label: "Creative asset", value: creativeRes.score, note: creativeRes.notes.join(" ") }
      : { key: "asset", label: "Creative asset", value: null, note: "No creative uploaded. Upload the image or video thumbnail to score the asset itself." },
    { key: "headline", label: "Headline hook", value: headlineHook, note: hookNotes.join(" ") },
    { key: "align", label: "Copy alignment", value: align.score, note: align.notes.join(" ") },
  ];

  /* Value proposition clarity */
  var jargon = matches(JARGON_RE, all);
  var opensWithBrand = brand && c.toLowerCase().indexOf(brand.toLowerCase()) === 0;
  var opensWeak = /^(we|our|introducing|meet|at)\b/i.test(c) || opensWithBrand;
  var clarity = 42;
  if (!c) clarity -= 24;
  else if (words >= 12 && words <= 45) clarity += 10;
  else if (words > 60 || words < 8) clarity -= 8;
  if (OUTCOME_RE.test(all)) clarity += 12;
  if (/\d/.test(c)) clarity += 10;
  if (/\b(you|your)\b/i.test(all)) clarity += 10;
  clarity -= 9 * Math.min(2, jargon.length);
  if (opensWeak) clarity -= 8;
  clarity = clamp(clarity, 8, 96);

  /* Offer friction (higher = less friction) */
  var offers = matches(OFFER_RE, all);
  var offer = 28 + Math.min(3, offers.length) * 12;
  if (RISK_RE.test(all)) offer += 14;
  offer = clamp(offer, 8, 96);

  /* Call-to-action urgency */
  var lastSentence = sentences.length ? sentences[sentences.length - 1] : "";
  var cta = 30;
  if (CTA_RE.test(c)) cta += 15;
  if (URGENCY_RE.test(all)) cta += 18;
  if (WEAK_CTA_RE.test(c)) cta -= 12;
  if (/^(shop|get|try|book|claim|order|start|grab|buy|join|download|reserve|unlock)\b/i.test(lastSentence)) cta += 8;
  cta = clamp(cta, 8, 96);

  var score = clamp(hook * 0.3 + clarity * 0.25 + offer * 0.25 + cta * 0.2, 0, 100);

  /* Conversion leaks: every detector that fires, ranked by severity */
  var leaks = [];
  function leak(area, sev, title, detail) {
    leaks.push({ area: area, sev: sev, title: title, detail: detail });
  }
  if (!h) leak("Hook", 96, "No headline to stop the scroll", "Without a headline the creative has nothing to make a cold viewer stop. Lead with the outcome or the pain in under 40 characters.");
  if (generic.length)
    leak("Hook", 86, "Generic opener", "\"" + clip(h, 60) + "\" leads with \"" + generic[0].toLowerCase() + "\", a word every competitor in the feed also uses. Nothing in it gives a viewer a reason to stop.");
  if (h && !STOP_RE.test(h) && !/\?/.test(h) && !/\d/.test(h))
    leak("Hook", 72, "Weak curiosity gap in the headline", "\"" + clip(h, 60) + "\" states a fact but never opens a question the viewer needs answered. Add a number, a question or a contrarian claim.");
  if (c && (!OUTCOME_RE.test(firstTwo) || opensWeak))
    leak("Clarity", 76, "First 2 lines bury the core transformation", "The copy opens with " + (opensWeak ? "the brand or a feature intro" : "description") + " before saying what changes for the buyer. Move the result to line one.");
  if (!c) leak("Clarity", 90, "No primary copy", "The headline is carrying the whole ad. Add two or three lines that name the problem, the result and the proof.");
  if (jargon.length)
    leak("Clarity", 62, "Jargon hides the benefit", "\"" + jargon[0].toLowerCase() + "\" tells the reader nothing concrete. Replace it with what the product actually does, in numbers if you can.");
  if (!offers.length)
    leak("Offer", 80, "No offer on the table", "Nothing in the copy gives a cold viewer a reason to act today instead of later. Add a discount, a bonus or free shipping.");
  else if (!RISK_RE.test(all))
    leak("Offer", 56, "Offer has no risk-reverser", "The offer is there, but the buyer carries all the risk. Add a guarantee or free returns to remove the last objection.");
  if (!CTA_RE.test(c) || WEAK_CTA_RE.test(c))
    leak("CTA", 66, "Soft call to action", (WEAK_CTA_RE.test(c) ? "\"" + matches(WEAK_CTA_RE, c)[0].toLowerCase() + "\" is browsing language." : "There is no clear next step.") + " Name the exact action: shop, book, claim or start.");
  if (!URGENCY_RE.test(all))
    leak("CTA", 52, "No reason to act now", "Add a deadline, a stock signal or a seasonal trigger so the viewer does not save it for later and forget.");
  if (!/\d/.test(all))
    leak("Clarity", 46, "No specific number", "Claims without a number read as marketing. Add a time frame, a quantity or a result.");
  if (words > 70)
    leak("Clarity", 40, "Copy is too long for mobile", "At " + words + " words, only the first ~125 characters show before \"See more\". Put the offer in the first line.");
  if (creativeRes) {
    var f = creativeRes.flags;
    if (f.lowContrast != null) leak("Hook", 84, "Low-contrast creative", "The creative has low contrast (spread " + f.lowContrast + " on a 0 to 255 scale), so it blends into the feed. Set the product against a much darker or brighter ground.");
    if (f.landscape) leak("Hook", 79, "Landscape crop wastes feed space", asset.w + "x" + asset.h + " is " + f.landscape.split("(")[1].replace(")", "") + ". Re-crop to 4:5 for feed or 9:16 for Stories and Reels.");
    if (f.lowRes) leak("Hook", 66, "Creative is too low-resolution", "Only " + f.lowRes + " px on the short side. Export at 1080 px or more.");
    if (f.long) leak("Hook", 60, "Video runs too long", f.long + " seconds is long for a cold audience. Cut to 15 to 25 seconds with the hook in the first 3.");
    if (f.extreme != null) leak("Hook", 50, "Frame is nearly " + (f.extreme < 30 ? "black" : "white"), "Detail is lost at this brightness. Re-light or re-grade the frame.");
  } else {
    leak("Hook", 30, "Creative was not inspected", "The Visual Stop-Rate score reflects copy only. Upload the creative to score the asset itself.");
  }
  if (align.flags.hcMismatch)
    leak("Hook", 74, "Headline and copy do not match", "The headline leads with \"" + align.flags.hcMismatch + "\", but the copy never picks it up. Repeat the headline's promise in the first line of copy.");
  if (align.flags.acMismatch)
    leak("Hook", 76, "Creative and copy point in different directions", "The creative shows \"" + align.flags.acMismatch + "\", but the copy never mentions it. Name what the viewer is looking at.");
  if (type === "video")
    leak("Hook", 34, "Hook the first 3 seconds", "On video, put the hook on screen as text in the first 3 seconds instead of a spoken intro. Most viewers watch muted.");
  else
    leak("Hook", 34, "Keep one focal point", "On a static, one focal point and fewer than 7 words of overlay text stop the scroll better than a busy layout.");

  leak("Hook", 20, "Only one angle is being tested", "Even a healthy ad fatigues. Build 3 to 5 angles (pain point, outcome, social proof, contrarian) and test them against each other.");
  leak("Clarity", 18, "Proof can sit higher", "Put one verified customer quote or a hard number in the first line of copy, before the feature list.");
  leaks.sort(function (a, b) { return b.sev - a.sev; });
  leaks = leaks.slice(0, 3);

  /* Prescription */
  var cat = detectCategory(brand + " " + all);
  var lib = LIB[cat];
  var brandTail = brand ? " That is why we built " + brand + "." : "";
  var headlines = lib.headlines.map(function (x) { return { text: x[0], tag: x[1] }; });
  var hooks = lib.hooks.map(function (x, i) { return { text: x[0] + (i === 1 ? brandTail : ""), tag: x[1] }; });

  var vitals = [
    { key: "hook", label: "Visual Stop-Rate (Hook)", value: hook, low: "Needs work" },
    { key: "clarity", label: "Value Proposition Clarity", value: clarity, low: "Unclear" },
    { key: "offer", label: "Offer Friction", value: offer, low: "High friction" },
    { key: "cta", label: "Call-To-Action Urgency", value: cta, low: "Weak urgency" },
  ].map(function (v) {
    if (v.key === "hook") v.parts = hookParts;
    v.status = v.value < 50 ? v.low : v.value < 70 ? "Moderate" : "Healthy";
    v.tone = v.value < 40 ? "bad" : v.value < 70 ? "warn" : "good";
    return v;
  });
  var weakest = vitals.slice().sort(function (a, b) { return a.value - b.value; })[0];

  return {
    score: score,
    status: score >= 70 ? "Healthy" : score >= 40 ? "Needs Immediate Attention" : "Critical",
    tone: score >= 70 ? "good" : score >= 40 ? "warn" : "bad",
    vitals: vitals,
    weakest: weakest,
    leaks: leaks,
    headlines: headlines,
    hooks: hooks,
    layout: lib.layout[type],
    category: cat,
  };
}

function prescriptionText(input, r) {
  var L = [];
  L.push("AdDoctor: The Doctor's Prescription");
  L.push((input.brand ? input.brand + " | " : "") + (input.type === "video" ? "Short-Form Video" : "Static Image"));
  L.push("Ad Health Score: " + r.score + "/100 (" + r.status + ")");
  L.push("");
  L.push("VITAL SIGNS");
  r.vitals.forEach(function (v) {
    L.push("- " + v.label + ": " + v.value + "% (" + v.status + ")");
    if (v.parts) v.parts.forEach(function (p) { L.push("    " + p.label + ": " + (p.value == null ? "not inspected" : p.value + "%") + ". " + p.note); });
  });
  L.push("");
  L.push("CONVERSION LEAKS");
  r.leaks.forEach(function (x, i) { L.push((i + 1) + ". " + x.title + ": " + x.detail); });
  L.push("");
  L.push("REWRITTEN HEADLINES");
  r.headlines.forEach(function (x, i) { L.push((i + 1) + ". " + x.text + " [" + x.tag + "]"); });
  L.push("");
  L.push("OPENING HOOKS");
  r.hooks.forEach(function (x, i) { L.push((i + 1) + ". " + x.text + " [" + x.tag + "]"); });
  L.push("");
  L.push("VISUAL LAYOUT");
  L.push(r.layout);
  return L.join("\n");
}


export { STOP_RE, GENERIC_RE, JARGON_RE, OUTCOME_RE, OFFER_RE, RISK_RE, CTA_RE, URGENCY_RE, WEAK_CTA_RE, clamp, matches, clip, STOP_WORDS, NAME_SKIP, stem, tokens, nameTokens, ratioInfo, scoreCreative, alignment, detectCategory, LIB, analyze, prescriptionText };
