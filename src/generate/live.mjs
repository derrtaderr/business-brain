// Lane B — the live generator: the Claude messages API over plain fetch, no SDK,
// no third-party runtime dependency. It hands the model the question and the
// canon corpus and asks for grounded candidate facts and proposed visuals as
// JSON. It does NOT trust the model to have grounded honestly — every candidate
// still goes through the deterministic gate downstream. The generator's only job
// is to propose; the gate decides.
//
// FAIL CLOSED, EVERYWHERE. Missing key, HTTP error, network throw, malformed
// JSON — each is a GenerationRefusal, never a silent empty answer. THE KEY NEVER
// LEAVES: it is sent to api.anthropic.com and nowhere else, never interpolated
// into a prompt, and scrubbed from every error this file raises.

import { GenerationRefusal, scrubText } from "./errors.mjs";

const MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

const SYSTEM = [
  "You answer a question about a business using ONLY the canon documents provided.",
  "Every factual statement you propose MUST quote one of those documents verbatim.",
  "Return ONLY a JSON object, no prose, of the form:",
  '{ "candidates": [ { "id": string, "text": string, "groundings": [ { "docId": string, "quote": string } ] } ],',
  '  "visuals": [ { "kind": "verdict-card"|"progress-bar"|"diagram"|"stat", "title": string, "factIds": [string], "body": object } ] }',
  "A quote must be an exact substring of the named document. A visual's factIds must reference candidate ids.",
  "If you cannot ground a claim, leave it out — do not invent a quote.",
].join("\n");

function buildUserContent(question, corpus) {
  const docs = corpus
    .map((d) => `## doc id: ${d.id} (${d.kind}) — ${d.title}\n${d.content}`)
    .join("\n\n");
  return `Question: ${question}\n\nCanon documents:\n\n${docs}`;
}

/** Pull the model's JSON out of the first text content block. */
function parsePayload(body) {
  const block = (body.content ?? []).find((b) => b.type === "text");
  if (!block || typeof block.text !== "string") throw new Error("no text content block in the response");
  const trimmed = block.text.trim();
  // Tolerate a ```json fence if the model wraps it, but nothing else.
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(unfenced);
}

/**
 * @param {object} env process.env
 * @param {{fetchImpl?: Function, model?: string}} [opts]
 * @returns {{mode: "live", model: string, generate: (args: {question: string, corpus: Array}) => Promise<{candidates: Array, visuals: Array, model: string}>}}
 */
export function liveGenerator(env = process.env, { fetchImpl = globalThis.fetch, model = DEFAULT_MODEL } = {}) {
  return Object.freeze({
    mode: "live",
    model,

    async generate({ question, corpus }) {
      const apiKey = (env.ANTHROPIC_API_KEY ?? "").trim();
      if (!apiKey)
        throw new GenerationRefusal(
          "live mode needs ANTHROPIC_API_KEY and the environment does not set it. Refusing outright — " +
            "export ANTHROPIC_API_KEY, or run in recorded mode on purpose.",
        );

      let res;
      try {
        res = await fetchImpl(MESSAGES_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system: SYSTEM,
            messages: [{ role: "user", content: buildUserContent(question, corpus) }],
          }),
        });
      } catch (err) {
        throw new GenerationRefusal(`live mode could not reach the API: ${scrubText(err.message, [apiKey])}`, {
          cause: err,
        });
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new GenerationRefusal(
          `live mode got HTTP ${res.status} from the API: ${scrubText(body, [apiKey]).slice(0, 200)}`,
        );
      }

      let payload;
      try {
        const body = await res.json();
        payload = parsePayload(body);
      } catch (err) {
        throw new GenerationRefusal(`live mode could not parse the response: ${scrubText(err.message, [apiKey])}`, {
          cause: err,
        });
      }

      return {
        candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
        visuals: Array.isArray(payload.visuals) ? payload.visuals : [],
        model,
      };
    },
  });
}
