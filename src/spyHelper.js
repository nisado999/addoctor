/* The AdDoctor helper: a bookmark the visitor clicks while a brand's page is open in the Meta Ad Library.
   It runs in their own browser, reads the ads Meta has already sent to that page (text, dates and image links),
   scrolls to load the rest, and hands them to AdDoctor in a new tab. Nothing is fetched by a server, so it costs
   nothing to run and Meta's bot check never applies.

   spyCollector is turned into text for the bookmark, so it must not use anything outside its own body. */

function spyCollector(cfg) {
  if (window.__addoctor) return;
  if (!/(^|\.)facebook\.com$/.test(location.hostname) || location.pathname.indexOf("/ads/library") !== 0) {
    alert("Open a brand's page in the Meta Ad Library first, then click AdDoctor again.");
    return;
  }
  window.__addoctor = true;
  var ads = new Map();
  var str = function (v) { return typeof v === "string" ? v : ""; };
  var slim = function (n) {
    var s = n.snapshot || {};
    var media = function (list, keys) {
      return (Array.isArray(list) ? list : []).slice(0, 4).map(function (m) { var o = {}; keys.forEach(function (k) { if (m && m[k]) o[k] = m[k]; }); return o; });
    };
    return {
      ad_archive_id: String(n.ad_archive_id), page_name: str(n.page_name) || str(s.page_name), is_active: n.is_active,
      start_date: n.start_date, end_date: n.end_date, collation_count: n.collation_count, publisher_platform: n.publisher_platform,
      snapshot: {
        page_name: str(s.page_name), body: { text: str(s.body && typeof s.body === "object" ? s.body.text : s.body).slice(0, 900) },
        title: str(s.title).slice(0, 200), cta_text: str(s.cta_text), display_format: str(s.display_format), link_url: str(s.link_url).slice(0, 300),
        images: media(s.images, ["resized_image_url", "original_image_url"]),
        videos: media(s.videos, ["video_preview_image_url"]),
        cards: (Array.isArray(s.cards) ? s.cards : []).slice(0, 6).map(function (c) {
          return { body: str(c.body).slice(0, 500), title: str(c.title).slice(0, 200), cta_text: str(c.cta_text), link_url: str(c.link_url).slice(0, 300), resized_image_url: c.resized_image_url, original_image_url: c.original_image_url, video_preview_image_url: c.video_preview_image_url, video: !!(c.video_hd_url || c.video_sd_url) };
        }),
      },
    };
  };
  var walk = function (o, depth) {
    if (!o || typeof o !== "object" || depth > 30) return;
    if (o.ad_archive_id && o.snapshot) { if (!ads.has(String(o.ad_archive_id))) ads.set(String(o.ad_archive_id), slim(o)); return; }
    for (var k in o) walk(o[k], depth + 1);
  };
  var eat = function (text) {
    if (!text || text.indexOf("ad_archive_id") < 0) return;
    text.replace(/^for \(;;\);/, "").split("\n").forEach(function (line) { try { walk(JSON.parse(line), 0); } catch (e) { /* not JSON */ } });
  };
  // the first ads are in the page itself; the rest arrive as the page scrolls
  document.querySelectorAll("script").forEach(function (s) { eat(s.textContent); });
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", function () { try { if (!this.responseType || this.responseType === "text") eat(this.responseText); } catch (e) { /* unreadable */ } });
    return send.apply(this, arguments);
  };

  var el = function (tag, css, text) { var e = document.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; };
  var box = el("div", "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:300px;padding:16px;border-radius:14px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 12px 40px rgba(15,23,42,.22);font:14px/1.45 system-ui,sans-serif;color:#0f172a");
  var title = el("div", "font-weight:700", "AdDoctor");
  var msg = el("div", "margin-top:4px;color:#475569;font-size:13px");
  var btn = el("button", "margin-top:12px;width:100%;height:40px;border:0;border-radius:10px;background:#2563eb;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer");
  var shut = el("button", "position:absolute;top:8px;right:10px;border:0;background:none;color:#94a3b8;font-size:18px;cursor:pointer", "×");
  box.appendChild(title); box.appendChild(msg); box.appendChild(btn); box.appendChild(shut);
  document.body.appendChild(box);

  var done = false, quiet = 0, last = -1, timer = 0;
  var onPage = function () { return (document.body.innerText.match(/Library ID:/g) || []).length; };
  var missed = onPage() > ads.size + 5;   // ads were scrolled into view before the helper started
  var finish = function () {
    done = true; clearInterval(timer);
    title.textContent = ads.size ? "Read " + ads.size + " ads" : "No ads found";
    msg.textContent = !ads.size ? "This page shows no ads. Pick an advertiser in the Ad Library and try again."
      : missed ? "Some ads were on screen before AdDoctor started and were skipped. For all of them, reload this page and click AdDoctor straight away." : "Text, dates and images are ready.";
    btn.textContent = "Open the analysis";
    btn.style.display = ads.size ? "block" : "none";
  };
  var tick = function () {
    title.textContent = "Reading ads… " + ads.size;
    // a tab in the background does not load more ads as it scrolls, so wait for it to come back
    if (document.hidden) { msg.textContent = "Paused. Bring this tab to the front to keep reading."; return; }
    if (ads.size === last) quiet++; else { quiet = 0; last = ads.size; }
    msg.textContent = "Scrolling the page to load every ad. Keep this tab in front.";
    if (quiet >= 6 || ads.size >= cfg.max) return finish();
    window.scrollTo(0, document.documentElement.scrollHeight);
  };
  btn.textContent = "Stop and use these";
  btn.onclick = function () {
    if (!done) return finish();
    var payload = { type: "addoctor-ads", v: 1, url: location.href, ads: Array.from(ads.values()) };
    // The ads travel as the new tab's window name, which AdDoctor reads when it opens. If the browser drops the
    // name, AdDoctor says it is ready and the ads are sent as a message instead.
    var w = window.open(cfg.app, "addoctor:" + JSON.stringify(payload));
    if (!w) { msg.textContent = "Your browser blocked the new tab. Allow pop-ups for this page and press the button again."; return; }
    msg.textContent = "Sent. The analysis is being written in the AdDoctor tab.";
    var onReady = function (ev) {
      if (ev.origin !== cfg.origin || !ev.data || ev.data.type !== "addoctor-ready") return;
      w.postMessage(payload, cfg.origin);
    };
    window.addEventListener("message", onReady);
  };
  shut.onclick = function () { clearInterval(timer); XMLHttpRequest.prototype.send = send; box.remove(); window.__addoctor = false; };
  timer = setInterval(tick, 1500);
  tick();
}

