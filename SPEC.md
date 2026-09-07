# business-brain — SPEC

Ask a question about the business, get back a **one-page visual answer** — verdict
cards, progress bars, a diagram — instead of a wall of text. The load-bearing
idea is the one account-scout proved: a probabilistic generator wrapped in a
**deterministic grounding gate**. Every factual statement the answer renders must
quote a canon document verbatim, or it is refused, listed, and never drawn. A
visual cannot show a number the corpus does not contain.

This is the thesis again — deterministic controls for probabilistic systems —
applied to generated explainers. The generator (an LLM, or a recorded fixture)
proposes an answer; the gate decides which of its claims may be drawn; the
renderer is deterministic HTML. What ships is a self-contained page that cannot
assert something the business's own canon does not say.

```
question ──▶ generator ──▶ grounding gate ──▶ renderer ──▶ redaction-gate ──▶ one .html page
             (LLM /       │ (every fact must   (visuals →   (egress)
              recorded)   │  quote canon)       self-HTML)
                          └─ gtm-agent-evals scores the answer's quality
```

- **Language:** plain Node.js ESM (.mjs). **Tests:** node:test. **License:** MIT.
- **Dependencies:** first-party GitHub only, no third-party runtime dep. Reuses
  `redaction-gate` (egress) and `gtm-agent-evals` (scoring). The Anthropic API is
  called with plain `fetch`, key from env, never printed, every failure closed.
- **Two modes, one contract** (the strategy-benchmark pattern): `--live` generates
  over the corpus through the Claude API; `--recorded` replays a committed
  fixture keylessly, so CI and a stranger's first run need no key and reproduce
  exactly.
- **Clean of production.** Synthetic canon corpus only (a fictional company's
  system map and metric definitions). Nothing here touches the live `maestro_crm`
  or any real client. The Slack/CRM ask-surface is a LATER adapter, built once
  this core is proven — the account-scout discipline: prove it standalone first.

## The load-bearing idea: a Grounding is CHECKABLE

Exactly as account-scout made a Citation decidable, business-brain makes a
Grounding decidable. A `Grounding` names a canon doc and a quote; the quote must
appear **verbatim in that doc's content**. So "grounded" is a property the code
decides, not a claim the LLM makes about itself. Everything the deterministic
gate refuses is decidable from the shapes in `src/types.mjs` alone. Whether the
answer is *well-composed* or actually *answers the question* is judgment, scored
by the gtm-agent-evals rubric — never by a regex wearing a robe.

## The contract: `src/types.mjs`

Committed with this spec and FROZEN for the lanes. JSDoc-typed factories and
validators, house style. A lane must not change it; a needed change is a
cross-lane event that comes back to the orchestrator.

- `Question` — text, optional scope.
- `CanonDoc` — id, title, content, kind (`system-map` | `metric-def` | `concept`).
  The grounded corpus. A synthetic company's canon.
- `Grounding` — docId, quote. **The quote must appear verbatim in that doc's
  content this run**, which is what makes it checkable rather than decorative.
  An evidential floor (min quote length) keeps a trivial quote from grounding
  anything, exactly as account-scout's MIN_QUOTE_LENGTH does.
- `Fact` — id, text, groundings[] (≥1). A statement the gate has cleared.
- `Refusal` — text, reason. A would-be fact that failed the grounding gate. The
  answer carries refusals as first-class output; it never silently drops them.
- `Visual` — kind (`verdict-card` | `progress-bar` | `diagram` | `stat`), title,
  and a body that references Facts BY ID. A visual may only cite facts that
  cleared the gate, so nothing is ever drawn ungrounded.
- `Answer` — question, generatedAt, facts[], refusals[], visuals[], meta (mode,
  model when live).
- `Artifact` — the rendered self-contained HTML string (no external assets).

## The deterministic grounding gate (inside the brain, not bolted on)

Decidable, therefore refused deterministically: a fact with zero groundings; a
grounding whose quote does not appear in the named doc's content; a grounding to
a docId not in the corpus; a quote below the evidential floor; a visual that
references a fact id that did not clear the gate. Judgment (does this actually
answer the question, is the visual the right one) is scored by gtm-agent-evals.

## Lane decomposition — two waves of two, inside cap 2

**Wave 1**
- **Lane A — the contract + the grounding gate** (`src/types.mjs`, `src/gate/**`):
  the frozen shapes and `gateFacts({ candidates, corpus })` → { facts, refusals },
  plus the visual-integrity check that no visual references an ungrounded fact.
- **Lane B — corpus + generators** (`src/corpus/**`, `src/generate/**`): load a
  canon corpus from a directory; `recordedGenerator` replays a committed
  transcript keylessly; `liveGenerator` calls the Claude API over the corpus,
  fails closed. Both emit candidate facts + proposed visuals for the gate.

**Wave 2** (after wave 1 merges)
- **Lane C — the renderer** (`src/render/**`): visuals → one self-contained HTML
  page (inline CSS, no external asset), deterministic and theme-light, with an
  honest "refused claims" footer so what the gate dropped is visible, never
  hidden.
- **Lane D — egress + evals + CLI** (`src/gates/**`, `src/cli/**`): `redaction-gate`
  guards the HTML write; `gtm-agent-evals` scores every answer into JSONL
  telemetry; `brain ask|render|report` CLI with exit codes as contract.

## Discipline (binding, the full house contract)

TDD watch-the-red, commit per cycle. Adversarial senior review per lane, fix
waves, ship-check's gate at merge. Fail closed everywhere; refusals name what is
missing and how to repair it. Synthetic corpus only. README examples pasted from
real output, never memory. PRIVATE until Jason's standalone publish-yes; stays
clear of maestro_crm production until proven.

## Iteration log

- 2026-09-07 — spec locked. Row 8 (Business brain, CARD #253), reframed by Claude
  from "maestro_crm route" to a standalone grounded-generation build so it extends
  the pinned-5 thesis (deterministic controls for probabilistic systems) rather
  than adding to production CRM. Fresh private repo, account-scout discipline.
