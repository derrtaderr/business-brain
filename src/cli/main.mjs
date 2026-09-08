// Lane D — the dispatch. Parse argv, route to the command, map a bad invocation
// to exit 2. cli.mjs does exactly this and then calls process.exit.

import { parseArgs, UsageError } from "./args.mjs";
import { askCommand, reportCommand, EXIT } from "./ask.mjs";

/**
 * @param {string[]} argv process.argv.slice(2)
 * @param {object} deps { stdout, stderr, env, now? }
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      deps.stderr.write(err.message + "\n");
      return EXIT.USAGE;
    }
    throw err;
  }
  if (opts.command === "report") return reportCommand(opts, deps);
  return askCommand(opts, deps);
}
