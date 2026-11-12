// Tests for the Examine Ad engine (src/analysis.js). Run: npm test.
import test from "node:test";
import assert from "node:assert/strict";
import { analyze, prescriptionText } from "../src/analysis.js";

// The three "Quick sample loaders" from src/data.jsx (copied: data.jsx is JSX, which Node can't import).
const SKIN = { brand: "Lumen Glow", type: "static", headline: "Glowing skin starts with vitamin C", copy: "Dull skin? Our vitamin C serum evens tone in 4 weeks, with 15% L-ascorbic acid. Apply two drops each morning under your SPF. Free shipping on every order. Shop at lumenglow.com." };
const GYM = { brand: "IronPeak", type: "video", headline: "Best pre-workout on the market", copy: "IronPeak Pre-Workout has 300mg of caffeine and 6g of citrulline per scoop. Available in 5 flavors. Buy it on our site." };
const APPAREL = { brand: "Nordvik", type: "static", headline: "New fall collection is here", copy: "Check out our latest styles for fall. Comfortable, stylish and made to last. Free shipping on orders over $75." };
const STRONG = { brand: "Calm", type: "static", headline: "Why do 9 in 10 sleep apps fail you?", copy: "Fall asleep in 12 minutes without pills. Try Calm free for 14 days, cancel anytime with our money-back guarantee. Start tonight, offer ends Sunday." };
const EMPTY = { brand: "", type: "static", headline: "", copy: "" };
// A flat, low-contrast creative showing a jacket the copy never mentions: three Hook leaks outrank everything else.
const FLAT_JACKET = { w: 1080, h: 1350, lumStd: 9, lumMean: 200, sat: 0.05, kind: "image", tags: ["jacket"], tagSource: "sample" };

test("scores stay in range and the status matches the score", () => {
  for (const input of [SKIN, GYM, APPAREL, STRONG, EMPTY, { ...APPAREL, asset: FLAT_JACKET }]) {
    const r = analyze(input);
    assert.ok(r.score >= 0 && r.score <= 100, String(r.score));
    assert.equal(r.status, r.score >= 70 ? "Healthy" : r.score >= 40 ? "Needs Immediate Attention" : "Critical");
    assert.equal(r.vitals.length, 4);
    for (const v of r.vitals) {
      assert.ok(v.value >= 8 && v.value <= 96, `${v.key}=${v.value}`);
      assert.equal(v.tone, v.value < 40 ? "bad" : v.value < 70 ? "warn" : "good");
    }
    assert.equal(r.weakest.value, Math.min(...r.vitals.map((v) => v.value)));
    assert.ok(r.leaks.length <= 3);
    assert.deepEqual(r.leaks.map((l) => l.sev), [...r.leaks.map((l) => l.sev)].sort((a, b) => b - a), "leaks are worst first");
  }
});

test("a well-built ad scores higher than a weak one, and an empty one is critical", () => {
  assert.ok(analyze(STRONG).score > analyze(APPAREL).score);
  assert.ok(analyze(APPAREL).score > analyze(EMPTY).score);
  assert.equal(analyze(EMPTY).status, "Critical");
});

test("Start here: the fix is for the weakest vital sign, with the leak's own advice", () => {
  const cases = [
    [SKIN, "offer", "Offer has no risk-reverser", "Add a guarantee or free returns to remove the last objection."],
    [GYM, "offer", "No offer on the table", "Add a discount, a bonus or free shipping."],
    [APPAREL, "cta", "Soft call to action", "Name the exact action: shop, book, claim or start."],
    [EMPTY, "clarity", "No primary copy", null],
  ];
  for (const [input, weakest, title, action] of cases) {
    const r = analyze(input);
    assert.equal(r.weakest.key, weakest);
    assert.equal(r.fix.title, title);
    if (action) assert.equal(r.fix.action, action);
    assert.ok(r.fix.action.length > 10 && /[.!?]$/.test(r.fix.action), "the action is one whole sentence");
  }
});

test("Start here: found even when the weakest area did not make the top 3 leaks", () => {
  const r = analyze({ ...APPAREL, asset: FLAT_JACKET });
  assert.equal(r.weakest.key, "cta");
  assert.ok(r.leaks.every((l) => l.area !== "CTA"), "the CTA leak is outranked: " + r.leaks.map((l) => l.title).join(", "));
  assert.equal(r.fix.title, "Soft call to action");
});

test("Start here: no note when the weakest area has nothing left to fix", () => {
  const r = analyze(STRONG);
  assert.equal(r.fix, null);
  assert.ok(!prescriptionText(STRONG, r).includes("Start here"));
});

test("the copied prescription leads with the fix and carries every section", () => {
  const r = analyze(APPAREL);
  const lines = prescriptionText(APPAREL, r).split("\n");
  assert.equal(lines[0], "AdDoctor: The Doctor's Prescription");
  assert.equal(lines[1], "Nordvik | Static Image");
  assert.match(lines[2], /^Ad Health Score: \d+\/100 \(/);
  assert.equal(lines[3], "Start here: Soft call to action. Name the exact action: shop, book, claim or start.");
  for (const section of ["VITAL SIGNS", "CONVERSION LEAKS", "REWRITTEN HEADLINES", "OPENING HOOKS", "VISUAL LAYOUT"]) assert.ok(lines.includes(section), section);
  r.leaks.forEach((l) => assert.ok(lines.some((x) => x.includes(l.title)), l.title));
});

test("analyze does not change the input it is given", () => {
  const input = { ...APPAREL, asset: { ...FLAT_JACKET, tags: [...FLAT_JACKET.tags] } };
  const before = JSON.stringify(input);
  analyze(input);
  assert.equal(JSON.stringify(input), before);
});
