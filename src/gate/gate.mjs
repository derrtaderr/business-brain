// Lane A — the grounding gate. The deterministic control on a probabilistic
// generator: it takes the generator's candidate facts and visuals and decides,
// from the corpus alone, which may stand. Nothing it refuses is a matter of
// opinion; whether the answer is any good is the evals rubric's job, not this
// file's.
//
// Two rules, each mirroring account-scout's citation gate:
//
//  - A FACT stands only if it carries at least one grounding whose quote appears
//    verbatim in the named corpus doc. A candidate's fabricated groundings are
//    dropped; the fact survives on its valid ones. A fact with zero valid
//    groundings is not deleted — it becomes a Refusal, listed in the answer, so
//    what the generator tried to assert without evidence stays visible.
//
//  - A VISUAL may only reference facts that CLEARED the gate. A visual pointing
//    at a refused or invented fact id would draw a number the corpus does not
//    contain, so it is dropped and recorded as a refused visual.

import { makeFact, makeRefusal, validateGroundingAgainstCorpus } from "../types.mjs";

/**
 * Decide which candidate facts may stand.
 *
 * @param {object} args
 * @param {Array<{id: string, text: string, groundings: Array<{docId: string, quote: string}>}>} args.candidates
 * @param {Array<object>} args.corpus CanonDoc[]
 * @returns {{facts: Array<object>, refusals: Array<object>}}
 */
export function gateFacts({ candidates, corpus }) {
  if (!Array.isArray(candidates)) throw new Error("gateFacts needs a candidates array");
  if (!Array.isArray(corpus)) throw new Error("gateFacts needs a corpus array");

  const facts = [];
  const refusals = [];

  for (const candidate of candidates) {
    const groundings = Array.isArray(candidate.groundings) ? candidate.groundings : [];
    const valid = [];
    const reasons = [];
    for (const g of groundings) {
      const verdict = validateGroundingAgainstCorpus(g, corpus);
      if (verdict.ok) valid.push(g);
      else reasons.push(verdict.reason);
    }

    if (valid.length === 0) {
      // No evidence held. The reason names why — the generator's own quote and
      // where it failed — so a refused fact teaches rather than just vanishing.
      const why =
        reasons.length > 0
          ? reasons.join("; ")
          : "no grounding was offered — an ungrounded statement cannot be drawn";
      refusals.push(makeRefusal({ text: candidate.text, reason: why }));
      continue;
    }

    facts.push(makeFact({ id: candidate.id, text: candidate.text, groundings: valid }));
  }

  return { facts, refusals };
}

/**
 * Decide which visuals may draw. A visual survives only if every fact id it
 * references cleared the gate.
 *
 * @param {object} args
 * @param {Array<{kind: string, title: string, factIds: string[], body: object}>} args.visuals
 * @param {Array<{id: string}>} args.facts the facts that cleared gateFacts
 * @returns {{visuals: Array<object>, refusedVisuals: Array<{title: string, reason: string}>}}
 */
export function gateVisuals({ visuals, facts }) {
  if (!Array.isArray(visuals)) throw new Error("gateVisuals needs a visuals array");
  if (!Array.isArray(facts)) throw new Error("gateVisuals needs a facts array");

  const known = new Set(facts.map((f) => f.id));
  const kept = [];
  const refusedVisuals = [];

  for (const visual of visuals) {
    const missing = (Array.isArray(visual.factIds) ? visual.factIds : []).filter((id) => !known.has(id));
    if (missing.length > 0) {
      refusedVisuals.push({
        title: visual.title,
        reason: `references fact id(s) that did not clear the gate: ${missing.join(", ")}`,
      });
      continue;
    }
    kept.push(visual);
  }

  return { visuals: kept, refusedVisuals };
}
