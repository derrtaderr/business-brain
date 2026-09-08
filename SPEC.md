# business-brain — SPEC

Ask a question about the business, get back a **one-page visual answer** — verdict
cards, progress bars, a diagram — instead of a wall of text. The load-bearing
idea is the one account-scout proved: a probabilistic generator wrapped in a
**deterministic grounding gate**.

What the deterministic gate GUARANTEES, precisely (it is a floor, not a judge):

- Every fact the answer renders carries a **verbatim canon quote**, and that
  quote is **shown on the page beside the claim**. A statement with no verbatim
  canon quote is refused, listed, and never drawn.
- Every visual is **drawn from a verbatim quote of a backing fact**, and that
  evidence is **shown on the card**. A visual cannot attach canon its facts never
  cited, and cannot reference a fact that did not clear the gate.

What it deliberately does NOT do: decide whether a paraphrase or a presented
number *faithfully restates* its quote. That is **judgment** — an LLM could
attach a real-but-unrelated quote to a false claim, and no substring check can
catch that. Two things handle it instead, and the SPEC is honest that they are
separate from the gate: the shown quotes **expose** any divergence on the page
(a fabricated "$-4.2M" can only ever be drawn beside canon that visibly does not
say it), and the gtm-agent-evals rubric **scores** faithfulness. The gate makes
fabrication impossible to HIDE; it does not claim to make it impossible.

This is the thesis again — deterministic controls for probabilistic systems —
applied to generated explainers. The generator (an LLM, or a recorded fixture)
proposes an answer; the gate anchors every drawn thing to visible canon; the
renderer is deterministic HTML. What ships is a self-contained page where nothing
is drawn without its canon evidence sitting right beside it.

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
  a `body` (the presentation payload — the pretty "$900" form), `factIds`
  referencing Facts that cleared the gate, and an `evidence` quote that must be
  verbatim in one of those facts' groundings. The `body` is what the card draws;
  the `evidence` is the canon anchor shown beside it so the presentation can be
  checked against its source.
- `Answer` — question, generatedAt, facts[], refusals[], visuals[], meta (mode,
  model when live).
- `Artifact` — the rendered self-contained HTML string (no external assets).

## The deterministic grounding gate (inside the brain, not bolted on)

Decidable, therefore refused deterministically: a fact with zero valid
groundings; a grounding whose quote does not appear in the named doc's content; a
grounding to a docId not in the corpus; a quote below the evidential floor; a
visual that references a fact id that did not clear the gate; a visual whose
`evidence` is not verbatim in a backing fact's grounding; a malformed candidate
or visual (refused, never a crash). Judgment — does this actually answer the
question, does the paraphrase or the presented number faithfully restate its
quote — is NOT the gate's job; it is scored by gtm-agent-evals and exposed to the
reader by the quotes the renderer shows beside every fact and every card.

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

## Wiring note (resolved 2026-09-07)

The evals layer imports from `gtm-agent-evals/dist/index.js`. That repo used to
ship TypeScript with no build-on-install, so a git install left no `dist/` and
this build had to build it in place. Fixed upstream: `gtm-agent-evals` now carries
`"prepare": "tsc"`, so a fresh install builds its own `dist/` and a clone of this
repo installs and tests clean with no manual step.

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
