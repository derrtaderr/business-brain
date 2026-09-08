// Lane D — `brain ask`. Composes the whole build: load the corpus, generate
// (recorded or live), gate + assemble the answer, render it, and write the page
// through the egress guard. Exit code is a contract: 0 delivered, 1 defect,
// 2 usage, 3 the system refused (grounded nothing, or egress caught a survivor —
// a decision, not a crash).

import { loadCorpus } from "../corpus/load.mjs";
import { recordedGenerator } from "../generate/recorded.mjs";
import { liveGenerator } from "../generate/live.mjs";
import { buildAnswer } from "../answer/build.mjs";
import { renderAnswer } from "../render/render.mjs";
import { createEgress } from "../gates/egress.mjs";
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
    const html = renderAnswer(answer);

    const egress = deps.makeEgress ? deps.makeEgress(opts) : createEgress();
    await egress.writeArtifact(html, opts.out);

    stdout.write(
      `brain: "${question}" — ${answer.facts.length} grounded fact(s), ${answer.refusals.length} refused, ` +
        `${answer.visuals.length} visual(s) [${answer.meta.mode}] → ${opts.out}\n`,
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
