# Billing strategy: sell yearly Pro

Written 24 October 2026. The goal is one purchase: **Pro, billed yearly**. Every other plan exists to make that one the obvious choice.

## What an action really costs us

From Google's and Anthropic's price lists (October 2026):

| Action | Credits | Our cost | What a credit costs the buyer on yearly Pro |
|---|---|---|---|
| Ad image (Gemini 3.1 Flash Image, 1K) | 5 | about $0.067 | $0.22 per ad |
| Best-quality image (Gemini 3 Pro Image) | 12 | about $0.134 | $0.52 per image |
| Competitor analysis (Claude Sonnet 5.5 + ad reader) | 15 | about $0.15 to $0.20 | $0.65 |

Even a Pro customer who uses every credit on standard images costs about $12 a month in AI, against $39 to $49 paid. Margins are fine on every plan; the old problem was not cost, it was that **Starter was too good**.

## The plans

| Plan | Price | Credits / month | About | Gets |
|---|---|---|---|---|
| Free | $0 | 25 | 5 ads | Examine, templates, Idea Engine, Meta competitor ads |
| Starter | $19 / month, **monthly only** | **100** (was 200) | 20 ads, 95¢ each | Everything in Free + top-ups |
| **Pro** | $49 / month, or **$468 / year ($39 / month)** | 900 | 180 ads, 22¢ each | Everything + Google & TikTok ads, PowerPoint export, best-quality images, **+1,500 bonus credits each yearly payment** |
| For Teams | $129 / month, or $1,236 / year ($103 / month) | 2,500 | 500 ads | Everything in Pro, 2.8× the credits. Seats are marked "coming soon" (they are not built) |
| Top-up | $15 once | 200 | 40 ads | Paid plans only, lasts 12 months |

## Why this sells yearly Pro

1. **Starter is a decoy.** At 20 ads for $19 it is a real plan for a shop trying things, but yearly Pro is 9× the credits for about twice the price: 95¢ an ad against 22¢. Starter has no yearly price, so anyone ready to commit for a year is pointed at Pro.
2. **Pro owns the features people grow into.** Google and TikTok competitor ads, the PowerPoint report and best-quality images are Pro only, enforced by the Worker (`proOnly`), not just hidden. Locked controls show a small "Pro" badge and open the upgrade dialog.
3. **Yearly is the default and is worth more than a discount.** The toggle opens on Yearly. Pro yearly saves $120 (20%) and adds 1,500 bonus credits (about 300 ads) on every yearly payment. The bonus costs us about $20 if fully used.
4. **Price per ad, not per credit.** Every card says "≈ 180 ads a month · 22¢ an ad". Credits are abstract; ads are what people buy.
5. **The upgrade moment.** Running out of credits, or touching a Pro feature, opens one dialog over the current screen (work is kept), leading with Pro yearly, then Pro monthly, then a top-up for people already paying.
6. **Risk removed.** "14-day refund if you've used under 10%" sits under every buy button. This matches public/refunds/.
7. **Honest.** No fake reviews, no invented user counts, no countdown timers. Seats are labelled as coming soon until they exist.

## What to watch after launch

- Share of paid signups that choose Pro yearly (target: half or more).
- Starter → Pro upgrades within 60 days.
- Credits used per Pro account. If most Pro accounts use under a third of 900, the plan is generous enough to raise to $59 later for new customers.
- Refund requests per plan.

## To make it live (in this order)

1. **Supabase SQL editor:** run all of `supabase/billing.sql` again. It is safe to re-run. It changes Starter to 100 credits, adds `last_event_at`, replaces `billing_set_plan` (ignores late Paddle events) and adds `billing_use_grant` (free edits counted safely).
2. **Paddle sandbox:** create the new prices `pro_year` $468 and `agency_year` $1,236 (archive the old $490 and $1,290 ones), and stop using `starter_year`.
3. **Cloudflare:** update `PADDLE_PRICES` with the new price ids (no `starter_year`), add a `GRANT_SECRET` secret, then paste the new `api/worker.js` and deploy. Step 1 must come first: the new Worker calls `billing_use_grant`.
4. Test in the sandbox: buy Pro yearly and check that the balance shows 900 plan credits + 1,500 bonus.
5. Publish the site.

Existing sandbox Starter accounts drop to 100 credits at their next monthly refill.
