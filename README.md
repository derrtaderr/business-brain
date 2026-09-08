# business-brain

Ask a question about the business, get back a **one-page visual answer** — stat
cards, progress bars, a diagram — instead of a wall of text. The load-bearing
idea is the one account-scout proved, applied to generated explainers: a
probabilistic generator wrapped in a **deterministic grounding gate**, plus a
faithfulness layer that scores how well the answer tracks its evidence.

```
question ──▶ generator ──▶ grounding gate ──▶ renderer ──▶ redaction-gate ──▶ one .html page
             (LLM /       │ (every fact must   (visuals +   (egress)
              recorded)   │  quote canon)       quotes)
                          ├─ faithfulness scorer (lexical, keyless) + LLM judge (--judge)
                          └─ gtm-agent-evals: telemetry + `brain report` dashboard
```

## Two controls, honestly scoped

**1. The deterministic grounding gate** anchors every drawn thing to visible
canon. It guarantees, decidably:

- Every fact the answer renders carries a **verbatim canon quote**, shown on the
  page beside the claim. No quote, no fact — it is refused and listed.
- Every visual is **drawn from a verbatim quote of a backing fact**, shown on the
  card. A visual cannot attach canon its facts never cited.

What it deliberately does **not** do is decide whether a paraphrase or a number
*faithfully restates* its quote — an LLM could bolt a real-but-unrelated quote
onto a false claim, and no substring check catches that. So:

**2. The faithfulness layer** scores it, in two honest tiers:

- **Lexical** (keyless, always on): how much of a claim's content is literally
  present in its quote. A claim that strays wildly — "insolvent, 90% collapse"
  over a quote about ad spend — shares almost nothing and is flagged. Catches the
  gross fabrication; does not pretend to catch subtle drift.
- **Semantic** (`--judge`, needs a key): an LLM judge decides, per fact, whether
  the quote actually *supports* the claim, catching a stray meaning even when the
  words overlap. The answer is faithful only if **both** tiers agree.

The gate makes fabrication impossible to **hide** (the quote is shown); the
faithfulness layer makes it possible to **catch** and, under `--strict`, refuse.

## Install

```
npm install                # redaction-gate + gtm-agent-evals, from GitHub
npm test                   # 67 tests, node:test, keyless
```

Known wiring note (shared with account-scout): `gtm-agent-evals` ships TypeScript
with no `prepare` script, so a fresh git install has no `dist/`. The
telemetry/dashboard reuse imports from it, so until the one-line upstream fix
lands, build it in place once: `cd node_modules/gtm-agent-evals && npx tsc`. The
gate, renderer, generators, and the lexical scorer need no such step.

## The CLI

### `brain ask` — a question to a grounded visual page

```
$ brain ask --question "how are the ads performing?" \
    --corpus fixtures/harbor-canon --transcript fixtures/harbor-answers/ads.json \
    --out ads.html
brain: "how are the ads performing?" — 3 grounded fact(s), 1 refused, 3 visual(s), faithfulness PASS [recorded] → ads.html
```

The page draws each visual with its canon evidence beneath it, then lists every
fact beside the verbatim quote it stands on, then the claims the gate refused.
Real output from the run above:

```
Grounded in canon (3)
  The blended cost per qualified opportunity is nine hundred dollars, down from fourteen hundred a quarter ago.
    "blended cost per qualified opportunity is nine hundred dollars, down from fourteen hundred a quarter ago"
  ...

Refused (1) — claims the canon could not ground
  The ad program drove a fifty percent increase in revenue this quarter. — quote does not appear in the content of ads
```

Add `--strict` to refuse delivery of a low-faithfulness answer instead of drawing
it. The fabrication a real run tries to slip through:

```
$ brain ask --question "is Harbor healthy?" --corpus fixtures/harbor-canon \
    --transcript stray.json --out out.html --strict
strict: refusing to deliver a low-faithfulness answer — fact "doom" strays from its
evidence — only 0% of its words appear in its grounding quote (floor 50%).
# exit 3, nothing written
```

Add `--judge` (with `ANTHROPIC_API_KEY`) to also run the semantic judge.

### `brain report` — the faithfulness dashboard

```
$ brain report --telemetry telemetry/events.jsonl --out dashboard/index.html
dashboard written to dashboard/index.html
```

A self-contained static dashboard, built by `gtm-agent-evals` over the exact
verdicts `ask` records — pass rate and per-run status over time.

## Two modes, one contract

`--recorded --transcript FILE` replays a committed answer keylessly (CI and a
stranger's first run). `--live` generates over the corpus through the Claude API.
Reaching the live API is never the default — you say `--live`, so a first command
cannot silently spend a key.

## Fail closed, everywhere

- A run that grounds **no** facts refuses rather than rendering a confident empty
  page.
- A malformed candidate or visual is **refused and listed**, never a crash.
- The generators fail closed on missing/malformed input; the live generator and
  the judge scrub the key from every error.
- The HTML page and the telemetry are both written **post-redaction** through
  `redaction-gate` — a rostered client name or a secret in the corpus never
  reaches disk.
- Refusals name what is missing and how to repair it.

## See it run

```
npm run demo
```

Runs the real bin against the synthetic corpus and builds `demo/` — the answer
pages and the dashboard, every file a real run.

## Synthetic only

The bundled corpus is a fictional company, Harbor Logistics. Nothing here touches
a production system, and no fixture carries a real key, secret, or client name.

MIT.
