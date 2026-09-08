// The evals layer — the second control in "deterministic controls for
// probabilistic systems." The gate ANCHORS every claim to a verbatim canon
// quote; this SCORES how faithfully the claim's own words track that quote.
//
// Be honest about what this is: a LEXICAL fidelity measure. It computes how much
// of a fact's content is literally present in its grounding quote. A faithful
// paraphrase reuses the quote's terms and scores high; a claim that strays from
// its evidence — "insolvent, 90% collapse" bolted onto a quote about ad spend —
// shares almost nothing and scores near zero. That catches the gross fabrication
// the gate can't (a real-but-unrelated quote on a false claim), deterministically
// and keylessly. It does NOT catch subtle semantic drift; that is the LLM
// rubric's job (the named upgrade), and meanwhile the renderer's shown quotes
// expose it to the reader. This layer never claims to be the semantic judge.

/** The share of a fact's significant tokens that must appear in its quote for
 *  the fact to be considered faithful. Tunable per call. */
export const FAITHFULNESS_FLOOR = 0.5;

const STOPWORDS = new Set([
  "the", "and", "a", "an", "of", "to", "is", "are", "was", "were", "in", "on", "for",
  "with", "that", "this", "it", "as", "at", "by", "its", "from", "be", "or", "has", "had",
]);

/** Significant content tokens: lowercase alphanumeric runs of length >= 3 that
 *  are not stopwords. Numbers spelled as words ("nine", "hundred") count; pure
 *  punctuation and short glue words do not. */
export function significantTokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

/** Lexical overlap: fraction of a fact's significant tokens present in the
 *  concatenated text of its grounding quotes. 1.0 = every content word of the
 *  claim is in its evidence; 0.0 = the claim shares nothing with what it cites. */
export function lexicalOverlap(factText, quoteText) {
  const factTokens = significantTokens(factText);
  if (factTokens.size === 0) return 1; // nothing to contradict — vacuously faithful
  const quoteTokens = significantTokens(quoteText);
  let hit = 0;
  for (const t of factTokens) if (quoteTokens.has(t)) hit += 1;
  return hit / factTokens.size;
}

/**
 * Score an answer's facts for lexical faithfulness to their quotes.
 *
 * @param {object} answer a frozen Answer
 * @param {{floor?: number}} [opts]
 * @returns {{status: "PASS"|"BLOCK", factScores: Array<{id: string, overlap: number, weak: boolean}>, reasons: string[]}}
 */
export function scoreFaithfulness(answer, { floor = FAITHFULNESS_FLOOR } = {}) {
  const factScores = answer.facts.map((f) => {
    const quoteText = f.groundings.map((g) => g.quote).join("\n");
    const overlap = lexicalOverlap(f.text, quoteText);
    return { id: f.id, overlap, weak: overlap < floor };
  });

  const reasons = factScores
    .filter((s) => s.weak)
    .map(
      (s) =>
        `fact "${s.id}" strays from its evidence — only ${(s.overlap * 100).toFixed(0)}% of its words appear in ` +
        `its grounding quote (floor ${(floor * 100).toFixed(0)}%). The claim may not be what the canon says; ` +
        `check it against the quote shown on the page.`,
    );

  return {
    status: reasons.length > 0 ? "BLOCK" : "PASS",
    factScores,
    reasons,
  };
}
