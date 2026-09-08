// Lane D — egress. The rendered HTML is a byte exit like any other, so
// redaction-gate's guard() sits in front of the write. A rostered client name or
// a secret that rode in through the corpus is stripped before the page lands; a
// survivor refuses the write with nothing on disk.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEgress } from "../../src/gates/egress.mjs";

test("a clean page writes through", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-egress-"));
  const egress = createEgress();
  const path = join(dir, "answer.html");
  await egress.writeArtifact("<!doctype html><p>Harbor spend is $32k/mo.</p>", path);
  assert.ok(existsSync(path));
  assert.match(readFileSync(path, "utf8"), /\$32k\/mo/);
});

test("a rostered client name is redacted before the page lands", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-egress-"));
  const egress = createEgress({ roster: [{ class: "client", match: ["Initech"] }] });
  const path = join(dir, "answer.html");
  await egress.writeArtifact("<!doctype html><p>Initech is the customer here.</p>", path);
  const text = readFileSync(path, "utf8");
  assert.doesNotMatch(text, /Initech/, "the client name must not reach disk");
});

test("a secret in the content refuses or redacts, never lands raw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-egress-"));
  const egress = createEgress();
  const path = join(dir, "answer.html");
  const secret = "sk-ant-syntheticEGRESStoken00000";
  try {
    await egress.writeArtifact(`<!doctype html><p>key ${secret} leaked</p>`, path);
    // If it wrote, the secret must have been redacted.
    assert.doesNotMatch(readFileSync(path, "utf8"), new RegExp(secret), "a written page must not carry the raw secret");
  } catch (err) {
    // A refusal is equally acceptable: nothing on disk.
    assert.equal(err.name, "RedactionRefusal");
    assert.equal(existsSync(path), false);
  }
});