// The text of the bookmark. app is where AdDoctor's Competitor Spy lives.
function spyBookmarklet(app) {
  const cfg = { app, origin: new URL(app).origin, max: 400 };
  return "javascript:(" + encodeURIComponent(spyCollector.toString()) + ")(" + encodeURIComponent(JSON.stringify(cfg)) + ")";
}

const SPY_FB_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*facebook\.com$/;

// One helper record in the shape the page uses. The server does this too (normalize in api/worker.js) and adds the
// image analysis; this copy is only for when the server can't be reached, so the keyword read still works.
function spyFromLib(it) {
  const s = it.snapshot || {};
  const cards = Array.isArray(s.cards) ? s.cards : [];
  const ok = (v) => { const t = String(v == null ? "" : v).trim(); return /\{\{.*\}\}/.test(t) ? "" : t; };
  const card = cards.find((c) => ok(c.body) || ok(c.title)) || cards[0] || {};
  const body = ok(s.body && s.body.text) || ok(card.body);
  const title = ok(s.title) || ok(card.title);
  const df = String(s.display_format || "").toUpperCase();
  const dynamic = df === "DCO" || df === "DPA";   // their cards are versions or catalog products, not carousel slides
  const video = (s.videos || []).length > 0 || df === "VIDEO" || (dynamic ? !!(cards[0] && cards[0].video) : cards.some((c) => c.video));
  const advertiser = String(it.page_name || s.page_name || "");
  const ms = (v) => (typeof v === "number" && v > 0 ? v * 1000 : null);
  const startMs = ms(it.start_date), end = ms(it.end_date);
  const endMs = it.is_active === true ? null : end;
  const cm = advertiser.match(/^(.{2,60}?)\s+with\s+(.{2,40})$/i);
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const img = [...(s.images || []).map((i) => i.resized_image_url || i.original_image_url), ...(s.videos || []).map((v) => v.video_preview_image_url), ...cards.map((c) => c.resized_image_url || c.original_image_url || c.video_preview_image_url)].find((u) => /^https:\/\/[a-z0-9.-]+\.(fbcdn\.net|cdninstagram\.com)\//i.test(u || "")) || "";
  return {
    libId: String(it.ad_archive_id || ""), advertiser,
    headline: (title || lines[0] || "").slice(0, 110), body: (title ? lines : lines.slice(1)).join(" ").slice(0, 400),
    cta: ok(s.cta_text) || ok(card.cta_text), format: video ? "Video" : df === "CAROUSEL" || (!df && cards.length > 1) ? "Carousel" : "Static",
    startMs, endMs, days: startMs ? Math.max(0, Math.round(((endMs || Date.now()) - startMs) / 86400000)) : null,
    creator: cm && cm[1].trim().toLowerCase() !== cm[2].trim().toLowerCase() ? cm[1].trim() : s.page_name && it.page_name && s.page_name.trim().toLowerCase() !== it.page_name.trim().toLowerCase() ? s.page_name.trim() : "", img,
  };
}

export { spyCollector, spyBookmarklet, spyFromLib, SPY_FB_ORIGIN };
