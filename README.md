# AdDoctor

Diagnostic paid-media tool: audits ad creatives for conversion leaks (stop rate, copy hierarchy, offer friction) and generates direct-response ad copy and visual concepts.

React 18 + Vite + Tailwind CSS (compiled with PostCSS). No backend needed except for Competitor Spy.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/, upload anywhere static
npm run lint       # ESLint: unused imports, hook rules
```

## Project layout

```
src/
  main.jsx          entry
  App.jsx           shell, navigation, vault
  data.jsx          templates, categories, samples
  templateImgs.js   template id -> /public/templates/<id>.jpg
  analysis.js       rule-based diagnostic engine
  ui.jsx            icons, creative renderer, shared components
  shared.js         small helpers used by several screens (copy, API address)
  look.jsx          the "use this template" dialog
  asset.jsx  modal.jsx  studio.jsx  use.jsx  spy.jsx  pack.jsx  lab.jsx   feature screens, each loaded on demand
public/
  templates/        one 600x750 (4:5) JPEG per template
  logo.png  favicon.png
api/
  worker.js         Cloudflare Worker for Competitor Spy (see api/SETUP.md)
```

## Add a template

1. Drop a 4:5 JPEG in `public/templates/<id>.jpg`.
2. Add `"<id>": B + "templates/<id>.jpg"` to `src/templateImgs.js`.
3. Add the entry to `TEMPLATES` in `src/data.jsx`.

## Competitor Spy

Deploy `api/worker.js` (steps in `api/SETUP.md`), then copy `.env.example` to `.env` and set `VITE_ADDOCTOR_API` to the Worker URL.

## Deploy (free)

Cloudflare Pages or Vercel: connect the GitHub repo, build command `npm run build`, output directory `dist`. Set the `VITE_*` variables in the host's settings.

## Next steps

- Add sign-in and per-user limits before exposing Competitor Spy publicly (every analysis costs money).
