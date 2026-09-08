// The evals telemetry. A scored answer becomes one TelemetryEvent in the
// gtm-agent-evals JSONL store, written through that library's own sink, so its
// dashboard reads business-brain's runs with no bespoke format. This is the real
// reuse: business-brain owns the faithfulness judgment; gtm-agent-evals owns the
// telemetry shape and the dashboard over it.
//
// Telemetry is a byte exit like any other, so every reason string is written
// POST-redaction — a reason names fact phrasing, which could carry a rostered
// client name, and events.jsonl must be as safe as the report file. The
// timestamp always carries a timezone (toISOString's Z does); the library's
// reader refuses tz-less ones.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { makeJsonlSink } from "gtm-agent-evals/dist/index.js";

/** The configId every business-brain answer is scored under. */
export const ANSWER_CONFIG_ID = "business-brain-faithfulness";
export const ANSWER_ARCHETYPE = "grounded-answer";

// Resolved against the PACKAGE root, not the process cwd, so a CLI run from
// anywhere records to one telemetry file rather than scattering the history.
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TELEMETRY_PATH = resolve(PACKAGE_ROOT, "telemetry", "events.jsonl");

/**
 * Append one faithfulness verdict to the telemetry.
 *
 * @param {object} args
 * @param {{status: string, reasons?: string[]}} args.verdict
 * @param {string} [args.telemetryPath]
 * @param {string} [args.runId]
 * @param {() => string} [args.now]
 * @param {(t: string) => string} [args.redactText] applied to every reason
 * @returns {Promise<object>} the TelemetryEvent as written
 */
export async function recordAnswerVerdict({
  verdict,
  telemetryPath = TELEMETRY_PATH,
  runId = randomUUID(),
  now = () => new Date().toISOString(),
  redactText,
}) {
  const scrub = redactText ?? ((t) => t);
  const event = {
    runId,
    timestamp: now(),
    configId: ANSWER_CONFIG_ID,
    archetype: ANSWER_ARCHETYPE,
    verdict: {
      status: verdict.status,
      violations: [],
      reasons: (verdict.reasons ?? []).map(scrub),
    },
  };
  await makeJsonlSink(telemetryPath)(event);
  return event;
}
