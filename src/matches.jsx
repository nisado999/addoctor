import { useMemo } from "react";
import { TemplateImage } from "./ui";
import { TEMPLATES } from "./data";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import { track } from "./track.js";
import { FEATURED_TOP } from "./featuredOrder.js";

/* Templates that fit what the Create an ad interview learned: the gallery's static ads ranked by niche, product
   words, offer and layout. Worked out in the page from the real template data, so it is free and instant. */

const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const SHOWN = 12;
const PER_FORMAT = 3;   // no more than this many results with the same kind of layout, so the set is varied

const TOP = new Map(FEATURED_TOP.map((id, i) => [id, i]));
export const STATIC = TEMPLATES.filter((t) => t.type !== "video" && TEMPLATE_IMGS[t.id]);
export const NICHES = Object.entries(STATIC.reduce((m, t) => ((m[t.category] = (m[t.category] || 0) + 1), m), {}))
  .filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]).map(([c]) => c);

// The offer reads the headline of a template. "A new launch" and the rest are worked out from what the customer typed.
const OFFERS = [
  { id: "percent", label: "Percent off", re: /\d+\s*%|percent/i },
  { id: "multi", label: "Multi-buy or bundle", re: /\b(2|3|two|three)\s*(for|x)\b|buy\s*\d|bogo|bundle/i },
  { id: "season", label: "A sale event", re: /black friday|cyber|christmas|xmas|halloween|valentine|mother|father|easter|new year|summer|back to school|boxing|holiday|flash sale|sale/i },
  { id: "launch", label: "A new launch", re: /\bnew\b|launch|introduc|just dropped/i },
];
const offerKind = (text) => (OFFERS.find((o) => o.re.test(text || "")) || {}).id || (String(text || "").trim() ? "other" : "none");

const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ""));
const layoutOf = (t) => (t.format || "").split("·").slice(2).join("·").trim().toLowerCase() || "other";
const HAY = new Map(STATIC.map((t) => [t.id, [t.title, t.label, t.headline, t.primary, ...(Array.isArray(t.tags) ? t.tags : [])].join(" ").toLowerCase()]));

// a = { niche, sells, offer }. Each result carries the reasons it was picked, so the card can say why in plain words.
export function rank(a) {
  const niche = NICHES.includes(a.niche) ? a.niche : "";
  const kind = offerKind(a.offer);
  const offer = OFFERS.find((o) => o.id === kind);
  const free = niche ? [] : words(a.niche);   // a niche typed by hand is matched by its words instead
  const prod = words(a.sells);
  const scored = STATIC.map((t) => {
    const why = [];
    let s = t.trending ? 0.5 : 0;
    const hay = HAY.get(t.id);
    if (niche && t.category === niche) { s += 10; why.push(t.category); }
    const hit = [...new Set([...free, ...prod])].filter((w) => hay.includes(w));
    if (hit.length) { s += Math.min(6, hit.length * 3); why.push(prod.some((w) => hit.includes(w)) ? "Matches your product" : "Matches your niche"); }
    if (offer && offer.re.test([t.headline, t.title, t.offerText].join(" "))) { s += 3; why.push(offer.label); }
    return { t, s, why };
  }).filter((r) => r.s > 1).sort((x, y) => y.s - x.s || (TOP.get(x.t.id) ?? 1e9) - (TOP.get(y.t.id) ?? 1e9));   // equal fit: the better-ranked ad first
  const seen = {};
  const out = [];
  for (const r of scored) {
    const k = layoutOf(r.t);
    if ((seen[k] || 0) >= PER_FORMAT) continue;
    seen[k] = (seen[k] || 0) + 1;
    out.push(r);
    if (out.length === SHOWN) break;
  }
  return { out, inNiche: niche ? STATIC.filter((t) => t.category === niche).length : 0, niche };
}

export function Matches({ answers, photos, onUse, onBrowse }) {
  const res = useMemo(() => rank(answers), [answers]);
  const use = (t) => { track("create_use", { template_id: t.id, template_category: t.category }); onUse(t, photos); };
  return (
    <div>
      <h2 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-slate-950">{res.out.length ? `${res.out.length} templates that fit${answers.brand ? ` ${answers.brand}` : " you"}` : "No close templates yet"}</h2>
      <p className="mt-1 text-sm text-slate-500">{res.out.length ? "Pick one and your product goes into it. Nothing else in the ad changes." : "Browse the whole gallery instead."}</p>
      <ul role="list" className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {res.out.map(({ t, why }) => (
          <li key={t.id} className="flex flex-col">
            <button type="button" onClick={() => use(t)} aria-label={`Put my product in ${t.title}`} className={`group relative block aspect-[4/5] overflow-hidden rounded-[14px] bg-[#F6F6F6] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ${ring}`}>
              <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition group-hover:bg-slate-950 group-hover:text-white">Put my product in this →</span>
            </button>
            <p className="mt-2 truncate text-sm font-semibold text-slate-950">{t.title}</p>
            <p className="mt-0.5 flex flex-wrap gap-1">{why.slice(0, 3).map((w) => <span key={w} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{w}</span>)}</p>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onBrowse(res.niche)} className={`mt-6 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 ${ring}`}>{res.niche ? `Browse all ${res.inNiche} ${res.niche} templates` : "Browse all templates"}</button>
    </div>
  );
}
