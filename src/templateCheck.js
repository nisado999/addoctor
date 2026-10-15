/* Template data check. The studio, the gallery card and the template dialog all read fields from data.jsx, and a
   template missing one used to break a screen (the studio crashed on a restock card with no sizes). templateProblems
   lists what is wrong with one template; checkTemplates runs it over the whole list. An empty result means all good.
   Plain functions with no imports, so a test and the studio can both use them. */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const text = (v) => typeof v === "string" && v.trim() !== "";
const texts = (v) => Array.isArray(v) && v.length > 0 && v.every(text);
const unique = (list) => new Set(list).size === list.length;
// A list of rows (arrays) whose first `n` cells are text.
const rows = (v, n) => Array.isArray(v) && v.length > 0 && v.every((r) => Array.isArray(r) && r.length >= n && r.slice(0, n).every(text));

/* What the studio reads for each art kind, on top of kind, bg, hl and hook. The keys are every kind the studio can
   draw (studio.jsx KIND_LAYOUT). */
const KIND_NEEDS = {
  myth: (a, bad) => { if (!text(a.fact)) bad("art.fact must be text"); },
  stat: () => {},
  offer: () => {},
  restock: (a, bad) => {
    if (!Array.isArray(a.sizes) || !a.sizes.length || !a.sizes.every((s) => Array.isArray(s) && text(s[0]) && typeof s[1] === "boolean")) bad("art.sizes must be a list of [size, inStock]");
    if (a.badge != null && !text(a.badge)) bad("art.badge must be text when set");
  },
  neon: (a, bad) => { if (!text(a.label)) bad("art.label must be text"); },
  split: () => {},
  review: (a, bad) => { if (!text(a.quote)) bad("art.quote must be text"); },
  reviews: (a, bad) => { if (!rows(a.items, 1)) bad("art.items must be a list of [quote, name]"); },
  compare: (a, bad) => { if (!rows(a.rows, 1)) bad("art.rows must be a list of rows starting with text"); },
  checklist: (a, bad) => { if (!texts(a.items)) bad("art.items must be a list of text"); },
  steps: (a, bad) => { if (!rows(a.rows, 1)) bad("art.rows must be a list of rows starting with text"); },
  timeline: (a, bad) => { if (!rows(a.points, 3)) bad("art.points must be a list of [when, label, text]"); },
  quote: (a, bad) => { if (!text(a.text)) bad("art.text must be text"); },
  marker: (a, bad) => { if (!text(a.note)) bad("art.note must be text"); },
  receipt: (a, bad) => {
    if (!rows(a.rows, 3)) bad("art.rows must be a list of [item, old price, new price]");
    else if (!a.rows.every((r) => /\d/.test(r[1]) && /\d/.test(r[2]))) bad("art.rows prices must contain a number");
  },
  tweet: (a, bad) => { if (!text(a.text)) bad("art.text must be text"); },
  ingredients: (a, bad) => { if (!texts(a.items)) bad("art.items must be a list of text"); },
  stoplight: (a, bad) => { if (!rows(a.rows, 1)) bad("art.rows must be a list of rows starting with text"); },
  dm: (a, bad) => { ["sent", "recv"].forEach((k) => { if (a[k] != null && !text(a[k])) bad(`art.${k} must be text when set`); }); },
  press: (a, bad) => { if (!text(a.quote)) bad("art.quote must be text"); },
  newspaper: (a, bad) => { if (!text(a.quote)) bad("art.quote must be text"); },
  beforeafter: (a, bad) => { ["before", "after"].forEach((k) => { if (!a[k] || !text(a[k].metric)) bad(`art.${k}.metric must be text`); }); },
  chart: (a, bad) => {
    ["start", "end"].forEach((k) => { if (!Array.isArray(a[k]) || !text(a[k][0]) || !text(a[k][1])) bad(`art.${k} must be [label, value]`); });
    if (!text(a.metric)) bad("art.metric must be text");
  },
};
const KINDS = Object.keys(KIND_NEEDS);

/* Problems with one template, as short sentences. opts.categories (the gallery's CATEGORIES) also checks the category. */
function templateProblems(t, opts = {}) {
  const out = [];
  const bad = (msg) => out.push(msg);
  if (!t || typeof t !== "object") return ["is not an object"];

  if (!text(t.id) || !SLUG.test(t.id)) bad("id must be a lowercase slug");
  if (t.type !== "video" && t.type !== "static") bad("type must be video or static");
  ["title", "label", "framework", "headline", "primary"].forEach((k) => { if (!text(t[k])) bad(`${k} must be text`); });
  if (!text(t.category)) bad("category must be text");
  else if (opts.categories && (!opts.categories.includes(t.category) || t.category === "All")) bad(`category "${t.category}" is not in CATEGORIES`);
  // The Examine dialog shows the first two parts of the format.
  if (!text(t.format) || t.format.split(" · ").length < 2) bad('format must read like "4:5 · Static · …"');
  // Reasons are list keys in the studio and the template dialog, so they must differ.
  if (!texts(t.why)) bad("why must be a list of text");
  else if (!unique(t.why)) bad("why has a repeated line");
  if (t.desc != null && !text(t.desc)) bad("desc must be text when set");
  if (t.tags != null && (!texts(t.tags) || !unique(t.tags))) bad("tags must be a list of different text values");
  if (t.type === "video" && !(typeof t.dur === "string" && /^\d+:\d{2}$/.test(t.dur))) bad('dur must read like "0:08" for a video');
  if (t.focus != null && !text(t.focus)) bad("focus must be a CSS position when set");
  ["trending", "isNew"].forEach((k) => { if (t[k] != null && typeof t[k] !== "boolean") bad(`${k} must be true or false`); });

  const a = t.art;
  if (!a || typeof a !== "object") { bad("art is missing"); return out; }
  if (!KIND_NEEDS[a.kind]) bad(`art.kind "${a.kind}" is not one the studio can draw`);
  else KIND_NEEDS[a.kind](a, bad);
  const bg = typeof a.bg === "string" ? a.bg : "";
  const colours = bg.match(/#[0-9a-z]+/gi) || [];
  if (!colours.length) bad("art.bg must contain a hex colour");
  colours.filter((c) => !HEX.test(c)).forEach((c) => bad(`art.bg colour ${c} is not a hex colour`));
  if (!(typeof a.hl === "string" && HEX.test(a.hl))) bad("art.hl must be a hex colour");
  if (!text(a.hook)) bad("art.hook must be text");
  // *stars* mark the highlighted words, so they come in pairs.
  else if ((a.hook.match(/\*/g) || []).length % 2) bad("art.hook has an unpaired *");
  if (a.light != null && typeof a.light !== "boolean") bad("art.light must be true or false");
  return out;
}

/* Every template with problems, plus repeated ids: [{ id, problems }]. */
function checkTemplates(list, opts = {}) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((t, i) => {
    const problems = templateProblems(t, opts);
    const id = t && typeof t.id === "string" ? t.id : `#${i}`;
    if (seen.has(id)) problems.push("id is used by another template");
    seen.add(id);
    if (problems.length) out.push({ id, problems });
  });
  return out;
}

export { templateProblems, checkTemplates, KINDS };
