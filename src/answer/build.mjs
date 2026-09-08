// Lane D — the answer pipeline. One function composes the whole read path:
// generate candidates → gate the facts against the corpus → gate the visuals
// against the surviving facts → assemble a frozen Answer.
//
// FAIL CLOSED on an empty answer. A run that could not ground a single fact must
// REFUSE, not render a page with an empty grid that reads as "we looked and
// there is nothing to report." That is the same sentence account-scout refuses
// to let a zero-hop run emit. Refused facts are still carried — the caller may
// want to show the user what the corpus could not support — but a rendered
// answer requires at least one thing the canon actually says.

import { makeAnswer } from "../types.mjs";
import { gateFacts, gateVisuals } from "../gate/gate.mjs";
import { GenerationRefusal } from "../generate/errors.mjs";

/**
 * @param {object} args
 * @param {string} args.question the question text
 * @param {Array<object>} args.corpus CanonDoc[]
 * @param {object} args.generator recordedGenerator(...) or liveGenerator(...)
 * @param {() => string} [args.now] injectable clock (ISO with timezone)
 * @returns {Promise<object>} a frozen Answer
 * @throws {GenerationRefusal} when the run grounds no facts
 */
export async function buildAnswer({ question, corpus, generator, now = () => new Date().toISOString() }) {
  const { candidates, visuals, model } = await generator.generate({ question, corpus });

  const { facts, refusals } = gateFacts({ candidates: candidates ?? [], corpus });

  if (facts.length === 0) {
    throw new GenerationRefusal(
      `refusing to answer "${question}": the generator grounded nothing — every candidate fact ` +
        `failed the corpus check, and an answer with no grounded fact must not render a confident ` +
        `empty page. ${refusals.length} claim(s) were refused; check the corpus or the question.`,
    );
  }

  const { visuals: keptVisuals } = gateVisuals({ visuals: visuals ?? [], facts });

  const meta = { mode: generator.mode };
  if (model !== undefined) meta.model = model;

  return makeAnswer({
    question,
    generatedAt: now(),
    facts,
    refusals,
    visuals: keptVisuals,
    meta,
  });
}
