# Turning billing on

Everything is built, tested and safe to ship with billing **off**. Nothing changes for visitors until you set `BILLING=on` on the Worker. Do these in order. Steps 1 to 6 happen in the **Paddle sandbox** (fake money), then step 7 repeats them live.

## 0. What you need
- A Paddle account (paddle.com, "Paddle Billing"). Start with the **sandbox** (sandbox-login.paddle.com). Live needs identity and business checks, so open the application early.
- Your Supabase project (already used for sign-in) and the Cloudflare Worker (addoctor-api).
- Confirm with a Greek accountant whether you sell as a sole trader or a company, and how to invoice. Paddle sells to the customer as merchant of record and pays you out; you still declare that income.

## 1. Supabase: the credit ledger
Dashboard > SQL Editor > New query > paste the whole of `supabase/billing.sql` > Run. It is safe to run twice. It creates `billing_accounts` and `credit_ledger` and the functions the Worker calls. Only the Worker can change balances.

Then Project Settings > API > copy the **service_role** key (secret!).

## 2. Paddle: products and prices (sandbox)
Catalogue > Products. Create one product "AdDoctor plans" with six recurring prices, and one product "AdDoctor credits" with one one-time price. Use USD (add EUR prices too if you want buyers to pay in euros).

| Our key | Paddle price | Billing |
|---|---|---|
| starter_month | $19 | monthly |
| starter_year | $190 | yearly |
| pro_month | $49 | monthly |
| pro_year | $490 | yearly |
| agency_month | $129 | monthly |
| agency_year | $1,290 | yearly |
| topup | $15 | one-time (250 credits per unit) |

Copy each price id (looks like `pri_01...`).

## 3. Paddle: token, webhook, checkout domain
- Developer tools > Authentication > **client-side token** (starts `test_` in the sandbox). Safe to expose.
- Developer tools > Notifications > New destination. URL: `https://addoctor-api.nisado9999.workers.dev/billing/webhook`. Tick: `transaction.completed`, `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.resumed`, `subscription.paused`, `subscription.past_due`, `subscription.canceled`. Save, then copy the destination's **secret key** (secret!).
- Checkout > Checkout settings: set a **default payment link** and approve the domain `https://nisado999.github.io`. Overlay checkout will not open on an unapproved domain.

## 4. Cloudflare Worker: settings
Worker > Settings > Variables and Secrets. Add:

| Name | Type | Value |
|---|---|---|
| `SUPABASE_SERVICE_ROLE` | Secret | the service_role key from step 1 |
| `PADDLE_WEBHOOK_SECRET` | Secret | the notification secret from step 3 |
| `PADDLE_CLIENT_TOKEN` | Text | the client-side token from step 3 |
| `PADDLE_ENV` | Text | `sandbox` (remove this when you go live) |
| `PADDLE_PRICES` | Text | `{"starter_month":"pri_..","starter_year":"pri_..","pro_month":"pri_..","pro_year":"pri_..","agency_month":"pri_..","agency_year":"pri_..","topup":"pri_.."}` |
| `BILLING` | Text | leave **unset** until step 5 |

Then paste the current `api/worker.js` (Edit code > Deploy). With `BILLING` unset the site behaves as it did.

## 5. Test the pieces
1. Open `https://addoctor-api.nisado9999.workers.dev/billing/config`. It should show your token and price ids (never a secret).
2. Set `BILLING` = `on`. Open the site, sign in: the sidebar shows "25 credits · Free plan" and a "Plans & credits" entry.
3. Plans & credits > Choose Starter. In the sandbox use card **4242 4242 4242 4242**, any future date, CVC 100. After paying, the balance should become 300 within a few seconds.
4. Buy the top-up: +250 credits. Spend a few credits (Ask, an image) and watch the number drop. Try to use more than you have: you get a "top up or upgrade" message.
5. In Paddle, cancel the subscription: the Plans page shows "ends <date>" and keeps working until then.

If checkout does not open: check the browser console for a blocked script or frame (the site's security policy in `index.html` allows cdn.paddle.com, *.paddle.com frames and connections), and that the domain is approved in Paddle.

## 6. Check the money
Supabase > Table editor > `credit_ledger`: every grant, spend, refund and expiry is a row with the action that caused it. `billing_accounts` holds each balance.

## 7. Go live
Repeat steps 2 to 4 in your **live** Paddle account (live products and prices, live client token, live notification secret), remove `PADDLE_ENV`, keep `BILLING=on`. Make one real purchase with your own card and refund it from Paddle.

## Before the first real customer
- Have the Terms page (`/terms/`) and Refund policy (`/refunds/`) reviewed by a lawyer. They are plain-language drafts and do not name a governing law or your legal entity: add those.
- Paddle needs a public site with pricing, terms, refund policy and privacy. All four exist; check that your business details match what you gave Paddle.
- Decide what you will tell customers who write in (support address): the pages currently point to GitHub issues, which are public.

## What each action costs (credits)
Free: Examine your own ad, brand search. 1: open a creative breakdown, score an ad. 2: Social Pack brief, post ideas. 3: Ask about ads, organic posts. 5: a standard image. 12: a best-quality image. 15: a competitor analysis. Change these in `creditCost()` (api/worker.js) and `COSTS` (src/billing.js) together. Monthly credits per plan are in `plan_allowance()` (supabase/billing.sql), `PLANS` (src/billing.js).

## Known limits
- The rate-limit counters are read-then-write and per data centre, so a fast burst can slightly undercount (this does not affect credits, which are exact).
- `/start` (reading a brand's ads) only checks you have 15 credits; the 15 are charged when the analysis runs. Someone could read ads without analysing; the per-account rate limits bound that.
- A Social Pack charges per image delivered; its text steps (brief, post ideas) are charged separately (2 credits each).
