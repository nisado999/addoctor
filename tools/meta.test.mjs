// Tests for the Meta section of api/worker.js. Run: npm test. Meta and Supabase are replaced by a stub fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { metaTest as m } from "../api/worker.js";
import { suggest, recommend } from "../src/adBudget.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const env = { META_APP_ID: "1", META_APP_SECRET: "sek", META_TOKEN_KEY: KEY, META_GRAPH_VERSION: "v99.0", META_REDIRECT_URI: "https://w.example/meta/callback", SITE_URL: "https://site.example/app", SUPABASE_SERVICE_ROLE: "svc", SUPABASE_URL: "https://sb.example" };
const plan = { goal: "sales", budget: 300, adsets: 3, ads: 9, country: "GR", site: "shop.example.com", name: "Coldwear" };
const ctx = { adAccountId: "act_1", pageId: "p1", pixelId: "px1", currency: "EUR", campaignId: "c1" };
const IMG = "data:image/png;base64,iVBORw0KGgo=";
const body = (o) => new Response(JSON.stringify(o), { status: 200 });

test("state round trip", async () => {
  assert.equal(await m.verifyState("k", await m.signState("k", "u1")), "u1");
});
test("state rejects tamper, expiry and a wrong secret", async () => {
  const s = await m.signState("k", "u1", 1000);
  assert.equal(await m.verifyState("k", s.replace("u1", "u2"), 2000), null);
  assert.equal(await m.verifyState("k", s, 1000 + 11 * 60_000), null);
  assert.equal(await m.verifyState("other", s, 2000), null);
  assert.equal(await m.verifyState("k", "junk", 2000), null);
});
test("token encryption round trip, and the blob hides the token", async () => {
  const blob = await m.encryptToken(KEY, "EAAB123");
  assert.equal(await m.decryptToken(KEY, blob), "EAAB123");
  assert.ok(!blob.includes("EAAB123"));
});
test("minor units: whole-unit currencies are not multiplied", () => {
  assert.equal(m.toMinorUnits(50, "EUR"), 5000);
  assert.equal(m.toMinorUnits(50, "JPY"), 50);
  assert.equal(m.toMinorUnits(12.34, "USD"), 1234);
});
test("campaign is paused with the right objective", () => {
  const c = m.buildCampaign(plan, "x");
  assert.deepEqual([c.status, c.objective, c.special_ad_categories], ["PAUSED", "OUTCOME_SALES", []]);
  assert.ok(!("is_adset_budget_sharing_enabled" in c));
  assert.equal(m.buildCampaign(plan, "x", "v24.0").is_adset_budget_sharing_enabled, false);
});
test("ad set splits the budget, targets the country, is paused, carries the pixel", () => {
  const a = m.buildAdSet(plan, ctx, 0);
  assert.equal(a.daily_budget, 10000);
  assert.deepEqual(a.targeting.geo_locations.countries, ["GR"]);
  assert.equal(a.status, "PAUSED");
  assert.deepEqual(a.promoted_object, { pixel_id: "px1", custom_event_type: "PURCHASE" });
  assert.equal(m.buildAdSet({ ...plan, goal: "aware" }, ctx).promoted_object, undefined);
});
test("creative carries the link, the button and no instagram key without one", () => {
  const c = m.buildCreative(plan, ctx, { primary: "p", headline: "h", description: "d" }, "hash");
  const ld = c.object_story_spec.link_data;
  assert.equal(c.object_story_spec.page_id, "p1");
  assert.ok(ld.link.startsWith("https://shop.example.com/") && ld.link.includes("utm_source=meta"));
  assert.equal(ld.call_to_action.type, "SHOP_NOW");
  assert.equal(ld.image_hash, "hash");
  assert.ok(!("instagram_user_id" in c));
  assert.equal(m.buildCreative(plan, { ...ctx, instagramId: "ig1" }, {}, "h").instagram_user_id, "ig1");
});
test("signed request", async () => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("sek"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const b64u = (u8) => Buffer.from(u8).toString("base64url");
  const payload = b64u(enc.encode(JSON.stringify({ user_id: "fb9" })));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
  assert.deepEqual(await m.parseSignedRequest("sek", `${sig}.${payload}`), { user_id: "fb9" });
  assert.equal(await m.parseSignedRequest("sek", `${sig.slice(0, -2)}AA.${payload}`), null);
  assert.equal(await m.parseSignedRequest("wrong", `${sig}.${payload}`), null);
});

