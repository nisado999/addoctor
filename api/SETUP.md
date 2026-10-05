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
