// Lane D — egress. Nothing leaves this process unguarded. The rendered HTML page
// is the one thing this build writes, and redaction-gate's guard() sits in front
// of that write: precise redaction first (a rostered client name becomes its
// placeholder and the page ships as a working document), then the paranoid scan,
// and a survivor REFUSES the write before the file is ever created. The refusal
// names classes and positions, never values — redaction-gate's own guarantee.
//
// The roster is the operator's sensitive vocabulary (client names, people)
// supplied by config. Built-in detectors (secret/email/domain/phone/…) stay on:
// this module never passes a `patterns` block, so nothing is switched off.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGate } from "redaction-gate";

/**
 * @param {object} [opts]
 * @param {Array<{class: string, match: string[], as?: string}>} [opts.roster]
 * @param {string[]} [opts.allowDomains] hosts that are ours and fine to keep
 * @param {string[]} [opts.allow] literal strings that never become a finding
 * @returns {{gate: object, writeArtifact: (html: string, path: string) => Promise<{path: string}>}}
 */
export function createEgress({ roster = [], allowDomains = [], allow = [] } = {}) {
  const config = { roster };
  if (allowDomains.length > 0) config.allowDomains = allowDomains;
  if (allow.length > 0) config.allow = allow;
  const gate = createGate(config);

  const writeGuarded = gate.guard(
    ({ path, text }) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, "utf8");
      return { path };
    },
    {
      label: "artifact-file",
      get: (p) => p.text,
      set: (p, text) => ({ ...p, text }),
    },
  );

  return {
    gate,
    /** Write the HTML to `path`, guarded. Throws RedactionRefusal with nothing
     *  on disk when a survivor trips the gate. */
    writeArtifact(html, path) {
      return writeGuarded({ path, text: html });
    },
  };
}
