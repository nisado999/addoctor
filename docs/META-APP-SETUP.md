# Meta publishing: what you do, in order

The code is built and tested against a pretend Meta (`npm test`, 24 tests). It has **never talked to the real Meta**. Until you do steps 1 to 4, the Publish on Meta panel says it is not switched on. Nothing else in the app changes.

Plan this came from: `docs/superpowers/plans/2026-11-05-connect-meta-launch.md`.

## 1. Create the Meta app (you, about 30 minutes)

1. developers.facebook.com, log in, My Apps, Create app. Choose the use case for creating and managing ads with the Marketing API.
2. Add the product **Facebook Login** (or Facebook Login for Business, whichever Meta offers for this use case).
3. App settings, Basic: add the **privacy policy URL** (`https://<your site>/privacy.html`), **terms URL** (`https://<your site>/terms/`), an app icon, and the **data deletion callback URL**: `https://<worker host>/meta/data-deletion`.
4. Facebook Login settings: add the valid OAuth redirect URI: `https://<worker host>/meta/callback` (exactly the same as `META_REDIRECT_URI` below).
5. Copy the **App ID** and **App Secret** (Settings, Basic).
6. Note the newest **Graph API version** from Meta's changelog (looks like `v24.0`).
7. Keep the app in **Development** mode. Only you and people you add as testers can connect, which is enough to try everything.

Business Verification and App Review (for other people to connect) are slow. Start Business Verification early: Meta Business Settings, Security Center.

Permissions the code asks for (change `META_SCOPES` in `api/worker.js` if Meta's names differ): `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`.

## 2. Supabase tables (you, 1 minute)

Run `supabase/meta.sql` in the Supabase SQL editor. It creates `meta_connections` and `meta_launches` with no public access.

## 3. Worker secrets (you, Cloudflare dashboard, Workers, Settings, Variables)

| Name | Type | Value |
|---|---|---|
| `META_APP_ID` | text | the App ID |
| `META_APP_SECRET` | secret | the App Secret |
| `META_TOKEN_KEY` | secret | 32 random bytes in base64. Make one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `META_GRAPH_VERSION` | text | e.g. `v24.0` |
| `META_REDIRECT_URI` | text | `https://<worker host>/meta/callback` |
| `SITE_URL` | text | where the app lives, no trailing slash, e.g. `https://nisado999.github.io/addoctor-app` |

`SUPABASE_SERVICE_ROLE` must already be set (billing uses it). Keep `META_TOKEN_KEY` safe: if you lose it, every user must reconnect.

## 4. Paste the Worker

Paste the new `api/worker.js` over the old one, as usual. The file has one new line near the end (`export const metaTest`). If Cloudflare ever refuses the paste because of it, delete that line; only the tests use it.

## 5. Try it on your own account

1. Make sure your own Facebook user has an ad account with a payment method, a Page, and (for Sales and Leads) a Pixel.
2. In the app, Create an ad, finish the steps, then Publish on Meta, Connect Facebook, pick your assets.
3. Create on Meta (paused) with 2 small pictures. Open it in Ads Manager: you should see one paused campaign, its ad set and 2 ads. Delete it there when done.
4. Press Turn it on only if you want to spend. Pause it in Ads Manager right after.

## 6. Things to check on that first run

- **Budget amount.** Open the ad set in Ads Manager and confirm the daily budget is what the page said. The code sends whole units for JPY, KRW, CLP, COP, CRC, HUF, ISK, IDR, PYG, TWD and VND (Meta's currency table lists them with offset 1) and hundredths for everything else. If your currency is wrong, tell me.
- **Meta's field names change between Graph versions.** If Create fails with a message about a field, the message is shown on screen; send it to me.
- **Cloudflare plan.** The free plan allows 50 outside calls per request. One launch makes about 6 plus 3 per ad, so roughly 14 ads at most. The paid plan has no such limit.
- **Instagram.** Needs the Instagram account linked to the Page. If it is not offered, ads still run as the Page.

## 7. Going live for other people (later)

1. Finish Business Verification.
2. App Review: request Advanced Access for the permissions above. Record a screencast of: login, permission screen, choosing assets, creating the paused campaign, seeing it in Ads Manager, turning it on, disconnect. The privacy and terms pages already describe this.
3. Switch the app to Live, repeat step 5 with a second tester account, then publish (merge, build, gh-pages; see the publish drift check).

## What is not built

- Video, carousel and catalog ads (image ads only).
- Instant Forms (Leads uses the website Lead event).
- Ads about housing, credit, jobs or politics (refused with a message).
- Charging credits for a launch.
- Reading how a launched ad performs.
