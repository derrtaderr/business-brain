#!/usr/bin/env node
// Regenerate the bundled demo by running the REAL bin against the synthetic
// corpus, keyless. Produces demo/*.html and demo/dashboard/index.html — the
// sample outputs the README points at, every file a real run, never written
// from memory.
//
//   node scripts/demo.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(root, "cli.mjs");
const demo = join(root, "demo");
const telemetry = join(demo, "events.jsonl"); // NOT under a telemetry/ dir — that path is gitignored

rmSync(demo, { recursive: true, force: true });
mkdirSync(demo, { recursive: true });

/** Run the bin; echo its output. `allowRefuse` tolerates the exit-3 refusal the
 *  --strict example is supposed to produce. */
function run(args, { allowRefuse = false } = {}) {
  try {
    process.stdout.write(execFileSync("node", [cli, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (err) {
    if (allowRefuse && err.status === 3) {
      const firstLine = String(err.stderr ?? "").trim().split("\n")[0];
      process.stdout.write(`(refused, as intended: ${firstLine})\n`);
      return;
    }
    throw err;
  }
}

// A grounded answer that passes faithfulness.
run(["ask", "--question", "how are the ads performing?", "--corpus", "fixtures/harbor-canon",
  "--transcript", "fixtures/harbor-answers/ads.json", "--out", join(demo, "ads.html"), "--telemetry", telemetry]);

// A fabrication that grounds but strays — refused under --strict, verdict recorded.
run(["ask", "--question", "is Harbor healthy?", "--corpus", "fixtures/harbor-canon",
  "--transcript", "fixtures/harbor-answers/stray.json", "--out", join(demo, "stray.html"),
  "--telemetry", telemetry, "--strict"], { allowRefuse: true });

// The dashboard over both runs.
run(["report", "--telemetry", telemetry, "--out", join(demo, "dashboard", "index.html")]);

process.stdout.write("\ndemo regenerated under demo/ — ads.html, dashboard/index.html\n");
