import { useState, useEffect, useRef } from "react";
import { TEMPLATES } from "./data";
import { Icon } from "./ui";
import { SPY_API } from "./shared.js";
import { isCancel } from "./api.js";
import { packCall, packZip, packB64, packExt, packSave } from "./pack";

/* ---------------------------- Template Lab ----------------------------- */
/* Owner tool: generates the photographic gallery thumbnails once, with the image model. */

const LAB_STYLE = "Photorealistic premium direct-response ad creative, 4:5 portrait, high-end editorial photography, natural light, real materials and textures, shallow depth of field, no brand logos. Any text is part of the design, spelled exactly as written, sharp and highly legible, with strong contrast.";
const LAB_PROMPTS = {
  "myth-fact": "Top half: pale blush wall with the words 'MYTH' and below it 'More steps = clearer skin' in bold black type with a red strike-through line. Bottom half: a fresh white marble shelf with just two minimalist skincare bottles under soft daylight, with the words 'FACT' and below it 'The right 2 beat any 5' in bold dark green type.",
  "controller-demo": "Macro shot of two hands gripping a matte black game controller, dramatic indigo and violet rim light, dark background. Huge bold white text 'ZERO DRIFT' across the top and a small line 'tested for 400 hours' underneath.",
  "split-proof": "A split-face beauty portrait of the same woman, perfectly divided down the middle: left side tired dull skin with the label 'DAY 1', right side glowing healthy skin with the label 'DAY 28'. Clean light studio background, small bold white labels.",
  "texture-asmr": "Extreme macro of a thick white cream swirl on a glass surface, glossy highlights, soft peach background. Large bold dark text on top: 'STOP scrolling if you have dry skin'.",
  "offer-lookbook": "Fashion editorial: a model in a cozy camel knit sweater and wide trousers in warm autumn light against a sand wall. Large elegant serif text 'THE FALL EDIT' on the left, and a small rounded pill reading 'Free shipping' near the bottom.",
  "tryon-haul": "Mirror selfie in a bright bedroom: a woman holding a phone, a clothing rack with seven pieces behind her, natural window light. Big bold white text with a dark outline: 'I TRIED ON 7 PIECES'.",
  "us-vs-them": "Two pairs of wireless earbuds in cases side by side on a clean grey surface, left one premium and glowing with a green check, right one dull with a red cross. Headline in bold white on dark: 'Half the price. Twice the battery.'",
  "founder-note": "A warm portrait of a friendly founder in a sunlit kitchen holding a small product box, with a handwritten paper note card in front of them. Handwritten style text on the card: 'A note from the founder'. Cozy, honest, documentary feel.",
  "pour-shot": "Cinematic pour shot: dark coffee pouring into a clear glass with ice, morning sunlight streaming across a kitchen counter, steam and droplets frozen mid-air. Bold clean white text: 'Your 7AM just got better'.",
  "clinic-trust": "A bright modern dental clinic reception, a smiling dentist in a white coat beside a friendly patient, soft natural light. Headline in navy: 'Same-week dental checkups', and three short check-marked lines in a white card: 'Book online', 'Gentle care', 'Clear prices'.",
  "mirror-pas": "Close-up of a woman's face in a bathroom mirror applying under-eye concealer with a fingertip, natural window light, visible realistic skin. Bold white text with soft shadow: 'Concealer that creases by noon?'.",
  "routine-stack": "A gym bag open on a bench with a supplement tub, a shaker bottle, a towel and wireless earbuds arranged naturally, moody gym lighting. Bold white text: 'For people who train 4x a week'.",
  "hero-product": "One running shoe floating on a solid vivid blue seamless background, dramatic soft shadow, product photography. Bold white text 'The runner that sold out twice' and a small red pill reading 'BACK IN STOCK'.",
  "night-lookbook": "A model in a leather jacket on a rainy city street at night, glowing pink and blue neon reflections on wet pavement. Large glowing neon sign style text: 'MADE FOR AFTER DARK'.",
  "review-stack": "A smartwatch on a wrist on a clean desk, with three stacked white review cards in front showing five gold stars and short quotes. Bold text at the top: '4.8 stars from verified buyers'.",
  "ugly-marker": "A product photo of a jar on a kitchen counter, annotated with rough hand-drawn yellow highlighter circles and arrows and scribbled handwriting that reads 'Ok so THIS is why it's better'. Raw, imperfect, phone-snapshot look.",
  "price-receipt": "A long paper receipt lying next to a takeaway coffee cup on a wooden table, itemised lines with prices, the total circled in red marker. Bold headline over the top: 'The real cost of your daily coffee'.",
  "tweet-reaction": "A social media post card laid over a blurred photo of a serum bottle: round avatar, name 'Sam', handle '@skincare_sam', text 'did not expect a $30 serum to fix my dry patches. ordering a second one.' Soft light background.",
  "ingredient-dissection": "An exploded flat lay of a supplement bottle at the center with capsules and powders fanning out around it, each with a thin line and a small label: 'Magnesium glycinate', 'Magnesium malate', 'Magnesium taurate', 'Zero fillers'. Deep green background, headline 'What's actually inside'.",
  "stoplight-matrix": "A smartwatch on a dark slate surface, next to a clean comparison card with three columns and rows, using green, yellow and red dots. Headline in white: 'We tested every alternative'.",
  "customer-dm": "A hand holding a phone showing a private message thread over a blurred photo of a wool coat. Messages: 'Wait, where did you get that??' and the reply 'The new wool coat.' Soft purple light.",
  "press-quote": "A clean modern clinic interior with a large elegant press quote card: 'As seen in City Weekly' in small caps and the quote 'The most reliable emergency dentist in the city.' in serif italic.",
  "before-after-split": "A close-up smile split vertically into before (slightly stained teeth) and after (bright natural teeth), clean studio light. Small labels 'Before' and 'After', headline 'Same smile. One visit.'",
  "trend-chart": "A cozy bedside table with a phone showing a rising sleep score line chart, soft night-lamp light. Bold text: '30 days of sleep data'.",
  "review-static": "A bright kitchen counter with a pouch of healthy snack and fresh berries. Five gold stars and large bold text: 'Zero prep time. Hunger fully satisfied.' and below in small type 'Verified buyer'. Warm cream tones.",
  "editorial-headline": "A stylish woman holding up a large open newspaper that covers most of her face, with the front-page headline 'BREAKING: THE LINEN SHIRT IS TAKING OVER!' in huge bold type and a small photo of a linen shirt on the page. Editorial studio light.",
  "text-message-static": "Clean light background, a smartphone-style chat: grey bubble 'I'm so burnt out. Please send help.' and blue bubble 'Try the weighted blanket. My sleep changed in a week.' with a cozy photo of a weighted blanket on a bed underneath.",
  "old-me-new-me": "A split image: left side muted and grey with a person staring into an empty fridge and the label 'OLD ME'; right side bright and warm with a hot meal arriving at the door and the label 'NEW ME'. Bold text on each side.",
  "comment-thread-ad": "A forum comment card in front of a protein shake bottle on a beige wavy background. The question 'Any protein shake that isn't chalky?' and a reply 'Tastes like dessert, keeps me full till lunch.' with small round avatars.",
};

