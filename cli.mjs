#!/usr/bin/env node
// business-brain — the bin. Everything lives in src/cli/main.mjs, which is
// tested; this file only supplies the real streams and env and turns the
// returned code into the process exit code.

import { main } from "./src/cli/main.mjs";

main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
})
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`business-brain: fatal — ${err?.stack ?? err}\n`);
    process.exit(1);
  });
