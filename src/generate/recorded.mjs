// Lane B — the recorded generator. Replays a committed transcript keylessly and
// deterministically, the half of the strategy-benchmark pattern that lets CI and
// a stranger's first run reproduce a real answer exactly with no Anthropic key.
//
// It replays UNJUDGED. The transcript deliberately carries fabricated candidates
// and visuals that must not survive the gate; this generator hands all of them
// through untouched. If it filtered them, the gate could rot without a single
// test going red.
//
// Transcript format: { question, candidates: [{id, text, groundings}],
// visuals: [{kind, title, factIds, body}] }.

import { readFileSync } from "node:fs";

import { GenerationRefusal } from "./errors.mjs";

/**
 * @param {string} transcriptPath a committed transcript JSON
 * @returns {{mode: "recorded", model: undefined, generate: (args: object) => Promise<{candidates: Array, visuals: Array}>}}
 * @throws {GenerationRefusal} when the transcript is missing or malformed
 */
export function recordedGenerator(transcriptPath) {
  let raw;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch (err) {
    throw new GenerationRefusal(
      `recorded mode cannot read the transcript at ${transcriptPath} — refusing rather than answering ` +
        `from nothing. Record one with { question, candidates, visuals }.`,
      { cause: err },
    );
  }

  let transcript;
  try {
    transcript = JSON.parse(raw);
  } catch (err) {
    throw new GenerationRefusal(`transcript ${transcriptPath} is not valid JSON: ${err.message}`, { cause: err });
  }

  const candidates = Object.freeze([...(transcript.candidates ?? [])]);
  const visuals = Object.freeze([...(transcript.visuals ?? [])]);

  return Object.freeze({
    mode: "recorded",
    // Nothing produced a recorded answer, so it names no model — the contract
    // only requires meta.model in live mode, which is exactly this distinction.
    model: undefined,
    question: transcript.question,

    async generate() {
      return { candidates, visuals };
    },
  });
}
