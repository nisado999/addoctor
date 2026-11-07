import test from "node:test";
import assert from "node:assert/strict";
import { cleanResult, hookFor, labelOf, templateOf, asText } from "../src/angleKit.js";

const good = {
  product: "Organic cotton hoodies",
  avatars: [
    { name: "The Tall Guy", who: "Men over 190 cm", situation: "Sleeves always too short", pain: "Nothing fits", desire: "A hoodie that fits", objection: "Price", where: "Instagram Reels",
      angles: [{ kind: "problem", hook: "Sleeves too short? Same.", message: "It is cut long.", visual: "A man in a hoodie." }, { kind: "bogus", hook: "Cut for tall men", message: "", visual: "" }] },
    { name: "", angles: [{ kind: "offer", hook: "x" }] },
    { name: "No angles", angles: [] },
    null,
  ],
};

test("cleanResult keeps good avatars, drops broken ones, maps an unknown kind to problem", () => {
  const r = cleanResult(good);
  assert.equal(r.avatars.length, 1);
  assert.equal(r.avatars[0].angles[1].kind, "problem");
  assert.equal(r.product, "Organic cotton hoodies");
});

test("cleanResult rejects answers with nothing usable", () => {
  assert.equal(cleanResult(null), null);
  assert.equal(cleanResult({ avatars: "x" }), null);
  assert.equal(cleanResult({ avatars: [{ name: "A", angles: [{ hook: "" }] }] }), null);
});

test("a hook that still has an [X] placeholder is not put in the template as the headline", () => {
  assert.equal(hookFor("[X] reviews later"), "");
  assert.equal(hookFor("Sleeves too short? Same."), "Sleeves too short? Same.");
  assert.equal(hookFor(undefined), "");
});

test("every kind maps to a label and a template", () => {
  assert.equal(labelOf("proof"), "Social proof");
  assert.ok(templateOf("offer"));
  assert.equal(templateOf("nope"), "");
});

test("asText lists every buyer and hook", () => {
  const t = asText(cleanResult(good));
  assert.match(t, /1\. The Tall Guy/);
  assert.match(t, /Sleeves too short\? Same\./);
  assert.equal(asText(null), "");
});
