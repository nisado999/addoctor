# AdDoctor – handoff to Claude Code

## What this is
React + Vite app (src/, public/templates). Bright healthcare-SaaS look: white, slate, sapphire #2563EB, emerald #10B981. No dark mode, no icon packages (inline SVG only).
Audits ad creatives, analyses competitor ads, generates new creatives. 263 gallery templates (32 of them video).

## State
- src/data.jsx = TEMPLATES (263), src/templateImgs.js maps id -> public/templates/<id>.jpg (263 images, 600x750, 4:5).
- Templates with `isNew: true` show a NEW badge. The 9 added on 2026-10-05 copy formats seen in the Meta Ad Library for Spacegoods, Primal Queen, Norse Organics and Rosabella (callout labels, sticky-note UGC, thermal visual, starter-kit flat lay, handheld offer, reverse hook, process shot).
- 40 more were added later the same day (night-out-edit replaces the removed Night-Out Lookbook). All 49 carry isNew.
- Gallery has quick filters (New, Trending, Favourites), a sort menu, favourites saved in localStorage (addoctor.favs.v1), "/" to focus search and a back-to-top button.
- Video templates: type "video" plus an entry in TEMPLATE_VIDS (templateImgs.js) pointing at public/templates/<id>.mp4 (540x960, no audio, about 0.5 to 1.5 MB). The .jpg with the same id is the first frame and is used as the poster. Cards play them muted on a loop while on screen. A card is 4:5, so it shows only 70% of a 9:16 clip: set focus: "50% 0%" on templates with a standing person so the head is kept, and leave about 10% empty space above the head in the clip itself. 32 exist (see TEMPLATE_VIDS). Clicking any template in Explore opens LookModal (src/look.jsx, "Use this template"): the image or clip, desc, tags, reference frames for videos (TEMPLATE_REFS, public/templates/refs/<id>-1..4.jpg, 450x800), and two options from src/use.jsx. "Add my logo" (BrandModal) composites an uploaded logo in the browser and downloads a PNG, or re-records the clip with MediaRecorder as MP4/WebM. "Make a new one inspired by it" opens the Static studio for image templates and, for videos, InspireModal, a DEMO of the finished generator flow (form, 5 credits, progress, result, caption, download). No video engine is connected: the "result" is the reference clip with the user logo, and the dialog says so. To make it real, add a video-generation endpoint to api/worker.js and call it where the stage switches to "working".
- Tailwind is compiled (tailwind.config.js, postcss.config.js), no CDN script.
- The view is kept in the URL hash (#static, #pack, #spy, #vault, #lab).
- Every template image has its headline + caption BAKED INTO the photo (made in Gemini). Creative() renders only the photo when an image exists.
- Installs, runs and builds cleanly (`npm run dev`, `npm run build`). Repo: https://github.com/nisado999/addoctor
- Backend is deployed: Cloudflare Worker https://addoctor-api.nisado9999.workers.dev (api/worker.js; Apify, Anthropic and Gemini keys set in the dashboard; no APP_KEY; ALLOW_ORIGIN is *). The local .env (git-ignored) sets VITE_ADDOCTOR_API to it, and the build needs that file or Competitor Spy and Social Pack are disabled.
- Live claude.ai artifact (single-file build) is separate: https://claude.ai/artifact/6zaErcBJFD19YcHV9Q18K5

## Where things stand (written 2026-10-06, read this first)
1. PUBLISH PENDING. The gh-pages branch already holds the newest build (script assets/index-9f2TeQCM.js): the Christian template is now "faith-blue-hour" (blue-hour clip the user picked as the best) and "faith-night-campaign" is removed. GitHub Pages failed to build it twice during a GitHub Actions/Pages incident on 2026-10-05, so the live site still serves assets/index-Yo2K9lep.js with the night clip. To finish: check githubstatus.com, then push an empty commit to gh-pages to re-trigger the build, and confirm the live index.html points at index-9f2TeQCM.js (or a newer build).
2. BACKEND NOT REDEPLOYED. api/worker.js in the repo is ahead of what runs on Cloudflare. It adds: the free Meta Ad Library path (needs a META_TOKEN secret), reading the top creatives for Claude, and abuse limits (ALLOW_ORIGIN allow-list, RATE_PER_HOUR, DAILY_CAP, MAX_ADS default 200). The user has to paste it into Cloudflare (addoctor-api > Edit code > Deploy) and set ALLOW_ORIGIN to https://nisado999.github.io. Claude cannot reach the Cloudflare dashboard (bot check). All of this was tested against mocks only.
3. Competitor Spy does not work right now: the Apify account hit its monthly hard limit. The Meta route is blocked on the user's Meta identity check (facebook.com/ID), which kept erroring for them.
4. Google Flow credits are used up (10 left, refill monthly). Not made: a home-gym equipment clip (failed three times on Google's side). The Gemini app allows 2 to 3 videos a day as a fallback.
5. Publishing: clone the gh-pages branch somewhere temporary, replace its contents with dist/ plus an empty .nojekyll, commit, push. GitHub allows a limited number of Pages builds per hour, so batch changes instead of publishing each one.
6. ffmpeg is not installed on this PC. Install a throwaway copy with "npm install ffmpeg-static" in a temp folder when video work is needed. Original (uncompressed) clips were kept only in a session temp folder and are gone; the published 540x960 files are the masters now.

## What the user wants from templates (learned the hard way on 2026-10-05)
- Videos must look like real footage. Simple, calm motion: a model holding one pose with the camera moving, or a product with moving light. Walking at the camera, hand gestures and anything with fingers get rejected as "awkward" or "obviously AI".
- No yellow or orange glow in lighting. Natural or cool light.
- The whole product must be in frame (a cropped shoe and cropped sunglasses were both rejected).
- No text on an image unless asked. Products and clothing stay blank so a brand can be added; a bottle or pack should face the camera with a clear front.
- When the user sends a reference ad, follow its composition closely with an unbranded original product. Two looser interpretations were called "trash" before the close one was accepted.
- Check every clip one frame per second before publishing, and say plainly what is imperfect.

## Open tasks
1. "Place my product in scene" feature (unanswered offer).
2. Connect a real video generator to InspireModal (it is a demo today).
3. More templates only if quality is high. Rules: plain products (no prints/logos/lettering), no lookalikes of known brands, no "adroast" text, reject bad images.

## Template image recipe (Gemini image gen, 3:4)
"3:4 vertical advertising photograph. <scene>. Big bold clean sans-serif headline text across the top reading exactly: '<HEAD>'. Smaller caption under it reading exactly: '<caption>'. The <product> has no logos or lettering and is a plain original design. Text perfectly spelled, sharp, at least 10 percent below the top edge. High-end advertising photograph, 85mm lens at f/2, subtle film grain, no logos, no watermarks."
Center-crop to 4:5, resize 600x750, save jpg quality ~84, add to templateImgs.js and TEMPLATES.
Don't automate Gemini heavily: it triggered a Google robot check.
Chrome saves downloads to E:/Save shit here. Gemini shows each result as a same-origin blob image, so it can be cropped to 4:5 and saved as a 600x750 JPEG from the page itself.
Dev only: saving a source file can set off a burst of Vite page reloads, because most modules export constants next to components and import each other in a circle. The build is not affected.
Publish: build, then copy dist/ into a checkout of the gh-pages branch and push. Live at https://nisado999.github.io/addoctor/
More videos: Google Flow (flow.google.com, same Google account) is set to 9:16, Veo 3.1 Fast, confirm before generating. A clip costs 20 credits; The monthly credits were used up on 2026-10-05 (10 left); they refill monthly. Download at 720p from the card menu. The Gemini app itself allows only 2 to 3 videos a day.
When a video or image is replaced, give it a new file name (new id). GitHub Pages and browsers cache the old file under the same name, so visitors keep seeing the old clip.
