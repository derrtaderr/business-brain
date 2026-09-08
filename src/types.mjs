// The shared contract. FROZEN for the lanes: every lane codes to these shapes,
// and a change here is a cross-lane event that goes through the orchestrator,
// never one lane's discretion. Plain-object factories + validators, house style.
//
// The load-bearing idea, identical in spirit to account-scout: a Grounding is
// CHECKABLE. Its quote must appear verbatim in a canon doc's content, so
// "grounded" is a property the code can decide, not a claim the generator makes
// about itself. Everything the deterministic gate refuses is decidable from
// these shapes alone; judgment (does this answer the question) belongs to the
// evals rubric.

/** The evidential floor, in trimmed characters. A quote shorter than this
 *  appears in almost any document, so the deterministic check would pass it and
 *  "every fact is grounded" would become a formality. The floor is what makes a
 *  passing grounding carry information. Raised here by the orchestrator; a lane
 *  must not change it. */
export const MIN_QUOTE_LENGTH = 20;

export const DOC_KINDS = Object.freeze(["system-map", "metric-def", "concept"]);
export const VISUAL_KINDS = Object.freeze(["verdict-card", "progress-bar", "diagram", "stat"]);
export const MODES = Object.freeze(["live", "recorded"]);

/** A validated question. Throws naming the missing field, never a silent
 *  default — an unverified question must not become an answer. */
export function makeQuestion({ text, scope }) {
  if (typeof text !== "string" || text.trim() === "")
    throw new Error("Question needs a non-empty text");
  if (scope !== undefined && typeof scope !== "string")
    throw new Error("Question scope, when given, is a string");
  return Object.freeze({ text: text.trim(), scope: scope?.trim() });
}

/** One canon document. The corpus is what groundings bind against. */
export function makeCanonDoc({ id, title, content, kind }) {
  for (const [k, v] of Object.entries({ id, title, content }))
    if (typeof v !== "string" || v === "") throw new Error(`CanonDoc ${k} must be a non-empty string`);
  if (!DOC_KINDS.includes(kind))
    throw new Error(`CanonDoc kind must be one of ${DOC_KINDS.join("/")}, got ${JSON.stringify(kind)}`);
  return Object.freeze({ id, title, content, kind });
}

/** A grounding. `quote` must appear verbatim in the content of the doc named by
 *  `docId`, in the corpus this run — validateGroundingAgainstCorpus decides that. */
export function makeGrounding({ docId, quote }) {
  for (const [k, v] of Object.entries({ docId, quote }))
    if (typeof v !== "string" || v === "") throw new Error(`Grounding ${k} must be a non-empty string`);
  const trimmed = quote.trim().length;
  if (trimmed < MIN_QUOTE_LENGTH)
    throw new Error(
      `Grounding quote must carry at least ${MIN_QUOTE_LENGTH} trimmed characters to count as evidence, got ${trimmed} — ` +
        `a trivial quote matches almost any document, which would let the gate bless a fabricated fact`,
    );
  return Object.freeze({ docId, quote });
}

/** The decidable half of "is this grounded": the doc exists in the corpus and
 *  the quote appears verbatim in its content. Returns { ok, reason }. */
export function validateGroundingAgainstCorpus(grounding, corpus) {
  // Defensive: a grounding built by hand rather than by makeGrounding must not
  // bypass the floor. Checked before the doc lookup, because a trivial quote is
  // disqualifying on its own — no state of the corpus can rescue it.
  const trimmed = typeof grounding.quote === "string" ? grounding.quote.trim().length : 0;
  if (trimmed < MIN_QUOTE_LENGTH)
    return { ok: false, reason: `quote is below the evidential floor (${trimmed} chars trimmed, minimum ${MIN_QUOTE_LENGTH})` };
  const doc = corpus.find((d) => d.id === grounding.docId);
  if (!doc) return { ok: false, reason: `grounding names a doc not in the corpus: ${grounding.docId}` };
  if (!doc.content.includes(grounding.quote))
    return { ok: false, reason: `quote does not appear in the content of ${grounding.docId}` };
  return { ok: true };
}

