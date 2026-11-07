/* The Angle Finder's plain logic, kept apart from the page so it can be tested: shaping the server's answer, the
   hook that is safe to drop into a template, and the text for "Copy everything". The nine kinds are the ones in
   angles.js, so every angle already knows which template builds it. */

import { SPY_ANGLE } from "./angles.js";

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// The answer must have at least one avatar with at least one angle, or the page would draw nothing useful.
export function cleanResult(j) {
  if (!j || typeof j !== "object" || !Array.isArray(j.avatars)) return null;
  const avatars = j.avatars.map((a) => {
    if (!a || typeof a !== "object") return null;
    const angles = (Array.isArray(a.angles) ? a.angles : []).map((g) => {
      if (!g || typeof g !== "object" || !str(g.hook, 200)) return null;
      return { kind: SPY_ANGLE[g.kind] ? g.kind : "problem", hook: str(g.hook, 200), message: str(g.message, 300), visual: str(g.visual, 300) };
    }).filter(Boolean).slice(0, 4);
    if (!str(a.name, 80) || !angles.length) return null;
    return { name: str(a.name, 80), who: str(a.who, 240), situation: str(a.situation, 300), pain: str(a.pain, 300), desire: str(a.desire, 300), objection: str(a.objection, 300), where: str(a.where, 200), angles };
  }).filter(Boolean).slice(0, 6);
  return avatars.length ? { product: str(j.product, 240), avatars } : null;
}

// A hook with [X] in it is waiting for the seller's real number, so it goes into the template as a note, not as the headline.
export const hookFor = (hook) => (/\[[^\]]+\]/.test(hook || "") ? "" : hook || "");

export const labelOf = (kind) => (SPY_ANGLE[kind] ? SPY_ANGLE[kind].label : "Angle");
export const templateOf = (kind) => (SPY_ANGLE[kind] ? SPY_ANGLE[kind].tpl : "");

export function asText(res) {
  if (!res) return "";
  const out = [res.product ? `Angle Finder: ${res.product}` : "Angle Finder", ""];
  res.avatars.forEach((a, i) => {
    out.push(`${i + 1}. ${a.name}${a.who ? ` (${a.who})` : ""}`);
    if (a.situation) out.push(`   Situation: ${a.situation}`);
    if (a.pain) out.push(`   Pain: ${a.pain}`);
    if (a.desire) out.push(`   Wants: ${a.desire}`);
    if (a.objection) out.push(`   Holds back: ${a.objection}`);
    if (a.where) out.push(`   Reach them: ${a.where}`);
    a.angles.forEach((g) => {
      out.push(`   - ${labelOf(g.kind)}: ${g.hook}`);
      if (g.message) out.push(`     Argument: ${g.message}`);
      if (g.visual) out.push(`     Shot: ${g.visual}`);
    });
    out.push("");
  });
  return out.join("\n").trim();
}
