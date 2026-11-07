# Connect Meta and Launch Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in AdDoctor user connects their Facebook account once, picks an ad account, Page, Instagram account and Pixel, adds ad pictures, and AdDoctor creates the campaign on Meta (paused) from the answers of the "Run it on Meta" wizard; one more explicit confirm turns it on.

**Architecture:** The Cloudflare Worker (`api/worker.js`) does all Meta work, so no Meta token ever reaches the browser. It runs Facebook Login (OAuth code flow), stores the user's long-lived token encrypted in a new Supabase table (service role only, same pattern as `supabase/billing.sql`), and calls Meta's Marketing API to upload images and create campaign, ad set, creatives and ads, always `PAUSED` first. The React side adds a Connect step and a Launch panel to the existing `src/meta.jsx` wizard result.

**Tech Stack:** Cloudflare Worker (single pasted file, no imports), Supabase (auth + Postgres via REST/RPC with service role), Meta Graph/Marketing API, React + Tailwind in `src/`, `node --test` for new tests (no new dependency).

**Spec:** Inline in this plan (Goal, Scope and Global Constraints). Product decision recorded in the conversation of 2026-11-05: connect Meta and launch the ad automatically after the user connects; paused first, one explicit confirm before spend.

## Scope

- In: Sales, Traffic, Awareness and Leads (as a website Lead event) objectives; one campaign, 1 to 3 ad sets, up to 10 ads per ad set, image ads only; country targeting; Advantage+ placements; paused create then explicit activate; disconnect; Meta data-deletion callback.
- Out (follow-ups): video ads, Instant Forms, custom audiences, editing or reading performance of launched ads, special-ad-category advertisers (housing, credit, employment, politics: refused with a message), multiple ad accounts per user at once, charging credits for launches.

## Global Constraints

