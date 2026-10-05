# AdDoctor – handoff to Claude Code

## What this is
React + Vite app (src/, public/templates). Bright healthcare-SaaS look: white, slate, sapphire #2563EB, emerald #10B981. No dark mode, no icon packages (inline SVG only).
Audits ad creatives, analyses competitor ads, generates new creatives. 181 gallery templates.

## State
- src/data.jsx = TEMPLATES (181), src/templateImgs.js maps id -> public/templates/<id>.jpg (181 images, 600x750, 4:5).
- Every template image has its headline + caption BAKED INTO the photo (made in Gemini). Creative() renders only the photo when an image exists.
- Source was synced but NEVER built with Vite (npm was blocked in the cloud). First job: `npm install && npm run dev`, then `npm run build`, fix any errors.
- Live claude.ai artifact (single-file build) is separate: https://claude.ai/artifact/6zaErcBJFD19YcHV9Q18K5

## Open tasks
1. npm install, run dev, build; fix errors.
2. Create GitHub repo, push (user creates repo or gives a name).
3. Deploy to Netlify (site: brilliant-sawine-3992de); user decides visibility.
4. 3 Gemini videos (plan allows 3/day) for templates; suggested: greek bay sailing, steel bottle summit, Dolomites lake. Text-to-video prompts, no baked text, 9:16.
5. "Place my product in scene" feature (unanswered offer).
6. Replace the removed Night-Out Lookbook template.
7. More templates only if quality is high. Rules: plain products (no prints/logos/lettering), no lookalikes of known brands, no "adroast" text, reject bad images.

## Template image recipe (Gemini image gen, 3:4)
"3:4 vertical advertising photograph. <scene>. Big bold clean sans-serif headline text across the top reading exactly: '<HEAD>'. Smaller caption under it reading exactly: '<caption>'. The <product> has no logos or lettering and is a plain original design. Text perfectly spelled, sharp, at least 10 percent below the top edge. High-end advertising photograph, 85mm lens at f/2, subtle film grain, no logos, no watermarks."
Center-crop to 4:5, resize 600x750, save jpg quality ~84, add to templateImgs.js and TEMPLATES.
Don't automate Gemini heavily: it triggered a Google robot check.
