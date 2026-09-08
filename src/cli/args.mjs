// Lane D — the CLI argument parser. Pure and total: a validated frozen options
// object or a UsageError naming the fix. Mode is never guessed — `ask` defaults
// to RECORDED, and reaching the live Claude API requires --live, so a first
// command cannot silently spend a key.

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.usage = true;
  }
}

const COMMANDS = Object.freeze(["ask"]);

function takeValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const v = argv[idx + 1];
  if (v === undefined || v.startsWith("--")) throw new UsageError(`${flag} needs a value`);
  argv.splice(idx, 2);
  return v;
}

function takeBool(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return false;
  argv.splice(idx, 1);
  return true;
}

function refuseLeftovers(argv, command) {
  if (argv.length === 0) return;
  throw new UsageError(`${command}: unrecognised argument${argv.length === 1 ? "" : "s"}: ${argv.join(" ")}`);
}

function resolveMode(argv) {
  const recorded = takeBool(argv, "--recorded");
  const live = takeBool(argv, "--live");
  if (recorded && live) throw new UsageError("--recorded and --live are mutually exclusive — pick one");
  return live ? "live" : "recorded";
}

export function parseArgs(rawArgv) {
  const argv = [...rawArgv];
  const command = argv.shift();
  if (!command) throw new UsageError(`no command — expected: ${COMMANDS.join(", ")}`);
  if (!COMMANDS.includes(command)) throw new UsageError(`unknown command "${command}" — expected: ${COMMANDS.join(", ")}`);
  return parseAsk(argv);
}

function parseAsk(argv) {
  const mode = resolveMode(argv);
  const question = takeValue(argv, "--question");
  const corpus = takeValue(argv, "--corpus");
  const transcript = takeValue(argv, "--transcript");
  const out = takeValue(argv, "--out") ?? "out/answer.html";

  if (!question) throw new UsageError("ask needs --question TEXT — the question to answer");
  if (!corpus) throw new UsageError("ask needs --corpus DIR — the canon corpus directory to ground against");
  if (mode === "recorded" && !transcript)
    throw new UsageError("recorded ask needs --transcript FILE — the committed answer to replay. Use --live to generate.");
  if (!out.endsWith(".html")) throw new UsageError(`--out must be a .html path, got ${out}`);

  refuseLeftovers(argv, "ask");
  return Object.freeze({ command: "ask", mode, question, corpus, transcript, out });
}
