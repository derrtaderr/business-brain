// Lane B — the corpus loader. A directory of markdown docs, each with an
// id/title/kind frontmatter block, becomes a validated CanonDoc[]. Fail closed:
// a doc missing its frontmatter, or the directory missing entirely, refuses
// loudly rather than yielding a half-corpus the gate would then judge against.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "../../src/corpus/load.mjs";

const HARBOR = fileURLToPath(new URL("../../fixtures/harbor-canon/", import.meta.url));

test("the bundled corpus loads into validated CanonDocs", () => {
  const corpus = loadCorpus(HARBOR);
  const byId = Object.fromEntries(corpus.map((d) => [d.id, d]));
  assert.deepEqual(corpus.map((d) => d.id).sort(), ["ads", "omtm", "system-map"]);
  assert.equal(byId["system-map"].kind, "system-map");
  assert.match(byId["omtm"].content, /qualified pipeline created per week/);
  assert.equal(byId["ads"].title, "Harbor ad performance");
});

test("a missing directory refuses rather than returning an empty corpus", () => {
  assert.throws(() => loadCorpus(join(tmpdir(), "no-such-corpus-dir-xyz")), /cannot read the corpus/);
});

test("a doc missing its frontmatter refuses, naming the file", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-corpus-"));
  writeFileSync(join(dir, "broken.md"), "no frontmatter here, just a body", "utf8");
  assert.throws(() => loadCorpus(dir), /broken\.md/);
});

test("a doc with an unknown kind refuses at validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-corpus-"));
  writeFileSync(
    join(dir, "weird.md"),
    "---\nid: weird\ntitle: Weird\nkind: horoscope\n---\nbody",
    "utf8",
  );
  assert.throws(() => loadCorpus(dir), /kind/);
});

test("an empty corpus directory refuses — a brain with no canon can ground nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "bb-corpus-empty-"));
  assert.throws(() => loadCorpus(dir), /no canon documents/);
});
