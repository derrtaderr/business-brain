// The refusal/defect boundary for generation, mirroring account-scout's
// ScoutRefusal. A GenerationRefusal is an EXPECTED failure the system is
// designed to produce and name (a missing transcript, a provider error, an
// answer that grounded nothing). Anything else thrown during generation is a
// DEFECT and must propagate untouched rather than be dressed up as a refusal.

export class GenerationRefusal extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "GenerationRefusal";
  }
}

/** Remove any of `secrets` from a string before it is raised in an error —
 *  upstream error bodies have been known to echo credentials straight back, so
 *  the key never rides out on a message this module throws. */
export function scrubText(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) {
    if (s) out = out.split(s).join("[redacted]");
  }
  return out;
}
