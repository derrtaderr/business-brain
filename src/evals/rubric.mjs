// The evals layer, semantic half — the LLM rubric. The lexical scorer
// (faithfulness.mjs) catches a claim whose WORDS stray from its quote; this
// catches one whose MEANING does even when the words overlap: an LLM judge asked,
// per fact, whether the grounding quote actually supports the claim. It is the
// judgment the SPEC always said belonged here, and it is live-only by nature.
//
// FAIL CLOSED, and SILENCE IS NOT A PASS. Missing key, HTTP error, malformed
// response — each is a refusal, never a quiet pass. A fact the judge returns no
// verdict for is treated as UNsupported (BLOCK), because an answer that slipped a
// fact past the judge by omission must not read as clean. THE KEY NEVER LEAVES:
// sent to api.anthropic.com only, never in the prompt, scrubbed from every error.

import { GenerationRefusal, scrubText } from "../generate/errors.mjs";

const MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-opus-5";
const MAX_TOKENS = 2048;

const SYSTEM = [
  "You are a strict faithfulness judge. For each claim you are given its verbatim evidence quote.",
  "Decide, per claim, whether the claim is FULLY supported by its evidence — not merely on the same topic.",
  "A claim that adds a fact the quote does not state, or changes its meaning, is NOT supported.",
  'Return ONLY JSON of the form: { "judgments": [ { "id": string, "supported": boolean, "reason": string } ] }',
  "Include one judgment per claim id you were given, no more.",
].join("\n");

function buildUserContent(facts) {
  return facts
    .map((f) => `id: ${f.id}\nclaim: ${f.text}\nevidence: ${f.groundings.map((g) => g.quote).join(" / ")}`)
    .join("\n\n");
}

function parsePayload(body) {
  const block = (body.content ?? []).find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") throw new Error("no text content block in the response");
  const unfenced = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(unfenced);
}

/**
 * Judge each fact's semantic faithfulness to its quote.
 *
 * @param {object} args
 * @param {object} args.answer a frozen Answer
 * @param {object} [args.env] process.env
 * @param {Function} [args.fetchImpl]
 * @param {string} [args.model]
 * @returns {Promise<{status: "PASS"|"BLOCK", judgments: Array<{id: string, supported: boolean, reason: string}>, reasons: string[]}>}
 * @throws {GenerationRefusal} on missing key or any API/parse failure
 */
export async function judgeFaithfulness({ answer, env = process.env, fetchImpl = globalThis.fetch, model = DEFAULT_MODEL }) {
  if (answer.facts.length === 0) return { status: "PASS", judgments: [], reasons: [] };

  const apiKey = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey)
    throw new GenerationRefusal(
      "the faithfulness judge needs ANTHROPIC_API_KEY and the environment does not set it. Refusing outright — " +
        "run without --judge for the keyless lexical check, or export ANTHROPIC_API_KEY.",
    );

  let res;
  try {
    res = await fetchImpl(MESSAGES_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: "user", content: buildUserContent(answer.facts) }] }),
    });
  } catch (err) {
    throw new GenerationRefusal(`the judge could not reach the API: ${scrubText(err.message, [apiKey])}`, { cause: err });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GenerationRefusal(`the judge got HTTP ${res.status} from the API: ${scrubText(body, [apiKey]).slice(0, 200)}`);
  }

  let payload;
  try {
    payload = parsePayload(await res.json());
  } catch (err) {
    throw new GenerationRefusal(`the judge response could not be parsed: ${scrubText(err.message, [apiKey])}`, { cause: err });
  }

  const byId = new Map((Array.isArray(payload.judgments) ? payload.judgments : []).map((j) => [j.id, j]));

  // Every fact needs a verdict. A fact the judge did not rule on is treated as
  // UNsupported — silence must not read as a pass.
  const judgments = [];
  const reasons = [];
  for (const f of answer.facts) {
    const j = byId.get(f.id);
    if (!j) {
      judgments.push({ id: f.id, supported: false, reason: "the judge returned no verdict for this fact" });
      reasons.push(`fact "${f.id}" was not judged — no verdict returned, treated as unsupported (silence is not a pass)`);
      continue;
    }
    const supported = j.supported === true;
    judgments.push({ id: f.id, supported, reason: String(j.reason ?? "") });
    if (!supported) reasons.push(`fact "${f.id}" is not supported by its evidence — ${j.reason ?? "the judge marked it unsupported"}`);
  }

  return { status: reasons.length > 0 ? "BLOCK" : "PASS", judgments, reasons };
}
