import { Icon, TemplateImage } from "./ui";
import { TEMPLATES } from "./data";
import { TEMPLATE_IMGS } from "./templateImgs.js";

/* The three tools in the order people use them: research, make, check. Each card shows a small picture of the real
   screen (no invented numbers) and opens that tool. Shown under the hero on Explore. */

const pics = TEMPLATES.filter((t) => t.type !== "video" && TEMPLATE_IMGS[t.id]);
const pick = (n, from = 0) => pics.slice(from, from + n);

function Step({ n, title, text, cta, onClick, children }) {
  return (
    <li className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_4px_12px_rgba(15,23,42,.03)] transition-[border-color,box-shadow] duration-150 hover:border-slate-300 hover:shadow-[0_1px_2px_rgba(15,23,42,.05),0_10px_24px_-8px_rgba(15,23,42,.14)]">
      <div className="relative h-40 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-900/5" aria-hidden="true">{children}</div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-3.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Step {n}</p>
        <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-slate-950">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{text}</p>
        <button onClick={onClick} className="mt-3 inline-flex items-center gap-1 self-start rounded text-[13px] font-semibold text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          {cta} <Icon.Arrow className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

const chip = "rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600";

export function ToolTour({ onSpy, onMake, onExamine }) {
  return (
    <section aria-labelledby="tour-title" className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="tour-title" className="text-lg font-semibold tracking-tight text-slate-950">From a competitor's best ad to your own, in three steps</h2>
        <p className="font-mono text-[11px] text-slate-400">Examining your own ads is always free</p>
      </div>
      <ol role="list" className="mt-3 grid gap-3 md:grid-cols-3">
        <Step n="01" title="Research what works" text="Search any brand. See every ad it runs, which ones have run longest, and what each one says." cta="Spy on a competitor" onClick={onSpy}>
          <div className="absolute inset-x-3 top-3 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-400 shadow-sm">
            <Icon.Search className="h-3 w-3" /> Search a brand
          </div>
          <div className="absolute inset-x-3 top-12 flex gap-1"><span className={chip}>All ads</span><span className={chip}>Active</span><span className={chip}>Running 30+ days</span></div>
          <div className="absolute inset-x-3 bottom-[-18px] top-[76px] grid grid-cols-4 gap-1.5">
            {pick(4, 3).map((t) => <span key={t.id} className="relative overflow-hidden rounded-md bg-slate-200"><TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} lazy className="h-full w-full object-cover" /></span>)}
          </div>
        </Step>
        <Step n="02" title="Make it with your product" text="Start from a proven format and put your own product photo in it. Ready to post in the sizes you need." cta="Make an ad" onClick={onMake}>
          <div className="absolute inset-0 flex items-center justify-center gap-3">
            {pick(1, 10).map((t) => <span key={t.id} className="relative h-28 w-[88px] overflow-hidden rounded-md bg-slate-200 shadow-sm"><TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} lazy className="h-full w-full object-cover" /></span>)}
            <span className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-blue-600 shadow-sm"><Icon.Wand className="h-3.5 w-3.5" /></span>
            <span className="grid h-28 w-[88px] place-items-center rounded-md border-2 border-dashed border-blue-200 bg-blue-50/60 text-center text-[10px] font-semibold leading-tight text-blue-700">Your<br />product</span>
          </div>
        </Step>
        <Step n="03" title="Examine before you spend" text="Score any ad on its hook, offer, proof and call to action, and get the exact fixes before it goes live." cta="Examine an ad" onClick={onExamine}>
          <div className="absolute inset-0 flex items-center gap-4 px-5">
            <svg viewBox="0 0 40 40" className="h-20 w-20 shrink-0 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#E2E8F0" strokeWidth="4" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="#10B981" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset="22" />
            </svg>
            <ul className="flex-1 space-y-1.5 text-[11px]">
              {[["Hook", true], ["Offer", true], ["Proof", false], ["Call to action", true]].map(([l, ok]) => (
                <li key={l} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1">
                  <span className="font-medium text-slate-700">{l}</span>
                  {ok ? <Icon.Check className="h-3 w-3 text-emerald-600" /> : <span className="text-[9px] font-semibold uppercase text-amber-600">Fix</span>}
                </li>
              ))}
            </ul>
          </div>
        </Step>
      </ol>
    </section>
  );
}
