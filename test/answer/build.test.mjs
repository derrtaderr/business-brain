// Lane D — the answer pipeline. It composes the generator, both gates, and the
// contract into one frozen Answer: generate → gate the facts → gate the visuals
// → assemble. Fail closed when a run grounds NOTHING — an answer that could not
// ground a single fact must refuse, not render a confident empty page.

delete process.env.ANTHROPIC_API_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildAnswer } from "../../src/answer/build.mjs";
import { loadCorpus } from "../../src/corpus/load.mjs";
import { recordedGenerator } from "../../src/generate/recorded.mjs";
import { GenerationRefusal } from "../../src/generate/errors.mjs";

const HARBOR = fileURLToPath(new URL("../../fixtures/harbor-canon/", import.meta.url));
const ADS = fileURLToPath(new URL("../../fixtures/harbor-answers/ads.json", import.meta.url));
const NOW = () => "2026-09-07T12:00:00.000Z";

test("the pipeline grounds the true facts, refuses the fabrication, and drops its visual", async () => {
  const corpus = loadCorpus(HARBOR);
  const answer = await buildAnswer({
    question: "how are the ads performing?",
    corpus,
    generator: recordedGenerator(ADS),
    now: NOW,
  });

  assert.equal(answer.facts.length, 3);
  assert.equal(answer.refusals.length, 1);
  assert.match(answer.refusals[0].text, /fifty percent increase in revenue/);
  assert.equal(answer.visuals.length, 3, "the visual backed by the fabricated fact is gone");
  assert.equal(answer.meta.mode, "recorded");
  assert.equal(answer.generatedAt, "2026-09-07T12:00:00.000Z");
});

test("a run that grounds NOTHING refuses rather than rendering an empty confident page", async () => {
  const corpus = loadCorpus(HARBOR);
  // A generator whose only candidate is fabricated — nothing will ground.
  const generator = {
    mode: "recorded",
    async generate() {
      return {
        candidates: [{ id: "x", text: "Revenue doubled.", groundings: [{ docId: "ads", quote: "revenue doubled overnight without any effort" }] }],
        visuals: [],
      };
    },
  };
  await assert.rejects(
    () => buildAnswer({ question: "did revenue double?", corpus, generator, now: NOW }),
    (err) => {
      assert.ok(err instanceof GenerationRefusal);
      assert.match(err.message, /grounded nothing|no fact/i);
      return true;
    },
  );
});

test("a live answer carries the model name through to meta", async () => {
  const corpus = loadCorpus(HARBOR);
  const generator = {
    mode: "live",
    model: "claude-opus-5",
    async generate() {
      return {
        candidates: [{ id: "spend", text: "Spend is $32k/mo.", groundings: [{ docId: "ads", quote: "spends thirty two thousand dollars a month on LinkedIn ads" }] }],
        visuals: [{ kind: "stat", title: "Spend", factIds: ["spend"], evidence: "spends thirty two thousand dollars a month on LinkedIn ads", body: { value: "$32k" } }],
        model: "claude-opus-5",
      };
    },
  };
  const answer = await buildAnswer({ question: "spend?", corpus, generator, now: NOW });
  assert.equal(answer.meta.mode, "live");
  assert.equal(answer.meta.model, "claude-opus-5");
});
