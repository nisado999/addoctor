# Putting AdDoctor on the web

Pieces: (1) the page (addoctor.html), (2) the backend (worker.js), (3) two paid services it calls.

## 1. Accounts and keys
- Apify (apify.com): create an account, Settings > API & Integrations > copy your API token.
  The actor used is "Facebook Ads Library Scraper" (apify/facebook-ads-scraper). Subscribe to it / check its current
  price: it was about $3.40 per 1,000 ads on the Business plan, more on lower plans. One analysis of ~150 ads is cents.
- Anthropic (console.anthropic.com): create an API key. Each analysis is one call, a few cents at most.

## 2. Deploy the backend (Cloudflare Workers, free tier is enough to start)
1. dash.cloudflare.com > Workers & Pages > Create > Worker > paste worker.js > Deploy.
2. Settings > Variables and Secrets, add:
   - APIFY_TOKEN (secret)
   - ANTHROPIC_KEY (secret)
   - ALLOW_ORIGIN = the address your page will live at, e.g. https://app.yourdomain.com
   - APP_KEY (secret, optional but recommended): any long random string
   - MAX_ADS (optional): cap per analysis, default 800
3. Copy the Worker URL, e.g. https://addoctor-api.yourname.workers.dev

## 3. Put the page online
1. Open addoctor.html in a text editor and replace:
     __ADDOCTOR_API__  with your Worker URL (no trailing slash)
     __ADDOCTOR_KEY__  with the APP_KEY you chose (or leave the line as is if you skipped APP_KEY)
2. Upload the file to any static host (Cloudflare Pages, Vercel: drag and drop, rename it index.html).
3. Open it, go to Competitor Spy, paste an Ad Library link, press Analyze.

## Before real customers use it
- Anyone who opens the page can see APP_KEY in the page source. It only stops casual abuse. Every Analyze costs you money,
  so add sign-in and per-user limits (the page already shows "credits") before you open it to the public.
- Test with the Caudalie Hellas link first. I could not see the scraper's exact output field names, so worker.js reads
  them defensively. If the ads come back empty or without dates, send me one raw item and I will adjust normalize().
- Scraping Meta's Ad Library is against Meta's terms of service for automated collection; the scraping service carries
  that risk. The official Ad Library API is the lower-risk alternative (EU/UK ads only, no video/static flag).

## Competitor Spy without Apify: three ways to read the Ad Library
Meta answers plain server requests to the Ad Library with a bot check ("403 Client challenge"), so the Worker cannot
read it by itself. worker.js picks the first of these that is set up (GET /caps shows which):

1. The AdDoctor helper (free, needs no key). A bookmark the visitor drags from the Competitor Spy screen. Clicked on an
   advertiser's Ad Library page, it reads the ads Meta already sent to that page (text, dates, image links), scrolls
   to load up to 400, and opens AdDoctor in a new tab with them. The page posts them to /analyze as "ads". Only the
   Claude call costs anything. Tested on 2026-10-06 with Admiral Sport Shops (page 599285093554002, Greece) in Chrome.
   Limits: desktop browsers only, the Ad Library tab must stay in front while it scrolls, and it breaks if Meta
   renames the fields it reads (ad_archive_id, snapshot). The code is src/spyHelper.js.
2. ScrapeCreators (paid, cheap, fully automatic): add a SCRAPECREATORS_KEY secret. One request returns about 30 ads
   with images for 1 credit; 100 credits are free, then $47 buys 25,000 that do not expire (checked 2026-10-06).
   A 200-ad analysis is about 7 credits, roughly one cent, against about a dollar on Apify. Written from their
   documentation and NOT yet run against the real service: run one analysis after adding the key.
3. Meta's official API (free, needs Meta's identity check): the META_TOKEN section below.
Apify stays as the last fallback while APIFY_TOKEN is set.

Whichever way the ads arrive, the Worker loads up to 16 creatives (VISION_MAX) from Meta's image servers, the ones
most ads share, the longest-running, and the newest offer ads, and Claude reads them together with the ad text.
The reply has "slide", "report" (sections of findings), "creatives" (what Claude saw in each image) and "insights".

## Meta's official Ad Library API
worker.js uses the official API whenever a META_TOKEN secret is set, and Apify is then not called at all.
It covers ads shown in the EU and UK. It returns the ad text, dates and advertiser, not the images or videos.
1. Confirm your identity with Meta: facebook.com/ID (usually a day or two).
2. developers.facebook.com > My Apps > Create App. Then Tools > Graph API Explorer > Generate Access Token.
   Tokens from the Explorer last about an hour; extend one in Tools > Access Token Debugger > Extend (about 60 days).
3. Cloudflare > addoctor-api > Settings > Variables and Secrets > add META_TOKEN (secret).
4. Cloudflare > addoctor-api > Edit code > replace everything with the current api/worker.js > Deploy.
With a META_TOKEN the Worker also opens the preview page of the 12 most-used ads, takes the image (or a video's cover frame)
and shows them to Claude, so the slide can describe how the ads look. Meta may refuse those reads. The /analyze reply has a
"vision" field (tried, pages, found, images, note) that says what happened; the text analysis works either way.
This path was tested against a mock of the API only. Run one real analysis after adding the token.

## Limits that protect the bill
worker.js limits itself. Set these in Cloudflare > addoctor-api > Settings > Variables and Secrets:
- ALLOW_ORIGIN = https://nisado999.github.io   (add ", http://localhost:5173" while developing). Any other site, and
  any script that sends no Origin, gets a 403. Leave it as * and the Worker is open to everyone.
- RATE_PER_HOUR (optional, default 60): paid calls one visitor may make per hour. A 30-post Social Pack needs about 35.
- DAILY_CAP (optional, default 300): paid calls per day across all visitors.
- MAX_ADS (optional, default 200, never above 800): ads read per Competitor Spy analysis.
The counters use Cloudflare's edge cache, so they are approximate. The hard stop for money is a spending cap at each
provider: Apify (Settings > Billing > usage limit), Anthropic (Console > Limits) and Google AI Studio / Cloud billing budget.
On Cloudflare's free plan the Worker itself cannot run up a charge: it stops at 100,000 requests a day.
