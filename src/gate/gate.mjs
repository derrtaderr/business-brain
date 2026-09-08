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

import { makeFact, makeVisual, makeRefusal, validateGroundingAgainstCorpus } from "../types.mjs";

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
      refusals.push(makeRefusal({ text: candidate.text || "(no text)", reason: why }));
      continue;
    }

    // A candidate that grounds but is otherwise malformed (empty text/id) must
    // be REFUSED, not crash the whole answer — one quirky element from a live
    // generator is a refusal, not a defect.
    try {
      facts.push(makeFact({ id: candidate.id, text: candidate.text, groundings: valid }));
    } catch (err) {
      refusals.push(makeRefusal({ text: candidate.text || "(malformed candidate)", reason: `malformed fact: ${err.message}` }));
    }
  }

  return { facts, refusals };
}

/**
 * Decide which visuals may draw. A visual survives only if:
 *   1. every fact id it references cleared the gate, AND
 *   2. its `evidence` is a verbatim substring of a backing fact's grounding
 *      quote (the canon text the card is drawn from), AND
 *   3. it is a well-formed Visual (malformed → refused, never a crash).
 *
 * Rule 2 is the strengthening: a visual can no longer carry an arbitrary
 * `evidence` — it must quote the same canon the fact stood on. A fabricated
 * number can then only ever be drawn beside canon that visibly does not say it,
 * because the renderer shows the evidence. Whether the presented number
 * faithfully restates that evidence is judgment (the evals rubric's job, exposed
 * by the shown quote), not something this gate pretends to decide.
 *
 * @param {object} args
 * @param {Array<object>} args.visuals raw generator visuals
 * @param {Array<{id: string, groundings: Array<{quote: string}>}>} args.facts the cleared facts
 * @returns {{visuals: Array<object>, refusedVisuals: Array<{title: string, reason: string}>}}
 */
export function gateVisuals({ visuals, facts }) {
  if (!Array.isArray(visuals)) throw new Error("gateVisuals needs a visuals array");
  if (!Array.isArray(facts)) throw new Error("gateVisuals needs a facts array");

  const byId = new Map(facts.map((f) => [f.id, f]));
  const kept = [];
  const refusedVisuals = [];

  for (const visual of visuals) {
    const factIds = Array.isArray(visual.factIds) ? visual.factIds : [];
    const missing = factIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      refusedVisuals.push({
        title: visual.title ?? "(untitled visual)",
        reason: `references fact id(s) that did not clear the gate: ${missing.join(", ")}`,
      });
      continue;
    }

    // The canon the backing facts stood on. The visual's evidence must quote it.
    const backingQuotes = factIds
      .flatMap((id) => byId.get(id).groundings.map((g) => g.quote))
      .join("\n");
    if (typeof visual.evidence !== "string" || !backingQuotes.includes(visual.evidence)) {
      refusedVisuals.push({
        title: visual.title ?? "(untitled visual)",
        reason: "its evidence quote is not verbatim in any backing fact's grounding — a visual must be drawn from the same canon its facts stand on",
      });
      continue;
    }

    // Construct through makeVisual so a malformed visual is refused, not a crash.
    try {
      kept.push(makeVisual(visual));
    } catch (err) {
      refusedVisuals.push({ title: visual.title ?? "(malformed visual)", reason: `malformed visual: ${err.message}` });
    }
  }

  return { visuals: kept, refusedVisuals };
}
