// Lane B — the live generator, driven with an INJECTED fetch so the whole
// surface is testable with no key and no network. It calls the Claude messages
// API over plain fetch, asks for grounded candidates + visuals as JSON, and
// fails closed on every error with the key scrubbed from the message.

import test from "node:test";
import assert from "node:assert/strict";

import { liveGenerator } from "../../src/generate/live.mjs";
import { GenerationRefusal } from "../../src/generate/errors.mjs";
import { makeCanonDoc } from "../../src/types.mjs";

const CORPUS = [makeCanonDoc({ id: "ads", title: "Ads", kind: "metric-def", content: "spend is thirty two thousand a month" })];
const KEY = "sk-ant-synthetic-live-test-key-0000";

/** A fake messages response carrying the model's JSON in a text content block. */
function fakeResponse(payload, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify({
        model: "claude-opus-5",
        content: [{ type: "text", text: JSON.stringify(payload) }],
      });
    },
    async json() {
      return {
        model: "claude-opus-5",
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  };
}

test("missing key refuses closed, before any fetch", async () => {
  let fetched = false;
  const gen = liveGenerator({}, { fetchImpl: async () => ((fetched = true), fakeResponse({})) });
  await assert.rejects(() => gen.generate({ question: "q", corpus: CORPUS }), GenerationRefusal);
  assert.equal(fetched, false, "no request is made without a key");
});

test("a well-formed response yields candidates, visuals, and the model name", async () => {
  const payload = {
    candidates: [{ id: "spend", text: "Spend is $32k/mo.", groundings: [{ docId: "ads", quote: "spend is thirty two thousand a month" }] }],
    visuals: [{ kind: "stat", title: "Spend", factIds: ["spend"], body: { value: "$32k" } }],
  };
  const gen = liveGenerator({ ANTHROPIC_API_KEY: KEY }, { fetchImpl: async () => fakeResponse(payload) });

  assert.equal(gen.mode, "live");
  const out = await gen.generate({ question: "how is spend?", corpus: CORPUS });
  assert.equal(out.candidates.length, 1);
  assert.equal(out.visuals[0].title, "Spend");
  assert.equal(out.model, "claude-opus-5");
});

test("an HTTP error fails closed and never echoes the key", async () => {
  const gen = liveGenerator(
    { ANTHROPIC_API_KEY: KEY },
    {
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async text() {
          return `unauthorized for key ${KEY}`; // upstream echoes the key back
        },
      }),
    },
  );
  await assert.rejects(
    () => gen.generate({ question: "q", corpus: CORPUS }),
    (err) => {
      assert.ok(err instanceof GenerationRefusal);
      assert.doesNotMatch(err.message, new RegExp(KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the key must be scrubbed from the error");
      return true;
    },
  );
});

test("a response whose text is not valid JSON fails closed", async () => {
  const gen = liveGenerator(
    { ANTHROPIC_API_KEY: KEY },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { model: "claude-opus-5", content: [{ type: "text", text: "here is your answer, not json" }] };
        },
      }),
    },
  );
  await assert.rejects(() => gen.generate({ question: "q", corpus: CORPUS }), GenerationRefusal);
});
