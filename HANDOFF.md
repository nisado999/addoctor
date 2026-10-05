# AdDoctor – handoff to Claude Code

## What this is
React + Vite app (src/, public/templates). Bright healthcare-SaaS look: white, slate, sapphire #2563EB, emerald #10B981. No dark mode, no icon packages (inline SVG only).
Audits ad creatives, analyses competitor ads, generates new creatives. 232 gallery templates (2 of them video).

## State
- src/data.jsx = TEMPLATES (232), src/templateImgs.js maps id -> public/templates/<id>.jpg (232 images, 600x750, 4:5).
- Templates with `isNew: true` show a NEW badge. The 9 added on 2026-10-05 copy formats seen in the Meta Ad Library for Spacegoods, Primal Queen, Norse Organics and Rosabella (callout labels, sticky-note UGC, thermal visual, starter-kit flat lay, handheld offer, reverse hook, process shot).
- 40 more were added later the same day (night-out-edit replaces the removed Night-Out Lookbook). All 49 carry isNew.
- Gallery has quick filters (New, Trending, Favourites), a sort menu, favourites saved in localStorage (addoctor.favs.v1), "/" to focus search and a back-to-top button.
- Video templates: type "video" plus an entry in TEMPLATE_VIDS (templateImgs.js) pointing at public/templates/<id>.mp4 (540x960, no audio, about 0.5 to 1.5 MB). The .jpg with the same id is the first frame and is used as the poster. Cards play them muted on a loop while on screen. Two exist: hidden-bay-drone, summit-bottle-orbit.
- Tailwind is compiled (tailwind.config.js, postcss.config.js), no CDN script.
- The view is kept in the URL hash (#static, #pack, #spy, #vault, #lab).
- Every template image has its headline + caption BAKED INTO the photo (made in Gemini). Creative() renders only the photo when an image exists.
- Installs, runs and builds cleanly (`npm run dev`, `npm run build`). Repo: https://github.com/nisado999/addoctor
- Backend is deployed: Cloudflare Worker https://addoctor-api.nisado9999.workers.dev (api/worker.js; Apify, Anthropic and Gemini keys set in the dashboard; no APP_KEY; ALLOW_ORIGIN is *). The local .env (git-ignored) sets VITE_ADDOCTOR_API to it, and the build needs that file or Competitor Spy and Social Pack are disabled.
- Live claude.ai artifact (single-file build) is separate: https://claude.ai/artifact/6zaErcBJFD19YcHV9Q18K5

## Open tasks
1. Third video: Gemini refused a third on 2026-10-05 (daily limit). Planned: id "alpine-lake-push", Travel, prompt: calm Dolomites lake at dawn, slow push-in along a jetty, 9:16, no text. Generate, compress with ffmpeg (scale 540 wide, crf 27, no audio, faststart), add to TEMPLATE_VIDS.
2. "Place my product in scene" feature (unanswered offer).
3. More templates only if quality is high. Rules: plain products (no prints/logos/lettering), no lookalikes of known brands, no "adroast" text, reject bad images.

## Template image recipe (Gemini image gen, 3:4)
"3:4 vertical advertising photograph. <scene>. Big bold clean sans-serif headline text across the top reading exactly: '<HEAD>'. Smaller caption under it reading exactly: '<caption>'. The <product> has no logos or lettering and is a plain original design. Text perfectly spelled, sharp, at least 10 percent below the top edge. High-end advertising photograph, 85mm lens at f/2, subtle film grain, no logos, no watermarks."
Center-crop to 4:5, resize 600x750, save jpg quality ~84, add to templateImgs.js and TEMPLATES.
Don't automate Gemini heavily: it triggered a Google robot check.
Chrome saves downloads to E:/Save shit here. Gemini shows each result as a same-origin blob image, so it can be cropped to 4:5 and saved as a 600x750 JPEG from the page itself.
Dev only: saving a source file can set off a burst of Vite page reloads, because most modules export constants next to components and import each other in a circle. The build is not affected.
Publish: build, then copy dist/ into a checkout of the gh-pages branch and push. Live at https://nisado999.github.io/addoctor/
