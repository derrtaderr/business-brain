// The evals layer — the SECOND control in the thesis. The deterministic gate
// anchors every claim to a verbatim canon quote; this scores how faithfully the
// claim's own words track that quote. It is a lexical measure, honest about what
// it is: it catches a paraphrase that strays wildly from its evidence (the
// fabrication the review worried about), not subtle semantic drift — that is the
// LLM rubric's job, named as the upgrade, exposed meanwhile by the shown quotes.

import test from "node:test";
import assert from "node:assert/strict";

import { makeAnswer, makeFact } from "../../src/types.mjs";
import { scoreFaithfulness, FAITHFULNESS_FLOOR } from "../../src/evals/faithfulness.mjs";

function answerWith(facts) {
  return makeAnswer({
    question: "q",
    generatedAt: "2026-09-07T12:00:00.000Z",
    facts,
    refusals: [],
    visuals: [],
    meta: { mode: "recorded" },
  });
}

const FAITHFUL = makeFact({
  id: "cpo",
  text: "The blended cost per qualified opportunity is nine hundred dollars, down from fourteen hundred a quarter ago.",
  groundings: [{ docId: "ads", quote: "blended cost per qualified opportunity is nine hundred dollars, down from fourteen hundred a quarter ago" }],
});

const STRAYING = makeFact({
  id: "doom",
  text: "Harbor is insolvent and drove a ninety percent revenue collapse this year.",
  groundings: [{ docId: "ads", quote: "spends thirty two thousand dollars a month on LinkedIn ads" }],
});

test("a fact that closely tracks its quote scores high and passes", () => {
  const verdict = scoreFaithfulness(answerWith([FAITHFUL]));
  assert.equal(verdict.status, "PASS");
  const score = verdict.factScores.find((s) => s.id === "cpo");
  assert.ok(score.overlap >= FAITHFULNESS_FLOOR, `a faithful paraphrase should clear the floor, got ${score.overlap}`);
  assert.equal(score.weak, false);
});

test("a fact that strays from its quote scores low and is flagged weak", () => {
  const verdict = scoreFaithfulness(answerWith([STRAYING]));
  const score = verdict.factScores.find((s) => s.id === "doom");
  assert.ok(score.overlap < FAITHFULNESS_FLOOR, `a fabricated paraphrase should fall below the floor, got ${score.overlap}`);
  assert.equal(score.weak, true);
});

test("the verdict BLOCKs when any fact is weak, and names it", () => {
  const verdict = scoreFaithfulness(answerWith([FAITHFUL, STRAYING]));
  assert.equal(verdict.status, "BLOCK");
  assert.ok(verdict.reasons.some((r) => /doom/.test(r)), "the reason names the weak fact");
});

test("the verdict PASSes when every fact clears the floor", () => {
  const verdict = scoreFaithfulness(answerWith([FAITHFUL]));
  assert.equal(verdict.status, "PASS");
  assert.equal(verdict.reasons.length, 0);
});

test("the floor is configurable — a stricter floor blocks a borderline paraphrase", () => {
  const borderline = makeFact({
    id: "b",
    text: "Harbor spends money monthly on advertising channels widely.",
    groundings: [{ docId: "ads", quote: "spends thirty two thousand dollars a month on LinkedIn ads" }],
  });
  const lenient = scoreFaithfulness(answerWith([borderline]), { floor: 0.1 });
  const strict = scoreFaithfulness(answerWith([borderline]), { floor: 0.95 });
  assert.equal(lenient.status, "PASS");
  assert.equal(strict.status, "BLOCK");
});

test("an answer with no facts scores PASS vacuously — buildAnswer already refuses the empty case", () => {
  const verdict = scoreFaithfulness(answerWith([]));
  assert.equal(verdict.status, "PASS");
  assert.equal(verdict.factScores.length, 0);
});
