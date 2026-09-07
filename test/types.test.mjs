// The frozen contract. These lock the invariants every lane codes against, so a
// change to types.mjs that would loosen the gate breaks here first.

import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_QUOTE_LENGTH,
  makeQuestion,
  makeCanonDoc,
  makeGrounding,
  validateGroundingAgainstCorpus,
  makeFact,
  makeVisual,
  makeAnswer,
} from "../src/types.mjs";

test("a question needs non-empty text", () => {
  assert.throws(() => makeQuestion({ text: "  " }), /non-empty text/);
  assert.equal(makeQuestion({ text: " how do the ads perform? " }).text, "how do the ads perform?");
});

test("a grounding quote below the evidential floor is refused at construction", () => {
  assert.throws(() => makeGrounding({ docId: "d", quote: "short" }), new RegExp(String(MIN_QUOTE_LENGTH)));
  const ok = makeGrounding({ docId: "d", quote: "a quote long enough to actually carry evidence" });
  assert.equal(ok.docId, "d");
});

test("validateGroundingAgainstCorpus decides verbatim presence, and re-checks the floor defensively", () => {
  const corpus = [makeCanonDoc({ id: "d", title: "T", kind: "concept", content: "the north star is weekly qualified pipeline" })];
  assert.deepEqual(validateGroundingAgainstCorpus({ docId: "d", quote: "the north star is weekly qualified pipeline" }, corpus), { ok: true });
  // A hand-built below-floor grounding must not slip past.
  const short = validateGroundingAgainstCorpus({ docId: "d", quote: "north" }, corpus);
  assert.equal(short.ok, false);
  assert.match(short.reason, /evidential floor/);
});

test("a fact with zero groundings cannot be constructed — that is a Refusal's job", () => {
  assert.throws(() => makeFact({ id: "f", text: "x", groundings: [] }), /at least one grounding/);
});

test("a visual with no backing fact id cannot be constructed", () => {
  assert.throws(() => makeVisual({ kind: "stat", title: "T", factIds: [], body: {} }), /at least one factId/);
  assert.throws(() => makeVisual({ kind: "bogus", title: "T", factIds: ["f"], body: {} }), /Visual kind/);
});

test("a live answer must name its model; a recorded one need not", () => {
  const base = { question: "q", generatedAt: "2026-09-07T12:00:00.000Z", facts: [], refusals: [], visuals: [] };
  assert.throws(() => makeAnswer({ ...base, meta: { mode: "live" } }), /must name the model/);
  assert.equal(makeAnswer({ ...base, meta: { mode: "recorded" } }).meta.mode, "recorded");
  assert.equal(makeAnswer({ ...base, meta: { mode: "live", model: "claude-opus-5" } }).meta.model, "claude-opus-5");
});
