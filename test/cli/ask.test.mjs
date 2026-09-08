// Lane D — `brain ask` end to end. The recorded path drives the whole build over
// a real corpus to a guarded HTML page on disk, keyless. The grounded stats are
// present, the fabricated claim is not (it is in the refused footer instead), and
// the exit code is a contract.

delete process.env.ANTHROPIC_API_KEY;

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../../src/cli/args.mjs";
import { askCommand } from "../../src/cli/ask.mjs";
import { main } from "../../src/cli/main.mjs";

const HARBOR = fileURLToPath(new URL("../../fixtures/harbor-canon/", import.meta.url));
const ADS = fileURLToPath(new URL("../../fixtures/harbor-answers/ads.json", import.meta.url));
const NOW = () => "2026-09-07T12:00:00.000Z";

function io() {
  const out = [];
  const err = [];
  return { out, err, deps: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, env: {}, now: NOW } };
}

test("ask grounds a visual answer to disk, keeps the true stats, refuses the fabrication, exits 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-ask-"));
  const opts = parseArgs(["ask", "--question", "how are the ads performing?", "--corpus", HARBOR, "--transcript", ADS, "--out", join(dir, "answer.html")]);
  const { out, deps } = io();

  const code = await askCommand(opts, deps);

  assert.equal(code, 0);
  const html = readFileSync(join(dir, "answer.html"), "utf8");
  assert.match(html, /how are the ads performing\?/);
  assert.match(html, /\$900/, "the grounded cost-per-opp stat is drawn");
  assert.match(html, /Cost per qualified opportunity/);
  assert.doesNotMatch(html.split("Refused")[0], /fifty percent increase in revenue/, "the fabrication is not among the visuals");
  assert.match(html, /Refused/, "the fabrication is disclosed in the refused footer");
  assert.match(out.join(""), /3 grounded fact/);
});

test("a question the corpus cannot ground refuses, exit 3, nothing written", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-ask-"));
  // Point the transcript at a fabrication-only answer by reusing a generator
  // that grounds nothing: easiest is a transcript whose only claim is fabricated.
  const badTranscript = join(dir, "bad.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    badTranscript,
    JSON.stringify({ question: "q", candidates: [{ id: "x", text: "Made up.", groundings: [{ docId: "ads", quote: "a quote that is nowhere in the ads document at all" }] }], visuals: [] }),
    "utf8",
  );
  const opts = parseArgs(["ask", "--question", "anything", "--corpus", HARBOR, "--transcript", badTranscript, "--out", join(dir, "answer.html")]);
  const { err, deps } = io();

  const code = await askCommand(opts, deps);

  assert.equal(code, 3);
  assert.match(err.join(""), /grounded nothing/);
  assert.equal(existsSync(join(dir, "answer.html")), false, "nothing is written on a refusal");
});

test("main routes ask and returns its code; a bad command exits 2", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-ask-"));
  const { deps } = io();
  const ok = await main(["ask", "--question", "q", "--corpus", HARBOR, "--transcript", ADS, "--out", join(dir, "a.html")], deps);
  assert.equal(ok, 0);
  const bad = await main(["explode"], deps);
  assert.equal(bad, 2);
});

test("a non-.html --out is a usage error, exit 2", async () => {
  const { deps } = io();
  const code = await main(["ask", "--question", "q", "--corpus", HARBOR, "--transcript", ADS, "--out", "answer.txt"], deps);
  assert.equal(code, 2);
});
