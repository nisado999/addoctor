# Guided Ad Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Static Ads and Video Generator open a guided interview that produces tailor-made ads from scratch, with no template.

**Architecture:** A new lazy-loaded `src/guided.jsx` (`GuidedView`) runs the interview and results. The worker gains `/make/plan` (answers + site data -> 3 concepts) and a `mode: "scratch"` branch in `makeAd` (concept text + optional product photos -> image). Site reading reuses `/pack/store`.

**Tech Stack:** React 18, Tailwind, Cloudflare Worker (`api/worker.js`), Claude (`askClaude`), Gemini (`geminiImage`). No test runner exists: verification is `npm run lint`, `npm run build`, `node --check api/worker.js`, and a browser run with a mocked API.

**Spec:** `docs/superpowers/specs/2026-10-22-guided-ad-builder-design.md`

## Global Constraints
- 3 versions per run; image price per image delivered (`imageCost`), charged client-side via `onSpend` when billing is off, server-side via `creditCost("/make/ad")` when on.
- Keep white sidebar layout and current look. No tool names or "AI/test" words in generated creatives.
- Never invent offers, prices or claims the user did not give.
- Video: interview + saved brief only, no generation; sidebar keeps "Soon" badge.
- Explore Templates untouched.

## Review Focus
- Website unreadable -> show message, interview continues manually.
- Photo upload over size limit / wrong type -> clear message.
- Out of credits mid-batch -> remaining versions show "Not generated" with Retry; delivered ones kept.
- User leaves the page mid-run -> requests aborted, nothing keeps spending.
- No offer given -> ad must contain no offer text.

---

### Task 1: Worker — `/make/plan` and scratch generation
**Files:** Modify `api/worker.js` (new `planScratch`, `makeAd` scratch branch, route in the `/make/` block, `creditCost`).
**Interfaces:**
- Produces `POST /make/plan` body `{ answers: {brand, sells, offer, audience, goal, tone, wording, language}, site?: {name, description}, photos: boolean }` -> `{ concepts: [{title, angle, headline, sub, scene}] }` (exactly 3).
- Produces `POST /make/ad` with `mode: "scratch"`, `{ concept, answers, refs?: string[], ratio, quality }` -> `{mime, data, model}`.
- [ ] Add `async function planScratch(env, b) -> {concepts}`: Claude returns 3 distinct concepts (different angle each), using only given facts; offer text only if `answers.offer` is non-empty.
- [ ] Add route `/make/plan` (cost 2 in `creditCost`, matching `/pack/brief`).
- [ ] In `makeAd`, before the `b.template` check: if `b.mode === "scratch"`, build the prompt from `concept` + `answers`; with refs add `PRODUCT_TRUTH`; reuse `NATIVE_TEXT` for the headline; call `geminiImage`.
- [ ] Run `node --check api/worker.js` -> no output. Commit.

### Task 2: Interview component
**Files:** Create `src/guided.jsx` exporting `GuidedView({ kind, notify, credits, onSpend, active })`.
**Interfaces:** consumes `/pack/store`, `/make/plan`, `/make/ad`, `/make/review` via `apiFetch`; `imageCost`.
- [ ] Phase `source`: three cards (Upload photo / Paste website / Neither). Website path calls `/pack/store`, pre-fills brand and sells, offers the returned images to pick (max 3).
- [ ] Phase `questions`: one question per screen with progress, Back/Next/Skip; consts `STATIC_QUESTIONS` / `VIDEO_QUESTIONS`; skip questions already answered from the site.
- [ ] Phase `making`: plan, then render 3 images (2 concurrent), `onSpend` per image delivered, abort on unmount.
- [ ] Phase `done`: 3 cards with download, review score, "Make another set", Retry on failures. For `kind === "video"`: stop after questions, show the brief and a "coming soon" note; brief kept in `localStorage` (try/catch).
- [ ] `npm run lint` -> clean. Commit.

### Task 3: Wire pages
**Files:** Modify `src/App.jsx` (lazy import near line 36, `KEEP` line 144, `screen()` line 725, `VIEWS`, remove the template grid for `static`, `goto` no longer blocks `video`).
- [ ] `static` -> `GuidedView kind="static"`; `video` -> `GuidedView kind="video"`; sidebar "Soon" badge kept.
- [ ] `npm run build` -> succeeds. Commit.

### Task 4: Verify in browser
- [ ] Dev server, mock `fetch` to the API, click through photo, website and neither paths at desktop and 375px; no console errors; screenshot.
- [ ] Tell the owner the worker must be redeployed manually.
