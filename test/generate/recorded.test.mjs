// Lane B — the recorded generator. Replays a committed transcript keylessly and
// UNJUDGED: the fabricated candidate and its backing visual pass straight
// through, so the gate downstream has something real to refuse. Fail closed on a
// missing or malformed transcript rather than generating nothing quietly.

delete process.env.ANTHROPIC_API_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { recordedGenerator } from "../../src/generate/recorded.mjs";
import { loadCorpus } from "../../src/corpus/load.mjs";
import { gateFacts, gateVisuals } from "../../src/gate/gate.mjs";
import { GenerationRefusal } from "../../src/generate/errors.mjs";

const HARBOR = fileURLToPath(new URL("../../fixtures/harbor-canon/", import.meta.url));
const ADS = fileURLToPath(new URL("../../fixtures/harbor-answers/ads.json", import.meta.url));

test("the recorded generator replays candidates and visuals UNJUDGED, fabrication included", async () => {
  const gen = recordedGenerator(ADS);
  assert.equal(gen.mode, "recorded");
  assert.equal(gen.model, undefined);

  const { candidates, visuals } = await gen.generate({ question: "how are the ads performing?", corpus: [] });
  assert.equal(candidates.length, 4, "all four candidates pass through, fabrication included");
  assert.ok(candidates.some((c) => c.id === "revgrowth"), "the fabricated candidate is not filtered by the generator");
  assert.equal(visuals.length, 4);
});

test("run through the gate, the fabricated fact is refused and its visual is dropped", async () => {
  const corpus = loadCorpus(HARBOR);
  const gen = recordedGenerator(ADS);
  const { candidates, visuals } = await gen.generate({ question: "how are the ads performing?", corpus });

  const { facts, refusals } = gateFacts({ candidates, corpus });
  assert.equal(facts.length, 3, "three grounded facts stand");
  assert.equal(refusals.length, 1, "the revenue fabrication is refused, not dropped");
  assert.match(refusals[0].text, /fifty percent increase in revenue/);

  const { visuals: kept, refusedVisuals } = gateVisuals({ visuals, facts });
  assert.equal(kept.length, 3, "the three grounded visuals draw");
  assert.equal(refusedVisuals.length, 1, "the visual backed by the fabricated fact is dropped");
  assert.match(refusedVisuals[0].reason, /revgrowth/);
});

test("a missing transcript refuses closed", () => {
  assert.throws(() => recordedGenerator(join(tmpdir(), "no-such-transcript.json")), GenerationRefusal);
});

test("a malformed transcript refuses closed, naming the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-gen-"));
  const path = join(dir, "bad.json");
  writeFileSync(path, "{ not valid json", "utf8");
  assert.throws(() => recordedGenerator(path), (err) => {
    assert.ok(err instanceof GenerationRefusal);
    assert.match(err.message, /bad\.json/);
    return true;
  });
});
