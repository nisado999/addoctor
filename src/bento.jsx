import { createContext, useContext } from "react";
import { TEMPLATES } from "./data";
import { Icon, TemplateImage } from "./ui";
import { TEMPLATE_IMGS } from "./templateImgs.js";
import SpotlightCard from "./components/bits/SpotlightCard.jsx";
import ScrollReveal from "./components/bits/ScrollReveal.jsx";
import Counter from "./components/bits/Counter.jsx";

/* The tools at a glance, under the Explore hero: a bento of real features. Every tile opens the tool it shows, and
   the little pictures in them are drawings of the interface, not numbers we made up. The only figures are counted
   from the gallery itself.
   Each tile is a double bezel: the words sit on the white card, the picture sits in its own inset stone stage. */

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const PHOTOS = TEMPLATES.filter((t) => t.type !== "video" && TEMPLATE_IMGS[t.id]);
const SCAN = PHOTOS.find((t) => t.trending) || PHOTOS[0];
const PACK = PHOTOS.slice(8, 11);
const REEL = PHOTOS.slice(12, 24);
const SAVED = PHOTOS.slice(30, 33);
const NICHES = new Set(TEMPLATES.map((t) => t.category)).size;
const ring = "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

/* Each tile's own colour (from its icon tone), used for a faint wash in its top corner so the cards feel tied to
   what they hold. The tile hands its icon and name down to its heading. */
const HUES = { blue: "43, 89, 255", violet: "124, 92, 255", amber: "245, 158, 11", emerald: "16, 185, 129" };
const TileInfo = createContext(null);

function Tile({ className = "", label, onOpen, accent = false, icon, kicker, tone = "text-blue-600 bg-blue-50 ring-blue-100", children }) {
  const hue = HUES[(tone.match(/text-(\w+)-600/) || [])[1]] || HUES.blue;
  return (
    <SpotlightCard
      theme="light" spotlightColor={accent ? "#ffffff" : "#2b59ff"} intensity={accent ? 0.5 : 0.2} spotlightSize={320} borderGlow={0.9}
      className={`bento-tile group relative flex flex-col overflow-hidden !rounded-[26px] !p-0 ${accent ? "bento-accent" : "bento-soft"} ${className}`}
      style={{ "--hue": hue, ...(accent ? {} : { "--spotlight-card-surface": "transparent" }), "--spotlight-card-shadow": "var(--shadow-soft)", "--spotlight-card-border": accent ? "rgba(255, 255, 255, .2)" : "linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, .5) 30%, rgba(21, 20, 18, .07))" }}
      data-reveal
    >
      <TileInfo.Provider value={{ icon, kicker, tone }}>{children}</TileInfo.Provider>
      {/* The corner chip: an arrow that turns to point out of the tile on hover. */}
      <span aria-hidden="true" className={`bento-go absolute right-4 top-4 z-[1] grid h-9 w-9 place-items-center rounded-full ${accent ? "bg-white/15 text-white ring-1 ring-white/25" : "bg-white text-slate-900 ring-1 ring-slate-900/[.08] shadow-[0_2px_6px_-2px_rgba(21,20,18,.15)]"}`}>
        <Icon.Arrow className="h-4 w-4" />
      </span>
      {/* One real button stretched over the tile. */}
      <button type="button" onClick={onOpen} aria-label={label} className={`absolute inset-0 z-[2] rounded-[26px] ${ring}`} />
    </SpotlightCard>
  );
}