const LAB_DB = "addoctor-lab";
function labDb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(LAB_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("imgs");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function labGetAll() {
  try {
    const db = await labDb();
    return await new Promise((res) => {
      const out = {}; const q = db.transaction("imgs").objectStore("imgs").openCursor();
      q.onsuccess = () => { const c = q.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      q.onerror = () => res({});
    });
  } catch (e) { return {}; }
}
async function labPut(id, v) {
  try { const db = await labDb(); db.transaction("imgs", "readwrite").objectStore("imgs").put(v, id); } catch (e) { /* storage may be unavailable */ }
}

function LabView({ notify }) {
  const [imgs, setImgs] = useState({});
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState({});
  const [quality, setQuality] = useState("standard");
  const [prompts, setPrompts] = useState(() => ({ ...LAB_PROMPTS }));
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  const life = useRef(new AbortController());   // aborted when the screen goes away
  const run = useRef(null);                     // the "Generate missing" run, aborted by Stop

  useEffect(() => { labGetAll().then((o) => setImgs((p) => ({ ...o, ...p }))); }, []);
  useEffect(() => { const l = life.current; return () => { stop.current = true; l.abort(); }; }, []);

  const one = async (t, signal = life.current.signal) => {
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      const r = await packCall("/pack/image", { raw: true, prompt: LAB_STYLE + " " + (prompts[t.id] || t.title), quality, brief: {} }, signal);
      const v = { src: `data:${r.mime};base64,${r.data}`, mime: r.mime, b64: r.data };
      setImgs((p) => ({ ...p, [t.id]: v })); setErrs((e) => ({ ...e, [t.id]: "" })); labPut(t.id, v);
    } catch (e) { setErrs((x) => ({ ...x, [t.id]: isCancel(e) ? "" : e.message || "Failed" })); }
    setBusy((b) => ({ ...b, [t.id]: false }));
  };

  const runMissing = async () => {
    if (!SPY_API) { notify("The Template Lab needs the AdDoctor server. Open the hosted page."); return; }
    const todo = TEMPLATES.filter((t) => !imgs[t.id]);
    if (!todo.length) { notify("Every template already has an image."); return; }
    setRunning(true); stop.current = false; const rc = new AbortController(); run.current = rc; let n = 0;
    const off = () => rc.abort(); life.current.signal.addEventListener("abort", off, { once: true });
    const worker = async () => { while (n < todo.length && !stop.current) { await one(todo[n++], rc.signal); } };
    await Promise.all([worker(), worker()]);
    setRunning(false);
  };

  const done = TEMPLATES.filter((t) => imgs[t.id]).length;
  const zip = () => {
    const files = TEMPLATES.filter((t) => imgs[t.id]).map((t) => ({ name: `${t.id}.${packExt(imgs[t.id].mime)}`, data: packB64(imgs[t.id].b64) }));
    if (!files.length) return;
    packSave(packZip(files), "addoctor-template-images.zip");
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-900">{done} of {TEMPLATES.length} template images ready</p>
          <p className="mt-0.5 text-xs text-slate-500">Owner tool. Generate once, download the ZIP, and send it to Claude to ship in the gallery. Images are kept in this browser until then.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            {[["standard", "Standard"], ["premium", "Premium"]].map(([k, l]) => (
              <button key={k} onClick={() => setQuality(k)} aria-pressed={quality === k} className={`rounded-full px-3 py-1 text-xs font-semibold ${quality === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {running ? (
            <button onClick={() => { stop.current = true; if (run.current) run.current.abort(); }} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Stop</button>
          ) : (
            <button id="lab-run" onClick={runMissing} className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700">Generate missing ({TEMPLATES.length - done})</button>
          )}
          <button id="lab-zip" onClick={zip} disabled={!done} className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"><Icon.Download className="h-3.5 w-3.5" />Download ZIP</button>
        </div>
      </div>
      <div id="lab-grid" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((t) => (
          <article key={t.id} className="flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            <div className="relative bg-slate-100" style={{ aspectRatio: "4 / 5" }}>
              {imgs[t.id] ? <img src={imgs[t.id].src} alt={t.title} className="h-full w-full object-cover" /> : (
                <div className="grid h-full w-full place-items-center p-4 text-center text-xs text-slate-500">
                  {busy[t.id] ? <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /> : errs[t.id] ? <span className="text-rose-600">{errs[t.id]}</span> : "Not generated yet"}
                </div>
              )}
              {busy[t.id] && imgs[t.id] && <div className="absolute inset-0 grid place-items-center bg-white/70"><div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-blue-600">Edit prompt</summary>
                <textarea value={prompts[t.id] || ""} onChange={(e) => setPrompts((p) => ({ ...p, [t.id]: e.target.value }))} rows={5} className="mt-2 w-full resize-none rounded-lg border border-slate-200 p-2 text-xs text-slate-700 outline-none focus:border-blue-500" />
              </details>
              <button disabled={!!busy[t.id]} onClick={() => one(t)} className="mt-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{imgs[t.id] ? "Redo" : "Generate"}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export { LAB_STYLE, LAB_PROMPTS, LAB_DB, labDb, labGetAll, labPut, LabView };