/* A fake Supabase and Meta in one stub. Every request is recorded in `calls`. */
function world({ row = null, launches = {}, failOn = null, supaUser = true } = {}) {
  const calls = [];
  const db = { conn: row, launches };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = init.method || "GET", b = init.body && String(init.body).startsWith("{") ? JSON.parse(init.body) : init.body;
    calls.push({ method, host: u.host, path: u.pathname + u.search, body: b });
    if (u.host === "sb.example") {
      if (u.pathname === "/auth/v1/user") return supaUser ? body({ id: "u1", email: "a@b.c", email_confirmed_at: "x" }) : new Response("{}", { status: 401 });
      if (u.pathname.endsWith("/meta_connections")) {
        if (method === "GET") return body(db.conn ? [db.conn] : []);
        if (method === "POST") { db.conn = { ...db.conn, ...b }; return new Response(null, { status: 201 }); }
        if (method === "PATCH") { db.conn = { ...db.conn, ...b }; return new Response(null, { status: 204 }); }
        if (method === "DELETE") { const was = db.conn; db.conn = null; return body(was ? [was] : []); }
      }
      if (u.pathname.endsWith("/meta_launches")) {
        const id = (u.searchParams.get("request_id") || "").replace("eq.", "");
        if (method === "POST") { if (db.launches[b.request_id]) return new Response("{}", { status: 409 }); db.launches[b.request_id] = { ...b }; return new Response(null, { status: 201 }); }
        const owner = (u.searchParams.get("user_id") || "").replace("eq.", ""), row = db.launches[id];
        if (method === "GET") return body(row && (!owner || row.user_id === owner) ? [row] : []);
        if (method === "PATCH") { Object.assign(db.launches[id], b); return new Response(null, { status: 204 }); }
        if (method === "DELETE") return new Response(null, { status: 204 });
      }
    }
    if (u.host === "graph.facebook.com") {
      if (failOn && u.pathname.includes(failOn.path) && failOn.after-- === 0) return new Response(JSON.stringify({ error: { code: failOn.code || 100, message: failOn.message || "Invalid parameter" } }), { status: 400 });
      if (u.pathname.endsWith("/oauth/access_token")) return body({ access_token: "LONG", expires_in: 5000000 });
      if (u.pathname.endsWith("/me")) return body({ id: "fb1" });
      if (u.pathname.endsWith("/adimages")) return body({ images: { x: { hash: "H" + calls.length } } });
      if (method === "POST") return body({ id: "id" + calls.length });
    }
    return body({});
  };
  return { calls, db };
}
const connRow = async () => ({ user_id: "u1", fb_user_id: "fb1", token_enc: await m.encryptToken(KEY, "TOKEN"), token_expires_at: new Date(Date.now() + 86400000).toISOString(), ad_account_id: "act_1", page_id: "p1", instagram_id: null, pixel_id: "px1", currency: "EUR" });
const conn = { userId: "u1", token: "TOKEN", adAccountId: "act_1", pageId: "p1", instagramId: null, pixelId: "px1", currency: "EUR" };
const input = (o = {}) => ({ plan, requestId: "req-12345678", ads: [{ src: IMG, primary: "p", headline: "h" }, { src: IMG }, { src: IMG }], ...o });
const graph = (calls) => calls.filter((c) => c.host === "graph.facebook.com");

test("store: saves only the encrypted token, loads it decrypted, null when empty", async () => {
  const w = world();
  assert.equal(await m.loadConnection(env, "u1"), null);
  await m.saveConnection(env, "u1", { fbUserId: "fb1", token: "PLAINTOKEN", expiresAt: "2030-01-01T00:00:00Z" });
  const sent = JSON.stringify(w.calls.find((c) => c.method === "POST").body);
  assert.ok(!sent.includes("PLAINTOKEN") && sent.includes("token_enc"));
  assert.equal((await m.loadConnection(env, "u1")).token, "PLAINTOKEN");
});