function Head({ title, text }) {
  const { icon: I, kicker, tone } = useContext(TileInfo);
  return (
    <div className="relative pr-12">
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ring-1 ${tone}`}><I className="h-4 w-4" /></span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{kicker}</span>
      </div>
      <h3 className="font-display mt-4 text-[22px] font-extrabold leading-[1.08] tracking-[-0.03em] text-slate-950 sm:text-[24px]">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{text}</p>}
    </div>
  );
}

/* The inset stage the picture sits in: 8px in from the card edge, so the card reads as a frame around it. */
const Stage = ({ className = "", children }) => <div className={`bento-stage relative mx-2 mb-2 mt-5 overflow-hidden rounded-[20px] ${className}`} aria-hidden="true">{children}</div>;

export function Bento({ onExamine, onSpy, onPack, onBrowse, onPalette, onVault }) {
  return (
    <section aria-labelledby="bento-title" className="mt-20 sm:mt-28">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600" data-reveal>Everything in one clinic</p>
        <span id="bento-title" className="sr-only">One place to study, make and check every ad you run.</span>
        <ScrollReveal containerClassName="section-head mt-3" baseOpacity={0.12} blurStrength={6} baseRotation={2} rotationEnd="bottom 60%" wordAnimationEnd="bottom 60%">
          One place to study, make and check every ad you run.
        </ScrollReveal>
      </div>

      <div className="relative mt-10">
      <div className="bento-field pointer-events-none absolute -inset-x-8 -inset-y-10" aria-hidden="true" />
      <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
        {/* Examine: the big tile. A real template being scanned, with the three checks Examine runs. */}
        <Tile className="sm:col-span-2 lg:col-span-3 lg:row-span-2" label="Examine an ad" onOpen={onExamine} icon={Icon.Stethoscope} kicker="Examine">
          <div className="px-6 pt-6 sm:px-8 sm:pt-8">
            <Head title="An X-ray for any ad." text="Drop in a static or a video. Get the hook, offer and call to action checked, with a prescription for every leak." />
          </div>
          <Stage className="flex min-h-[300px] flex-1 items-center justify-center gap-5 px-5 py-8">
            <div className="bento-lines pointer-events-none absolute inset-0" />
            <div className="bento-art relative w-[44%] max-w-[220px] overflow-hidden rounded-2xl card-frame [container-type:size]" style={{ aspectRatio: "4 / 5" }}>
              {SCAN && <TemplateImage src={TEMPLATE_IMGS[SCAN.id]} alt="" title={SCAN.title} className="cr-photo-img" />}
              <span className="scan-sweep absolute inset-x-0 top-0 h-[2px] bg-blue-500 shadow-[0_0_16px_4px_rgba(43,89,255,.55)]" style={{ "--h": "calc(100cqh - 2px)" }} />
              <span className="absolute inset-0 bg-gradient-to-t from-blue-600/15 to-transparent" />
            </div>
            <ul className="relative flex w-[48%] max-w-[230px] flex-col gap-2.5">
              {[["Hook", "Stops the scroll"], ["Offer", "Clear and specific"], ["Call to action", "One next step"]].map(([k, v], i) => (
                <li key={k} className="bento-check flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 shadow-[0_0_0_1px_rgba(21,20,18,.07),0_10px_24px_-14px_rgba(21,20,18,.3)]" style={{ "--x": `${i * 10}px`, "--i": i }}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_4px_10px_-3px_rgba(16,185,129,.6)]"><Icon.Check className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 leading-tight"><b className="block text-[13px] font-semibold text-slate-950">{k}</b><span className="text-[11px] text-slate-500">{v}</span></span>
                </li>
              ))}
            </ul>
          </Stage>
        </Tile>

        {/* Spy: a domain being typed, and the three things the report brings back. */}
        <Tile className="lg:col-span-3" label="Open Competitor Spy" onOpen={onSpy} icon={Icon.Eye} kicker="Competitor Spy" tone="text-violet-600 bg-violet-50 ring-violet-100">
          <div className="px-6 pt-6 sm:px-7 sm:pt-7">
            <Head title="See what they are really running."/>
          </div>
          <Stage className="bento-art p-4 sm:p-5">
            <div className="flex h-11 items-center gap-2.5 rounded-full bg-white px-4 text-sm text-slate-900 shadow-[0_0_0_1px_rgba(21,20,18,.07),0_6px_16px_-10px_rgba(21,20,18,.3)]">
              <Icon.Search className="h-4 w-4 text-slate-400" /> competitor.com<span className="type-caret -ml-1.5 h-4 w-px bg-blue-600" />
              <span className="ml-auto rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white">Spy</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["Main focus", "Top products", "Promotions"].map((k, i) => (
                <div key={k} className="rounded-xl bg-white px-3 py-2.5 shadow-[0_0_0_1px_rgba(21,20,18,.06)]">
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{k}</span>
                  <span className="bar-grow mt-2 block h-1.5 rounded-full bg-gradient-to-r from-blue-600 to-violet-500" style={{ width: `${[86, 64, 48][i]}%`, "--d": `${300 + i * 150}ms` }} />
                </div>
              ))}
            </div>
          </Stage>
        </Tile>

        {/* Social Pack: three real template photos fanned like posts; they spread on hover. */}
        <Tile className="lg:col-span-2" label="Open Social Pack" onOpen={onPack} icon={Icon.Image} kicker="Social Pack" tone="text-amber-600 bg-amber-50 ring-amber-100">
          <div className="px-6 pt-6 sm:px-7 sm:pt-7">
            <Head title="A month of posts."/>
          </div>
          <Stage className="flex h-[150px] items-center justify-center">
            {PACK.map((t, i) => (
              <span key={t.id} className="bento-fan absolute h-[112px] w-[90px] overflow-hidden rounded-xl card-frame" style={{ "--r": `${(i - 1) * 9}deg`, "--x": `${(i - 1) * 62}%`, "--hx": `${(i - 1) * 105}%`, zIndex: i === 1 ? 2 : 1 }}>
                <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
              </span>
            ))}
          </Stage>
        </Tile>

        {/* The command palette shortcut: the one loud tile, in the accent colour. */}
        <Tile className="lg:col-span-1" label="Open the command palette" onOpen={onPalette} accent icon={Icon.Bolt} kicker="Shortcut">
          <div className="relative flex h-full flex-col items-start p-6">
            
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">Shortcut</span>
            <div className="bento-art mt-auto flex items-center gap-1.5 pt-6" aria-hidden="true">
              <kbd className="kbd-3d grid h-12 min-w-12 place-items-center rounded-xl px-2.5 font-sans text-sm font-semibold text-slate-900">{IS_MAC ? "⌘" : "Ctrl"}</kbd>
              <kbd className="kbd-3d grid h-12 w-12 place-items-center rounded-xl font-sans text-base font-semibold text-slate-900">K</kbd>
            </div>
            <p className="font-display mt-4 text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-white">Jump anywhere.</p>
            <p className="mt-1 text-xs leading-relaxed text-white/75">Any page, action or template.</p>
          </div>
        </Tile>

        {/* The gallery: the real count, and a tilted reel of real templates that straightens on hover. */}
        <Tile className="sm:col-span-2 lg:col-span-4" label="Browse the template gallery" onOpen={onBrowse} icon={Icon.Grid} kicker="Gallery">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pt-6 sm:px-7 sm:pt-7">
            <Head title="Proven direct-response formats." />
            <p className="flex items-baseline gap-2 text-slate-950 sm:mr-12">
              <span className="font-display text-[52px] font-extrabold leading-none tracking-[-0.05em] tabular-nums"><Counter value={TEMPLATES.length} fontSize="1em" fade={0.15} duration={1.2} stagger={0.08} /></span>
              <span className="text-xs font-semibold uppercase leading-tight tracking-[0.12em] text-slate-500">templates<br />{NICHES} niches</span>
            </p>
          </div>
          <Stage className="reel-3d h-[190px]">
            <div className="marquee reel-tilt absolute inset-x-[-12%] top-1/2 -translate-y-1/2">
              <div className="marquee-track flex w-max gap-3 px-3 py-3">
                {[...REEL, ...REEL].map((t, i) => (
                  <span key={t.id + "-" + i} className="relative h-[136px] w-[109px] shrink-0 overflow-hidden rounded-xl card-frame">
                    <TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" />
                  </span>
                ))}
              </div>
            </div>
          </Stage>
        </Tile>

        {/* Vault: saved ads stacked like cards in a drawer; the top one lifts on hover. */}
        <Tile className="sm:col-span-2 lg:col-span-2" label="Open the Saved Vault" onOpen={onVault} icon={Icon.Bookmark} kicker="Saved Vault" tone="text-emerald-600 bg-emerald-50 ring-emerald-100">
          <div className="px-6 pt-6 sm:px-7 sm:pt-7">
            <Head title="Keep every prescription."/>
          </div>
          <Stage className="flex h-[190px] items-end justify-center">
            {SAVED.map((t, i) => (
              <span key={t.id} className="bento-stack absolute flex w-[78%] items-center gap-3 rounded-2xl bg-white p-2.5 pr-3.5 shadow-[0_0_0_1px_rgba(21,20,18,.07),0_12px_28px_-16px_rgba(21,20,18,.4)]" style={{ "--i": i, bottom: `${18 + i * 14}px`, zIndex: 3 - i, opacity: 1 - i * 0.22 }}>
                <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg"><TemplateImage src={TEMPLATE_IMGS[t.id]} alt="" title={t.title} compact className="h-full w-full object-cover" /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold text-slate-950">{t.title}</b>
                  <span className="text-[11px] text-slate-500">{t.label}</span>
                </span>
                <Icon.Bookmark className="h-4 w-4 shrink-0 text-emerald-500" fill="currentColor" />
              </span>
            ))}
          </Stage>
        </Tile>
      </div>
      </div>
    </section>
  );
}
