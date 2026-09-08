// Lane B — the corpus loader. Reads a directory of markdown canon documents into
// validated CanonDocs. Each file carries a small frontmatter block naming its
// id, title, and kind; the body is the groundable content.
//
// Fail closed at every step: an unreadable directory, a file with no
// frontmatter, an unknown kind, or an empty directory all REFUSE loudly. A
// half-loaded corpus is worse than none, because the gate would then judge
// against evidence that silently went missing — a fact would be refused not for
// being fabricated but for citing a doc the loader dropped.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { makeCanonDoc } from "../types.mjs";

/** Split a `--- key: value ... ---\nbody` document. Returns null when the file
 *  does not open with a frontmatter fence, so the caller can refuse by name. */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return null;
  const [, block, body] = match;
  const meta = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: body.trim() };
}

/**
 * Load every `.md` file in `dir` into a validated CanonDoc[].
 *
 * @param {string} dir the corpus directory
 * @returns {Array<object>} CanonDoc[]
 * @throws when the directory is unreadable, a doc lacks frontmatter or a valid
 *   kind, or no documents are found.
 */
export function loadCorpus(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
  } catch (err) {
    throw new Error(`cannot read the corpus directory ${dir}: ${err.message}`);
  }

  const corpus = [];
  for (const name of names) {
    const raw = readFileSync(join(dir, name), "utf8");
    const parsed = parseFrontmatter(raw);
    if (!parsed)
      throw new Error(
        `${name} is not a canon document — it must open with an id/title/kind frontmatter block ` +
          `delimited by --- lines`,
      );
    const { meta, body } = parsed;
    if (body === "") throw new Error(`${name} has an empty body — a canon doc with no content grounds nothing`);
    try {
      corpus.push(makeCanonDoc({ id: meta.id, title: meta.title, content: body, kind: meta.kind }));
    } catch (err) {
      throw new Error(`${name}: ${err.message}`);
    }
  }

  if (corpus.length === 0)
    throw new Error(`no canon documents found in ${dir} — a brain with no canon can ground nothing`);

  return corpus;
}
