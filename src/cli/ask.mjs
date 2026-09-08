// Lane D — `brain ask`. Composes the whole build: load the corpus, generate
// (recorded or live), gate + assemble the answer, render it, and write the page
// through the egress guard. Exit code is a contract: 0 delivered, 1 defect,
// 2 usage, 3 the system refused (grounded nothing, or egress caught a survivor —
// a decision, not a crash).

import { generateDashboard } from "gtm-agent-evals/dist/index.js";

import { loadCorpus } from "../corpus/load.mjs";
import { recordedGenerator } from "../generate/recorded.mjs";
import { liveGenerator } from "../generate/live.mjs";
import { buildAnswer } from "../answer/build.mjs";
import { renderAnswer } from "../render/render.mjs";
import { createEgress } from "../gates/egress.mjs";
import { scoreFaithfulness } from "../evals/faithfulness.mjs";
import { recordAnswerVerdict, TELEMETRY_PATH } from "../evals/telemetry.mjs";
import { GenerationRefusal } from "../generate/errors.mjs";
import { makeQuestion } from "../types.mjs";
import { UsageError } from "./args.mjs";

export const EXIT = Object.freeze({ DELIVERED: 0, DEFECT: 1, USAGE: 2, REFUSED: 3 });

/**
 * @param {object} opts a parsed `ask` options object
 * @param {object} deps { stdout, stderr, env?, now?, makeGenerator?, makeEgress? }
 * @returns {Promise<number>} an EXIT code
 */
export async function askCommand(opts, deps) {
  const { stdout, stderr, env = process.env, now = () => new Date().toISOString() } = deps;
  try {
    const question = makeQuestion({ text: opts.question }).text;

    // A corpus that cannot load is the USER's input to fix (wrong --corpus path,
    // an empty or malformed directory), not a defect in the tool. Mapped to a
    // usage exit here at the boundary where exit codes live, so a stranger who
    // points at the wrong folder is told their input was rejected, not that the
    // tool is broken.
    let corpus;
    try {
      corpus = loadCorpus(opts.corpus);
    } catch (err) {
      stderr.write(`corpus: ${err.message}\n`);
      return EXIT.USAGE;
    }

    const generator = deps.makeGenerator
      ? deps.makeGenerator(opts)
      : opts.mode === "live"
        ? liveGenerator(env)
        : recordedGenerator(opts.transcript);

    const answer = await buildAnswer({ question, corpus, generator, now });

    const egress = deps.makeEgress ? deps.makeEgress(opts) : createEgress();

    // The SECOND control: the gate anchored every claim to a verbatim quote; this
    // scores how faithfully each claim tracks that quote. The verdict is recorded
    // to telemetry either way (post-redaction) so the dashboard sees every run,
    // and in --strict mode a BLOCK refuses delivery.
    const verdict = scoreFaithfulness(answer);
    await recordAnswerVerdict({
      verdict,
      telemetryPath: opts.telemetry,
      redactText: egress.redactText,
      now,
    });

    if (opts.strict && verdict.status === "BLOCK") {
      stderr.write(`strict: refusing to deliver a low-faithfulness answer — ${verdict.reasons.join("; ")}\n`);
      return EXIT.REFUSED;
    }

    await egress.writeArtifact(renderAnswer(answer), opts.out);

    stdout.write(
      `brain: "${question}" — ${answer.facts.length} grounded fact(s), ${answer.refusals.length} refused, ` +
        `${answer.visuals.length} visual(s), faithfulness ${verdict.status} [${answer.meta.mode}] → ${opts.out}\n`,
    );
    return EXIT.DELIVERED;
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(err.message + "\n");
      return EXIT.USAGE;
    }
    if (err instanceof GenerationRefusal || err?.name === "RedactionRefusal") {
      stderr.write(err.message + "\n");
      return EXIT.REFUSED;
    }
    stderr.write(`unexpected error: ${err?.message ?? err}\n`);
    return EXIT.DEFECT;
  }
}

/**
 * `brain report` — render the faithfulness dashboard over the answer telemetry,
 * reusing gtm-agent-evals' static dashboard. A missing telemetry file renders an
 * honest empty dashboard, never a crash.
 *
 * @param {object} opts a parsed `report` options object
 * @param {object} deps { stdout, stderr }
 * @returns {Promise<number>} an EXIT code
 */
export async function reportCommand(opts, deps) {
  const { stdout, stderr } = deps;
  try {
    const telemetryPath = opts.telemetry ?? TELEMETRY_PATH;
    const written = generateDashboard(telemetryPath, opts.out, undefined, {});
    stdout.write(`dashboard written to ${written}\n`);
    return EXIT.DELIVERED;
  } catch (err) {
    stderr.write(`could not generate the dashboard: ${err?.message ?? err}\n`);
    return EXIT.DEFECT;
  }
}
