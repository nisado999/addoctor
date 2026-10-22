# Guided Ad Builder (Static Ads + Video base) — design

## Intent
Today "Static Ads" and "Video Generator" in the sidebar both open the template-picker studio. The owner wants them to be
tailor-made instead: the user answers a short interview, and AdDoctor designs an ad from scratch for that person. No
template is picked. Explore Templates stays untouched for people who want a ready-made format.

Why: a template is generic; an interview lets the ad use the user's own brand, product, offer and audience, so it feels
made for them. A longer-term use is that the owner runs AdDoctor's own Meta ads through this same flow.

## Goals
- Static Ads opens a one-question-per-screen interview, then generates ads from the answers.
- First question: "Do you have a product photo or a website?" Three paths:
  - **Upload a photo**: used as the real product in the ad.
  - **Paste a website link**: the site is read for brand name, what they sell, prices, tone and product images; the
    interview then skips what it already knows and asks only the rest.
  - **Neither**: ask everything; the AI invents the visual.
- Answers become a written brief; the brief drives generation. Result is **3 versions** with different angles to pick from.
- Each version can be reviewed, improved, resized, saved to the Vault using the existing result tools.
- Video Generator gets the same interview shell with video-specific questions, saved as a brief, but **no generation**
  (no engine exists). It stays marked "Soon" in the sidebar and shows the brief and "we'll notify you".

## Non-goals
- No video generation engine now.
- No change to Explore Templates, Inspiration, Spy, Vault, billing plans.
- No automation of posting to Meta.

## Anti-goals
- Must not feel like a long form: one question per screen, skippable where possible, progress shown, max ~8 screens.
- Must not look like the old template grid, and must not reuse a template internally under the hood.
- Must not invent offers, prices or claims the user did not give (existing product-swap and review rules apply).
- No tool names or "AI/test" words baked into creatives.

## Constraints
- Reuse existing code: `/pack/store` (read a site), `/pack/brief` (write a brief), `/make/ad` (generate), `/make/review`
  (score), existing credit costs (`COSTS.image`, `COSTS.imagePremium`) and the free-edits/grant behavior.
- Keep the white-sidebar layout and current visual style.
- Frontend is React in `src/`; backend is the Cloudflare Worker `api/worker.js` (owner redeploys it manually).
- Cost: one run = 3 images at the normal image price. Charged per image as today, not up front for the batch.

## Decided by the owner
- Static first; video interview shell only.
- Photo-or-website question first; answers drive which questions come next.
- Tailor-made from scratch, no templates.

## My calls (builder may adjust, owner to check)
- 3 versions per run.
- Question set (static): brand name, what you sell, offer (optional), who it's for, goal (sales/leads/app installs),
  tone/vibe, headline-or-no-text preference, size (feed 1:1, 4:5, story 9:16).
- New component `src/guided.jsx` used by both pages, mounted from `App.jsx` replacing the `static`/`video` studio views.
- A new worker route `/make/plan` turns the answers (+ site data) into 3 distinct ad concepts, then each concept goes
  through `/make/ad`. If `/make/ad` requires a template/base, add a "from scratch" mode there.

## Left to the builder
- Exact copy of questions and their order, animations, and mobile layout.
- How site data is mapped into pre-filled answers.
- Error and empty states (site unreadable, photo too small, out of credits).
- Whether concepts run in parallel or one after another.

## Done looks like
Open Static Ads, answer the interview with a website link, and get three distinct, branded ads that use the real product
images and stated offer, each with working review/improve/save. Video Generator shows its interview and saved brief.