- The Worker is deployed by pasting `api/worker.js` into the Cloudflare dashboard (`api/SETUP.md`): **all Worker code stays in that one file, no imports, no new npm packages.**
- No Meta token, app secret or key ever appears in client code, logs, or an API response. Log only the Meta error `code`, `error_subcode` and `fbtrace_id`.
- Every campaign, ad set and ad is created with `status: "PAUSED"`. Nothing spends money until `/meta/activate` is called by a signed-in click.
- Every `/meta/*` route except `/meta/callback` and `/meta/data-deletion` requires the existing `supaUser(env, Authorization)` sign-in and answers `401` with `code: "signin_required"` otherwise.
- Graph API version comes from `env.META_GRAPH_VERSION` (set in Task 0 to the newest version in Meta's changelog). Never hard-code a version in a URL.
- Copy follows the app's rules: plain words, no dashes as separators, no tool names (ChatGPT, AI, test) in anything shown to users or baked into ads.
- Style: Tailwind classes already used in `src/meta.jsx`; one blue accent; works in light and dark mode; 375px wide without horizontal scroll.

## Review Focus

- Meta answers error code 190 (token expired or revoked) in the middle of a launch: user sees "Reconnect Meta", nothing half-created is left behind.
- Zero-decimal currencies (JPY, KRW and others): a daily budget of 50 must not be sent as 5000 minor units.
- A launch fails after the campaign exists (ad set or ad rejected): created objects are deleted, user sees Meta's reason in plain words.
- Double click or retry on "Create campaign" creates one campaign, not two.
- Activating a campaign id that is not in the user's own launch record is refused.
- Callback with a tampered, replayed or expired `state` creates no connection.
- The user has a Page but no Instagram account, or no Pixel: launch still works (Instagram optional; Pixel required only for Sales and Leads, with a clear message).
- The ad account has no payment method or is disabled: Meta's reason is shown with a link to Billing in Ads Manager.

---

## File Structure

- Modify `api/worker.js`: Meta helpers (pure), token store, routes under `/meta/*`, one named export `metaTest` for tests.
- Create `tools/meta.test.mjs`: unit tests for the pure helpers and the launch orchestration with a stub `fetch`.
- Modify `package.json`: add `"test": "node --test tools/"`.
- Create `supabase/meta.sql`: `meta_connections` and `meta_launches`.
- Create `src/metaApi.js`: thin client for `/meta/*` using `apiFetch`.
- Create `src/metaConnect.jsx`: Connect card, asset pickers.
- Create `src/metaLaunch.jsx`: ad pictures, texts, review, create, turn on.
- Modify `src/meta.jsx`: country becomes an ISO code, hosts the Connect and Launch panels under the answer card.
- Modify `public/privacy.html`, `public/terms/index.html`: Meta data use and deletion.
- Create `docs/META-APP-SETUP.md`: your checklist (Task 0 and Task 9) and Worker secrets.

---

### Task 0: Meta app setup (you, no code)

**Files:** Create `docs/META-APP-SETUP.md` with the checklist below, filled in as you go.

**Interfaces:** Produces the values the Worker needs: `META_APP_ID`, `META_APP_SECRET`, the redirect URI `https://<worker-host>/meta/callback`, and `META_GRAPH_VERSION`.

- [ ] **Step 1:** Create a developer account at developers.facebook.com and a new app; choose the use case for running ads with the Marketing API. Add the product "Facebook Login" (or "Facebook Login for Business", whichever Meta currently offers for this use case).
- [ ] **Step 2:** Start Business Verification for your business in Meta Business Settings (slow, do it first). Add your Instagram-linked Page and an ad account with a payment method to your Business portfolio; this is your test account.
- [ ] **Step 3:** In app settings add: valid OAuth redirect URI (the Worker callback), privacy policy URL, terms URL, app icon, and the data deletion callback URL (`https://<worker-host>/meta/data-deletion`, built in Task 3).
- [ ] **Step 4:** Read Meta's current docs and write into `docs/META-APP-SETUP.md`: the newest Graph version, the exact permission names for this flow (expected: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, plus the Instagram permission Meta requires for placing ads from a linked account), the current objective names, and the list of zero-decimal currencies. Later tasks use these names; fix them here if they differ from this plan.
- [ ] **Step 5:** Keep the app in Development mode. While in Development mode only you and added testers can connect, which is enough to finish Tasks 1 to 8.

### Task 1: Test runner and pure Meta helpers

**Files:**
- Modify: `package.json` (add script `"test": "node --test tools/"`)
- Modify: `api/worker.js` (new section "Meta" before the route handler, named export at the end of the file)
- Create: `tools/meta.test.mjs`

**Interfaces:**
- Produces, all inside one exported object `metaTest` in `api/worker.js`:
  - `signState(secret: string, uid: string, nowMs?: number): Promise<string>` and `verifyState(secret: string, state: string, nowMs?: number): Promise<string | null>` returning the user id, valid for 10 minutes.
  - `encryptToken(keyB64: string, plain: string): Promise<string>` and `decryptToken(keyB64: string, blob: string): Promise<string>` (AES-GCM, random IV, `iv.cipher` in base64url).
  - `toMinorUnits(amount: number, currency: string): number`.
  - `OBJECTIVE: Record<"sales"|"leads"|"traffic"|"aware", { objective: string, optimization: string, promotedEvent?: string }>`, `CTA: Record<goal, string>`.
  - `buildCampaign(plan, name): object`, `buildAdSet(plan, ctx): object`, `buildCreative(plan, ctx, ad, imageHash): object` where `plan = { goal, budget, adsets, ads, country (ISO-2), site, name }` and `ctx = { adAccountId, pageId, instagramId?, pixelId?, currency, campaignId }`.
  - `parseSignedRequest(secret: string, signedRequest: string): Promise<{ user_id: string } | null>`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests** in `tools/meta.test.mjs` using `node:test` and `node:assert/strict`, importing `{ metaTest }` from `../api/worker.js`:
  - `state round trip`: `verifyState(k, await signState(k, "u1"))` returns `"u1"`.
  - `state rejects tamper and expiry`: flipping one character returns `null`; `verifyState(k, s, now + 11 * 60_000)` returns `null`.
  - `token encryption round trip and no plaintext`: `decryptToken(key, await encryptToken(key, "EAAB123"))` equals `"EAAB123"` and the blob does not contain `"EAAB123"`.
  - `minor units`: `toMinorUnits(50, "EUR") === 5000`, `toMinorUnits(50, "JPY") === 50`, `toMinorUnits(12.34, "USD") === 1234`.
  - `campaign is paused with the right objective`: for goal `"sales"`, `buildCampaign(plan, "x")` has `status: "PAUSED"`, `objective: "OUTCOME_SALES"`, `special_ad_categories: []`.
  - `ad set splits budget and targets the country`: with `budget: 300, adsets: 3, currency: "EUR"`, each ad set has `daily_budget: 10000`, `targeting.geo_locations.countries` equal `["GR"]`, `status: "PAUSED"`, and a Sales ad set has `promoted_object.pixel_id` and `custom_event_type: "PURCHASE"`.
  - `creative carries link and button`: `buildCreative(...)` has `object_story_spec.page_id`, `link_data.link` equal to the site with `utm_source=meta`, `call_to_action.type: "SHOP_NOW"`, and no `instagram_user_id` key when `instagramId` is absent.
  - `signed request`: a request signed with the secret returns the `user_id`; a bad signature returns `null`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL, `metaTest` is undefined.
- [ ] **Step 3: Implement the helpers** in `api/worker.js` per the signatures above. Use WebCrypto only (`crypto.subtle`: HMAC-SHA256 for state and signed requests, AES-GCM for tokens, 32-byte key from base64). `toMinorUnits` uses the zero-decimal currency list recorded in Task 0. Objective names come from `docs/META-APP-SETUP.md`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(meta): pure helpers and test runner`.

### Task 2: Supabase tables and token store

**Files:**
- Create: `supabase/meta.sql`
- Modify: `api/worker.js` (store helpers, uses existing `supaBase` and the service-role fetch pattern of `dbRpc`)
- Modify: `tools/meta.test.mjs`

**Interfaces:**
- Consumes: `encryptToken`, `decryptToken` from Task 1.
- Produces: `saveConnection(env, uid, c: { fbUserId, token, expiresAt }): Promise<void>`, `loadConnection(env, uid): Promise<{ fbUserId, token, expiresAt, adAccountId, pageId, instagramId, pixelId, currency } | null>` (token decrypted), `saveSelection(env, uid, sel): Promise<void>`, `deleteConnection(env, uid): Promise<void>`, `findUserByFb(env, fbUserId): Promise<string | null>`.

- [ ] **Step 1: Write `supabase/meta.sql`:** table `meta_connections(user_id uuid primary key references auth.users on delete cascade, fb_user_id text not null, token_enc text not null, token_expires_at timestamptz, ad_account_id text, page_id text, instagram_id text, pixel_id text, currency text, updated_at timestamptz not null default now())` with an index on `fb_user_id`; table `meta_launches(request_id text primary key, user_id uuid not null references auth.users on delete cascade, campaign_id text, status text not null default 'created', created_at timestamptz not null default now())`. Enable row level security on both with **no policies**, so only the Worker's service role can read them.
- [ ] **Step 2: Write failing tests** with a stub `fetch` recording requests: `saveConnection` sends the encrypted blob and never the plain token; `loadConnection` returns the decrypted token; `loadConnection` returns `null` on an empty result.
- [ ] **Step 3: Run** `npm test`. Expected: FAIL.
- [ ] **Step 4: Implement the store helpers** over Supabase REST (`/rest/v1/meta_connections`, `Prefer: resolution=merge-duplicates` for upsert), same headers as `dbRpc`, and extend `metaTest` with them (each takes `fetchImpl` as a last optional parameter for tests).
- [ ] **Step 5: Run** `npm test`. Expected: pass.
- [ ] **Step 6:** Run `supabase/meta.sql` in the Supabase SQL editor (you) and confirm both tables exist.
- [ ] **Step 7: Commit** `feat(meta): connection store`.

### Task 3: Connect, status, disconnect, data deletion routes

**Files:**
- Modify: `api/worker.js` (`metaRoute(env, req, u)` wired into the existing dispatcher next to `billingRoute`; `/meta/callback` and `/meta/data-deletion` are reachable without `Authorization`)
- Modify: `tools/meta.test.mjs`

**Interfaces:**
- Consumes: Task 1 and 2 helpers; env `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_KEY`, `META_GRAPH_VERSION`, `META_REDIRECT_URI`, `SITE_URL`.
- Produces routes:
  - `POST /meta/connect/start` returns `{ url: string }`, the Facebook dialog URL with `state` and the scopes from `docs/META-APP-SETUP.md`.
  - `GET /meta/callback?code&state` verifies `state`, exchanges the code, exchanges for the long-lived token, saves the connection, answers `302` to `${SITE_URL}/#meta`; on any failure answers `302` to `${SITE_URL}/#meta?meta_error=<short_code>`.
  - `GET /meta/status` returns `{ connected: boolean, expiresAt: string | null, selection: { adAccountId, pageId, instagramId, pixelId, currency } | null }`.
  - `POST /meta/disconnect` revokes with `DELETE /me/permissions`, deletes the row, returns `{ ok: true }`.
  - `POST /meta/data-deletion` (Meta signed request) deletes the row for that `user_id` and returns `{ url: `${SITE_URL}/#meta`, confirmation_code: string }`.

- [ ] **Step 1: Write failing tests** with a stub `fetch`: `callback rejects a bad state and saves nothing`; `callback saves an encrypted connection and redirects to #meta`; `callback maps access_denied to meta_error=denied` (user pressed Cancel); `status is not connected without a row`; `data-deletion removes the row and returns a confirmation_code`; `routes answer 401 signin_required without Authorization` (except callback and data-deletion).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement the routes.** The callback is a browser redirect with no `Authorization`, so the user id comes only from the verified `state`.
- [ ] **Step 4: Run** `npm test`. Expected: pass.
- [ ] **Step 5:** Paste the Worker, add secrets `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_KEY` (32 random bytes, base64), `META_GRAPH_VERSION`, `META_REDIRECT_URI`, `SITE_URL`. Call `/caps` and confirm the Worker still answers (this proves Cloudflare accepts the named export; if it rejects it, move the export behind a test-only wrapper file that imports the helpers).
- [ ] **Step 6: Commit** `feat(meta): facebook connect routes`.

### Task 4: List assets and save the selection

**Files:** Modify `api/worker.js`, `tools/meta.test.mjs`.

**Interfaces:**
- Consumes: `loadConnection`, `saveSelection`, and a `metaCall(env, token, method, path, params, fetchImpl?)` helper added here that returns parsed JSON or throws `MetaError { code, subcode, userMessage, retriable }`.
- Produces:
  - `GET /meta/assets` returns `{ adAccounts: [{ id, name, currency, status }], pages: [{ id, name, instagram: { id, username } | null }], pixels: { [adAccountId]: [{ id, name }] } }`.
  - `POST /meta/select` body `{ adAccountId, pageId, instagramId?, pixelId? }`; validates every id appears in the user's own `/meta/assets` answer, stores them plus the ad account currency, returns `{ ok: true }`.

- [ ] **Step 1: Write failing tests:** `assets lists only active ad accounts`; `select refuses an ad account the user does not own`; `select stores currency from the chosen account`; `metaCall maps code 190 to a reconnect error`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `MetaError.userMessage` is plain English for the codes in the Review Focus (190, no payment method, disabled account), generic otherwise.
- [ ] **Step 4: Run** `npm test`. Expected: pass.
- [ ] **Step 5: Commit** `feat(meta): list and select assets`.

### Task 5: Launch (paused) and activate

**Files:** Modify `api/worker.js`, `tools/meta.test.mjs`.

**Interfaces:**
- Consumes: `buildCampaign`, `buildAdSet`, `buildCreative`, `metaCall`, `loadConnection`, `meta_launches`.
- Produces:
  - `POST /meta/launch` as `multipart/form-data`: field `plan` (JSON `{ goal, budget, adsets, ads, country, site, name, requestId, specialCategory: boolean }`), field `texts` (JSON array of `{ primary, headline, description }`, one per image), and files `image0..imageN` (PNG or JPEG, at most 8 MB each, at most 30 images). Returns `{ campaignId, adsetIds: string[], adIds: string[], managerUrl: string, status: "PAUSED" }`.
  - `POST /meta/activate` body `{ requestId }`; looks up the launch row for this user, sets campaign, ad sets and ads to `ACTIVE`, returns `{ ok: true }`.
  - `launchPaused(env, conn, input, fetchImpl?)` and `activate(env, conn, launch, fetchImpl?)` exported through `metaTest`.

- [ ] **Step 1: Write failing tests** with a stub `fetch` that records Meta calls in order:
  - `launch creates in order: images, campaign, ad sets, creatives, ads, all PAUSED`.
  - `launch refuses special ad categories` (`specialCategory: true` returns 422 and makes no Meta call).
  - `launch requires a pixel for sales and leads` (422, plain message).
  - `launch is idempotent per requestId`: a second call with the same `requestId` returns the first result and makes no Meta call.
  - `launch rolls back on failure`: stub fails the second ad set; the test sees `DELETE` of the campaign, and the error carries Meta's message.
  - `launch maps 190 to reconnect`.
  - `activate refuses a requestId that belongs to another user` and `activate flips every object to ACTIVE`.
  - `launch rejects an image over 8 MB or not PNG/JPEG` before any Meta call.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Distribute images over ad sets round-robin so each ad set has at most `plan.ads` ads; upload each image once to `/act_{id}/adimages` and reuse the hash for every ad set. Insert the `meta_launches` row before the first Meta call (`status: "creating"`) so a retry sees it; set `"created"` at the end.
- [ ] **Step 4: Run** `npm test`. Expected: pass.
- [ ] **Step 5: Real check (you, with your own ad account):** call `/meta/launch` with 2 small images, confirm in Ads Manager a paused campaign appears with the expected ad set and ads, then delete it there.
- [ ] **Step 6: Commit** `feat(meta): launch paused and activate`.

### Task 6: Connect card in the app

**Files:**
- Create: `src/metaApi.js` (functions `metaStatus()`, `metaConnectStart()`, `metaAssets()`, `metaSelect(sel)`, `metaDisconnect()`, each `apiFetch` to the route in Tasks 3 and 4)
- Create: `src/metaConnect.jsx` (`export function MetaConnect({ notify, goal, onReady })`; `onReady(selection)` fires when connected and selected)
- Modify: `src/meta.jsx` (renders `MetaConnect` under the answer card, headed "Run it for me")

**Interfaces:**
- Consumes: `/meta/*` routes, existing sign-in state (signed-out users see "Sign in to connect Meta" using the same sign-in opener other views use; find it in `src/App.jsx` where `authWanted` is used).
- Produces: `MetaConnect` UI states: not signed in, not connected (button "Connect Facebook"), connected without selection (pickers: ad account, Page, Instagram optional, Pixel only for Sales and Leads), connected and ready (summary line plus "Change" and "Disconnect"), expired (message plus "Reconnect"), error from `#meta?meta_error=...` (plain message).

- [ ] **Step 1:** Implement `src/metaApi.js` and `MetaConnect`. Persist nothing from Meta in localStorage; the page asks `/meta/status` on load.
- [ ] **Step 2: Verify in the browser** (`npm run dev`): click Connect, complete Facebook login with your own account, land back on `#meta`, pick your assets, refresh and see the connected summary; click Disconnect and see it reset; cancel on Facebook's dialog and see the message. Console is empty and 375px wide has no horizontal scroll.
- [ ] **Step 3: Commit** `feat(meta): connect card`.

### Task 7: Launch panel in the app

**Files:**
- Create: `src/metaLaunch.jsx` (`export function MetaLaunch({ plan, notify })`, `plan` is the wizard's answer: `{ goal, budget, adsets, ads, country, site, name, days }` from `recommend` in `src/meta.jsx`)
- Modify: `src/meta.jsx`: the details question stores an ISO code (`countryCode`) chosen from a select built like `MARKET_LIST` in `src/rivals.jsx`, replacing the free-text country; `buildSteps` shows the country name from the code.
- Modify: `src/metaApi.js` (add `metaLaunch(formData)`, `metaActivate(requestId)`)

**Interfaces:**
- Consumes: `MetaConnect` readiness from Task 6; `/meta/launch`, `/meta/activate`.
- Produces: UI flow: add pictures (file picker and drop, previews, remove), one editable text set prefilled from the wizard copy, a review summary ("{objective}, {adsets} ad set(s), {n} ads, {budget} {currency} a day, {country}"), button "Create on Meta (paused)", then a result card with a link to Ads Manager and the button "Turn it on", which opens a confirm dialog restating the daily budget before calling `metaActivate`. A `requestId` (`crypto.randomUUID()`) is created once per review and reused on retry; the button is disabled while a request runs.

- [ ] **Step 1:** Implement the panel and the country change. Warn when pictures are fewer than the plan wants (reuse the existing "Make more ads" button) but allow launching with fewer.
- [ ] **Step 2: Verify in the browser:** create paused with 2 pictures, see it in Ads Manager; double-click the button and confirm only one campaign exists; press "Turn it on", confirm the dialog shows the right budget, and confirm the campaign turns active in Ads Manager; then pause it there. Check dark mode and 375px width.
- [ ] **Step 3: Commit** `feat(meta): launch panel`.

### Task 8: Hand an ad from the studio to Meta

**Files:**
- Create: `src/metaQueue.js` (`export const metaQueue = { add(blob: Blob, name: string): void, take(): { blob: Blob, name: string }[] }`, module-level array)
- Modify: `src/studio.jsx` (next to the existing `download` at line 1287, a second button "Run it on Meta" that renders the same PNG and calls `metaQueue.add`, then closes the studio and goes to `#meta`)
- Modify: `src/metaLaunch.jsx` (on mount, `take()` queued ads into the picture list)

**Interfaces:** Consumes `renderCreative` and `buildConfig` already used by `download`.

- [ ] **Step 1:** Implement. Extract the canvas render from `download` into one `makeBlob()` inside the component and call it from both buttons; do not duplicate it.
- [ ] **Step 2: Verify:** open a template in the studio, press "Run it on Meta", land on the wizard with the picture already in the Launch panel.
- [ ] **Step 3: Commit** `feat(meta): studio hand-off`.

### Task 9: Policy pages, review pack, go live

**Files:** Modify `public/privacy.html`, `public/terms/index.html`; extend `docs/META-APP-SETUP.md`.

- [ ] **Step 1:** Privacy page: say what is collected from Meta (name, ad accounts, Pages, Instagram accounts, Pixels), why, that the access token is stored encrypted, that ad pictures are sent to Meta only when the user presses Create, how to disconnect, and how to delete everything (the data deletion URL). Terms: the user is responsible for their ads, budget and Meta's policies; AdDoctor creates ads paused and only turns them on when the user confirms.
- [ ] **Step 2:** Record the review screencast per `docs/META-APP-SETUP.md`: login, permission dialog, selecting assets, creating the paused campaign, seeing it in Ads Manager, turning it on, disconnect. Write the permission justification text for each permission requested.
- [ ] **Step 3:** Submit App Review for the permissions that need Advanced Access, and complete Business Verification if it is not already done. While waiting, keep the app in Development mode and let testers connect.
- [ ] **Step 4:** After approval, switch the app to Live, repeat the Task 5 real check and the Task 7 browser check with a second tester account, then publish following `publish-drift-check` (merge, build, gh-pages).

---

## Self-Review

- **Spec coverage:** connect (T3, T6), choose assets (T4, T6), wizard answers to Meta objects (T1, T5), pictures (T7, T8), paused then confirm (T5, T7), disconnect and deletion (T3), app review (T0, T9). No gaps.
- **Types:** `plan` shape is identical in T1, T5 and T7; `requestId` is the idempotency key in T5 and T7; `loadConnection` fields match T3, T4 and T5.
- **Open decisions for you:** whether launching should cost credits or need a paid plan (not charged in this plan); whether Leads should wait for Instant Forms (this plan uses the website Lead event only).
- **Biggest risk:** App Review timing and a possible Meta rejection. Everything except going live for other users can be built and tested on your own account in Development mode.
