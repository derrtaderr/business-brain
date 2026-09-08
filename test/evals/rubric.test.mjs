// The evals layer, semantic half. The lexical scorer catches a claim whose WORDS
// stray from its quote; this catches a claim whose MEANING does, even when the
// words overlap — an LLM judge asked, per fact, whether the quote actually
// supports the claim. Live-only by nature, driven here with an INJECTED fetch so
// the whole surface is keyless-testable. Fails closed with the key scrubbed.

import test from "node:test";
import assert from "node:assert/strict";

import { judgeFaithfulness } from "../../src/evals/rubric.mjs";
import { GenerationRefusal } from "../../src/generate/errors.mjs";
import { makeAnswer, makeFact } from "../../src/types.mjs";

const KEY = "sk-ant-synthetic-rubric-key-000000";

function answerWith(facts) {
  return makeAnswer({ question: "q", generatedAt: "2026-09-07T12:00:00.000Z", facts, refusals: [], visuals: [], meta: { mode: "recorded" } });
}

const F1 = makeFact({ id: "cpo", text: "Cost per opportunity is nine hundred dollars.", groundings: [{ docId: "ads", quote: "cost per qualified opportunity is nine hundred dollars, down from fourteen hundred" }] });
const F2 = makeFact({ id: "spin", text: "The company is about to be acquired.", groundings: [{ docId: "ads", quote: "spends thirty two thousand dollars a month on LinkedIn ads" }] });

/** A fake messages response carrying the judge's JSON verdict array. */
function fakeJudge(judgments, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { model: "claude-opus-5", content: [{ type: "text", text: JSON.stringify({ judgments }) }] };
    },
    async text() {
      return "err";
    },
  };
}

test("all facts supported → PASS", async () => {
  const fetchImpl = async () => fakeJudge([{ id: "cpo", supported: true, reason: "the quote states the number" }]);
  const verdict = await judgeFaithfulness({ answer: answerWith([F1]), env: { ANTHROPIC_API_KEY: KEY }, fetchImpl });
  assert.equal(verdict.status, "PASS");
});

test("a fact the quote does not support → BLOCK, naming it", async () => {
  const fetchImpl = async () =>
    fakeJudge([
      { id: "cpo", supported: true, reason: "stated" },
      { id: "spin", supported: false, reason: "the quote is about ad spend, not an acquisition" },
    ]);
  const verdict = await judgeFaithfulness({ answer: answerWith([F1, F2]), env: { ANTHROPIC_API_KEY: KEY }, fetchImpl });
  assert.equal(verdict.status, "BLOCK");
  assert.ok(verdict.reasons.some((r) => /spin/.test(r)));
  assert.match(verdict.reasons.find((r) => /spin/.test(r)), /acquisition/);
});

test("missing key refuses closed before any request", async () => {
  let called = false;
  const fetchImpl = async () => ((called = true), fakeJudge([]));
  await assert.rejects(() => judgeFaithfulness({ answer: answerWith([F1]), env: {}, fetchImpl }), GenerationRefusal);
  assert.equal(called, false);
});

test("an HTTP error fails closed and never echoes the key", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, async text() { return `bad key ${KEY}`; } });
  await assert.rejects(
    () => judgeFaithfulness({ answer: answerWith([F1]), env: { ANTHROPIC_API_KEY: KEY }, fetchImpl }),
    (err) => {
      assert.ok(err instanceof GenerationRefusal);
      assert.doesNotMatch(err.message, new RegExp(KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return true;
    },
  );
});

test("a missing judgment for a fact fails closed — silence is not a pass", async () => {
  // The judge returns nothing for f2. An un-judged fact must not be treated as
  // supported; the whole answer fails closed rather than passing on silence.
  const fetchImpl = async () => fakeJudge([{ id: "cpo", supported: true, reason: "ok" }]);
  const verdict = await judgeFaithfulness({ answer: answerWith([F1, F2]), env: { ANTHROPIC_API_KEY: KEY }, fetchImpl });
  assert.equal(verdict.status, "BLOCK");
  assert.ok(verdict.reasons.some((r) => /spin/.test(r) && /not judged|no verdict/i.test(r)));
});

test("an answer with no facts is PASS vacuously and makes no call", async () => {
  let called = false;
  const fetchImpl = async () => ((called = true), fakeJudge([]));
  const verdict = await judgeFaithfulness({ answer: answerWith([]), env: { ANTHROPIC_API_KEY: KEY }, fetchImpl });
  assert.equal(verdict.status, "PASS");
  assert.equal(called, false, "no facts, no reason to call the judge");
});
