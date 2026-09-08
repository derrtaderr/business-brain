// The evals telemetry — every scored answer becomes one TelemetryEvent in the
// gtm-agent-evals JSONL store, so its dashboard reads business-brain's runs with
// no new format. Telemetry is a byte exit like any other, so the reasons (which
// carry fact ids and phrasing) are written POST-redaction.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readEvents } from "gtm-agent-evals/dist/index.js";

import { recordAnswerVerdict, ANSWER_CONFIG_ID } from "../../src/evals/telemetry.mjs";

const NOW = () => "2026-09-07T12:00:00.000Z";

test("a verdict becomes one TelemetryEvent readable by gtm-agent-evals", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-tel-"));
  const path = join(dir, "events.jsonl");

  await recordAnswerVerdict({
    verdict: { status: "PASS", reasons: [] },
    telemetryPath: path,
    runId: "run-1",
    now: NOW,
  });

  const events = readEvents(path);
  assert.equal(events.length, 1);
  assert.equal(events[0].verdict.status, "PASS");
  assert.equal(events[0].configId, ANSWER_CONFIG_ID);
  assert.equal(events[0].runId, "run-1");
});

test("reasons are written post-redaction — telemetry never carries a raw survivor", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-tel-"));
  const path = join(dir, "events.jsonl");

  await recordAnswerVerdict({
    verdict: { status: "BLOCK", reasons: ['fact "x" mentions Initech and strays'] },
    telemetryPath: path,
    runId: "run-2",
    now: NOW,
    redactText: (t) => t.replace(/Initech/g, "[client]"),
  });

  const events = readEvents(path);
  const joined = JSON.stringify(events[0]);
  assert.doesNotMatch(joined, /Initech/, "a rostered name must be scrubbed from telemetry");
  assert.match(joined, /\[client\]/);
});