export function makeFact({ id, text, groundings }) {
  if (typeof id !== "string" || id === "") throw new Error("Fact needs an id");
  if (typeof text !== "string" || text === "") throw new Error("Fact needs text");
  if (!Array.isArray(groundings) || groundings.length === 0)
    throw new Error("Fact needs at least one grounding — an ungrounded statement is a Refusal, not a Fact");
  return Object.freeze({ id, text, groundings: Object.freeze([...groundings]) });
}

/** A would-be fact the gate refused. First-class output, never dropped. */
export function makeRefusal({ text, reason }) {
  if (typeof text !== "string" || text === "") throw new Error("Refusal needs the refused text");
  if (typeof reason !== "string" || reason === "") throw new Error("Refusal needs its reason");
  return Object.freeze({ text, reason });
}

/** A visual element. Its `factIds` reference Facts that CLEARED the gate, and
 *  its `evidence` is a verbatim quote from one of those facts' groundings — the
 *  canon text the visual is drawn FROM, shown on the card beside the presented
 *  value. The gate enforces that evidence is verbatim in a backing fact's quote,
 *  so a fabricated number can only ever be drawn beside visibly-unrelated canon,
 *  never hidden. `body` is the kind-specific presentation payload (the pretty
 *  "$900" form); `evidence` is the canon anchor ("nine hundred dollars…") that
 *  keeps that presentation honest. Whether the presentation faithfully restates
 *  the evidence is judgment, scored by the evals rubric, exposed by the shown
 *  quote — not something a substring check can decide. */
export function makeVisual({ kind, title, factIds, body, evidence }) {
  if (!VISUAL_KINDS.includes(kind))
    throw new Error(`Visual kind must be one of ${VISUAL_KINDS.join("/")}, got ${JSON.stringify(kind)}`);
  if (typeof title !== "string" || title === "") throw new Error("Visual needs a title");
  if (!Array.isArray(factIds) || factIds.length === 0)
    throw new Error("Visual needs at least one factId — a visual with no backing fact would draw ungrounded");
  if (body === undefined || body === null || typeof body !== "object")
    throw new Error("Visual needs a body object the renderer can draw");
  if (typeof evidence !== "string" || evidence.trim().length < MIN_QUOTE_LENGTH)
    throw new Error(
      `Visual needs an evidence quote of at least ${MIN_QUOTE_LENGTH} trimmed characters — the canon text it is ` +
        `drawn from, shown on the card. A visual with no evidence would present a number with nothing behind it`,
    );
  return Object.freeze({
    kind,
    title,
    factIds: Object.freeze([...factIds]),
    body: Object.freeze({ ...body }),
    evidence,
  });
}

export function makeAnswer({ question, generatedAt, facts, refusals, visuals, meta }) {
  if (typeof question !== "string" || question === "") throw new Error("Answer needs the question text");
  if (typeof generatedAt !== "string") throw new Error("Answer needs generatedAt (ISO, with timezone)");
  for (const [k, v] of Object.entries({ facts, refusals, visuals }))
    if (!Array.isArray(v)) throw new Error(`Answer ${k} must be an array`);
  if (!meta || !MODES.includes(meta.mode))
    throw new Error(`Answer meta.mode must be one of ${MODES.join("/")}`);
  if (meta.mode === "live" && (typeof meta.model !== "string" || meta.model === ""))
    throw new Error("A live answer must name the model that produced it (unattributed answers cannot be challenged)");
  return Object.freeze({
    question,
    generatedAt,
    facts: Object.freeze([...facts]),
    refusals: Object.freeze([...refusals]),
    visuals: Object.freeze([...visuals]),
    meta: Object.freeze({ ...meta }),
  });
}