test("callback: bad state saves nothing; good state saves and redirects to #meta", async () => {
  let w = world();
  let r = await m.metaCallback(env, new URL("https://w.example/meta/callback?code=c&state=bad"));
  assert.match(r.headers.get("Location"), /meta_error=state#meta$/);
  assert.equal(w.calls.length, 0);
  w = world();
  const state = await m.signState("sek", "u1");
  r = await m.metaCallback(env, new URL(`https://w.example/meta/callback?code=c&state=${state}`));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("Location"), "https://site.example/app/?meta=done#meta");
  assert.ok(w.db.conn.token_enc && !JSON.stringify(w.db.conn).includes("LONG"));
});
test("callback: pressing Cancel on Facebook shows denied", async () => {
  const r = await m.metaCallback(env, new URL("https://w.example/meta/callback?error=access_denied&state=x"));
  assert.match(r.headers.get("Location"), /meta_error=denied/);
});
test("routes need a sign-in, and status is false without a row", async () => {
  world({ supaUser: false });
  await assert.rejects(() => m.metaRoute(env, new Request("https://w.example/meta/status", { headers: { Authorization: "Bearer t" } }), new URL("https://w.example/meta/status")), { code: "signin_required", status: 401 });
  world();
  const res = await m.metaRoute(env, new Request("https://w.example/meta/status", { headers: { Authorization: "Bearer t" } }), new URL("https://w.example/meta/status"));
  assert.equal((await res.json()).connected, false);
});
test("data deletion removes the row and answers with a confirmation code", async () => {
  const w = world({ row: await connRow() });
  const enc = new TextEncoder(), b64u = (u8) => Buffer.from(u8).toString("base64url");
  const key = await crypto.subtle.importKey("raw", enc.encode("sek"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = b64u(enc.encode(JSON.stringify({ user_id: "fb1" })));
  const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
  const res = await m.metaDeletion(env, new Request("https://w.example/meta/data-deletion", { method: "POST", body: `signed_request=${sig}.${payload}` }));
  assert.ok((await res.json()).confirmation_code);
  assert.equal(w.db.conn, null);
});

test("select refuses an ad account the user does not own, and stores the currency of the chosen one", async () => {
  const w = world({ row: await connRow() });
  globalThis.fetch = ((orig) => async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/me/adaccounts")) return body({ data: [{ id: "act_1", name: "A", currency: "JPY", account_status: 1 }, { id: "act_2", name: "Off", currency: "USD", account_status: 2 }] });
    if (u.pathname.endsWith("/me/accounts")) return body({ data: [{ id: "p1", name: "P", instagram_business_account: { id: "ig1", username: "u" } }] });
    if (u.pathname.endsWith("/adspixels")) return body({ data: [{ id: "px1", name: "Pixel" }] });
    return orig(url, init);
  })(globalThis.fetch);
  assert.deepEqual((await m.listAssets(env, "TOKEN")).adAccounts.map((a) => a.id), ["act_1"]);
  await assert.rejects(() => m.selectAssets(env, "u1", conn, { adAccountId: "act_9", pageId: "p1" }), /ad account/);
  await assert.rejects(() => m.selectAssets(env, "u1", conn, { adAccountId: "act_2", pageId: "p1" }), /ad account/);
  await m.selectAssets(env, "u1", conn, { adAccountId: "act_1", pageId: "p1", instagramId: "ig1", pixelId: "px1" });
  assert.equal(w.db.conn.currency, "JPY");
  await assert.rejects(() => m.selectAssets(env, "u1", conn, { adAccountId: "act_1", pageId: "p1", instagramId: "other" }), /Instagram/);
});
test("metaCall maps code 190 to a reconnect error", async () => {
  world({ failOn: { path: "/me", after: 0, code: 190, message: "expired" } });
  await assert.rejects(() => m.metaCall(env, "T", "GET", "me", {}), { code: "meta_reconnect", status: 422 });
});

test("launch creates in order and everything is PAUSED", async () => {
  const w = world();
  const r = await m.launchPaused(env, conn, input());
  assert.equal(r.status, "PAUSED");
  const posts = graph(w.calls).map((c) => c.path.split("/").pop());
  assert.deepEqual(posts, ["adimages", "adimages", "adimages", "campaigns", "adsets", "adsets", "adsets", "adcreatives", "ads", "adcreatives", "ads", "adcreatives", "ads"]);
  for (const c of graph(w.calls).filter((c) => /campaigns|adsets|\/ads$/.test(c.path))) assert.equal(c.body.status, "PAUSED");
  assert.equal(w.db.launches["req-12345678"].status, "created");
});
test("launch asks Meta for no more ad sets than it has pictures", async () => {
  const w = world();
  await m.launchPaused(env, conn, input({ ads: [{ src: IMG }] }));
  const sets = graph(w.calls).filter((c) => c.path.endsWith("/adsets"));
  assert.equal(sets.length, 1);
  assert.equal(sets[0].body.daily_budget, 30000);
});
test("launch refuses special categories, bad pictures and a missing pixel before any Meta call", async () => {
  const w = world();
  await assert.rejects(() => m.launchPaused(env, conn, input({ plan: { ...plan, specialCategory: true } })), /housing, credit/);
  await assert.rejects(() => m.launchPaused(env, conn, input({ ads: [{ src: "data:image/gif;base64,AAAA" }] })), /PNG or JPEG/);
  await assert.rejects(() => m.launchPaused(env, conn, input({ ads: [{ src: "data:image/png;base64," + "A".repeat(11 * 1024 * 1024) }] })), /8 MB/);
  await assert.rejects(() => m.launchPaused(env, { ...conn, pixelId: null }, input()), /Pixel/);
  assert.equal(graph(w.calls).length, 0);
});
test("launch is idempotent per requestId", async () => {
  const w = world();
  const a = await m.launchPaused(env, conn, input());
  const before = graph(w.calls).length;
  assert.deepEqual(await m.launchPaused(env, conn, input()), a);
  assert.equal(graph(w.calls).length, before);
});
test("launch rolls back the campaign when an ad set fails, and shows Meta's reason", async () => {
  const w = world({ failOn: { path: "/adsets", after: 1, message: "Budget too low" } });
  await assert.rejects(() => m.launchPaused(env, conn, input()), /Budget too low/);
  const del = graph(w.calls).find((c) => c.method === "DELETE");
  assert.ok(del && /\/id\d+$/.test(del.path));
  assert.equal(w.db.launches["req-12345678"].status, "failed");
});
test("launch maps a dead token to reconnect", async () => {
  world({ failOn: { path: "/adimages", after: 0, code: 190 } });
  await assert.rejects(() => m.launchPaused(env, conn, input()), { code: "meta_reconnect" });
});
test("launch says where to fix a payment problem", async () => {
  world({ failOn: { path: "/campaigns", after: 0, message: "No payment method on this ad account" } });
  await assert.rejects(() => m.launchPaused(env, conn, input()), { code: "meta_billing", message: /Billing in Ads Manager/ });
});
test("a failed launch can be retried with the same requestId", async () => {
  const w = world({ failOn: { path: "/campaigns", after: 0 } });
  await assert.rejects(() => m.launchPaused(env, conn, input()));
  const r = await m.launchPaused(env, conn, input());
  assert.equal(r.status, "PAUSED");
  assert.equal(w.db.launches["req-12345678"].status, "created");
});
test("activate refuses another user's launch and flips every object to ACTIVE, campaign last", async () => {
  const w = world();
  await m.launchPaused(env, conn, input());
  await assert.rejects(() => m.activateLaunch(env, { ...conn, userId: "u2" }, "req-12345678"), /no paused ad/);
  await assert.rejects(() => m.activateLaunch(env, conn, "nope"), /no paused ad/);
  w.calls.length = 0;
  await m.activateLaunch(env, conn, "req-12345678");
  const ids = graph(w.calls).map((c) => c.path.split("/").pop());
  assert.equal(ids.length, 3 + 3 + 1);
  assert.ok(graph(w.calls).every((c) => c.body.status === "ACTIVE"));
  assert.equal(ids.at(-1), w.db.launches["req-12345678"].result.campaignId);
});

test("Read my website reads the whole site, even from a pasted product link", async () => {
  const home = '<title>Shop</title><a href="/pages/about">About us</a><a href="https://other.test/shop">x</a><a href="/cart">Cart</a>';
  const files = {
    "https://shop.test/": home,
    "https://shop.test/pages/about": "<title>About</title>We make hoodies.",
    "https://shop.test/products/hoodie": "<title>Hoodie</title>A hoodie.",
    "https://shop.test/sitemap.xml": "<sitemapindex><sitemap><loc>https://shop.test/sitemap_products.xml</loc></sitemap><sitemap><loc>https://shop.test/sitemap_pages.xml</loc></sitemap></sitemapindex>",
    "https://shop.test/sitemap_pages.xml": "<urlset><url><loc>https://shop.test/pages/our-story</loc></url><url><loc>https://shop.test/collections/all?a=1&amp;b=2</loc></url><url><loc>https://evil.test/pages/about</loc></url></urlset>",
    "https://shop.test/pages/our-story": "<title>Story</title>Since 2019.",
    "https://shop.test/collections/all": "<title>All</title>Everything.",
  };
  const asked = [], real = globalThis.fetch;
  globalThis.fetch = async (u) => { u = String(u); asked.push(u); return u in files ? new Response(files[u], { status: 200 }) : new Response("no", { status: 404 }); };
  try {
    const r = await m.readBrand({}, { url: "shop.test/products/hoodie" });
    for (const p of ["/", "/pages/about", "/pages/our-story", "/collections/all", "/products/hoodie"]) assert.ok(asked.includes("https://shop.test" + p), "not read: " + p);
    assert.ok(!asked.some((u) => /evil\.test|sitemap_products|\/cart/.test(u)), "read a page it should skip");
    assert.equal(r.pages.length, 5);
  } finally { globalThis.fetch = real; }
});

test("budget: with no profit margin it keeps the old rule of thumb for the shop type", () => {
  const s = suggest({ goal: "sales", product: "fashion", aov: 80 });
  assert.deepEqual([s.cpa, s.daily, s.breakEven], [24, 120, 0]);
});
test("budget: a known margin sets the cost per sale, break-even and the daily budget", () => {
  const s = suggest({ goal: "sales", product: "fashion", aov: 80, margin: "high", repeat: "once" });
  assert.equal(Math.round(s.breakEven), 48); // 80 x 60%
  assert.equal(Math.round(s.cpa * 10) / 10, 33.6); // 70% of break-even
  assert.equal(s.daily, 170);
  assert.ok(suggest({ goal: "sales", product: "tech", aov: 80, margin: "thin" }).cpa < 8); // thin margin: little room for ads
});
test("budget: customers who come back allow a higher cost, capped at 80% of an order", () => {
  const once = suggest({ goal: "sales", aov: 100, margin: "mid", repeat: "once" }).cpa;
  assert.ok(suggest({ goal: "sales", aov: 100, margin: "mid", repeat: "often" }).cpa > once);
  assert.equal(suggest({ goal: "sales", aov: 100, margin: "high", repeat: "often" }).share <= 0.8, true);
});
test("budget: for leads the cost is per enquiry, after the share that become customers", () => {
  const s = suggest({ goal: "leads", aov: 500, margin: "mid", close: "some", repeat: "once" });
  assert.equal(s.breakEven, 50); // 500 x 40% x 25%
  assert.equal(Math.round(s.cpa * 100) / 100, 35); // 70% of break-even
});
test("budget: the plan says how many visitors and what a click may cost, and flags too little volume", () => {
  const r = recommend({ goal: "sales", aov: 80, margin: "high", repeat: "once", conv: "mid", budget: 170 });
  assert.equal(Math.round(r.visitors), 337); // 170 / 33.6 sales a day / 1.5%
  assert.equal(Math.round(r.maxCpc * 100) / 100, 0.5); // 33.6 x 1.5%
  assert.equal(r.lowVolume, false);
  assert.equal(recommend({ goal: "sales", aov: 80, margin: "high", budget: 10 }).lowVolume, true); // 0.3 sales a day
  assert.equal(suggest({ goal: "traffic" }).daily, 15); // nothing to price
});

test("Read my website returns every product photo of a shop, flags included", async () => {
  const products = Array.from({ length: 40 }, (_, i) => ({ title: "P" + i, product_type: i % 2 ? "Flag" : "Tee", vendor: "Sermons", body_html: "x", images: [{ src: `https://cdn.shop.test/files/${i % 2 ? "saint-flag-front" : "tee-" + i}-${i}.jpg` }] }));
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => (String(u).startsWith("https://shop.test/products.json") ? new Response(JSON.stringify({ products }), { status: 200 }) : new Response("no", { status: 404 }));
  try {
    const r = await m.readBrand({}, { url: "shop.test" });
    assert.equal(r.images.length, 40);
    assert.ok(r.images.some((i) => /flag/.test(i.url)));
  } finally { globalThis.fetch = real; }
});

test("every route that spends AI money is behind the sign-in and rate limits", () => {
  for (const p of ["/start", "/analyze", "/creative", "/ask", "/rivals", "/angles/find", "/brand/read", "/pack/image", "/pack/store", "/make/plan", "/make/ad", "/make/review", "/spy/read"]) assert.ok(m.PAID.test(p), p);
  for (const p of ["/caps", "/status", "/thumb", "/log", "/billing/config"]) assert.ok(!m.PAID.test(p), p);
});
