// Lane A — the grounding gate, the deterministic control at the heart of the
// build. A generator proposes candidate facts and visuals; this gate decides
// which facts may stand and which visuals may draw. It is the analog of
// account-scout's citation gate: everything it refuses is decidable from the
// corpus alone, and a refused fact is listed, never dropped.
//
// The behaviours, each with its own test:
//  - a fact grounded in the corpus stands; an ungrounded one is refused;
//  - a fact whose quote is not in the named doc is refused;
//  - a grounding to a doc that is not in the corpus is refused;
//  - a below-floor quote cannot ground anything;
//  - a fact keeps only its VALID groundings, and is refused only when none hold;
//  - a visual may not reference a fact that did not clear the gate.

import test from "node:test";
import assert from "node:assert/strict";

import { makeCanonDoc } from "../../src/types.mjs";
import { gateFacts, gateVisuals } from "../../src/gate/gate.mjs";

const CORPUS = [
  makeCanonDoc({
    id: "system-map",
    title: "GTM system map",
    kind: "system-map",
    content:
      "The engine enriches, scores, and routes accounts. RB2B resolves the visitor, " +
      "the v3 scorer stacks fit and intent, and approvals gate every outbound draft.",
  }),
  makeCanonDoc({
    id: "omtm",
    title: "OMTM definition",
    kind: "metric-def",
    content: "The one metric that matters is qualified pipeline created per week.",
  }),
];

test("a fact grounded in the corpus stands", () => {
  const { facts, refusals } = gateFacts({
    candidates: [
      {
        id: "f1",
        text: "The scorer stacks fit and intent.",
        groundings: [{ docId: "system-map", quote: "the v3 scorer stacks fit and intent" }],
      },
    ],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 1);
  assert.equal(refusals.length, 0);
  assert.equal(facts[0].id, "f1");
});

test("an ungrounded fact is refused, not dropped", () => {
  const { facts, refusals } = gateFacts({
    candidates: [{ id: "f1", text: "Revenue tripled last quarter.", groundings: [] }],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 0);
  assert.equal(refusals.length, 1);
  assert.match(refusals[0].reason, /no grounding|ungrounded/i);
  assert.match(refusals[0].text, /Revenue tripled/);
});

test("a quote that is not in the named doc is refused, and the reason names it", () => {
  const { facts, refusals } = gateFacts({
    candidates: [
      {
        id: "f1",
        text: "The engine sends 500 emails a day.",
        groundings: [{ docId: "system-map", quote: "sends five hundred emails a day" }],
      },
    ],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 0);
  assert.equal(refusals.length, 1);
  assert.match(refusals[0].reason, /does not appear in the content of system-map/);
});

test("a grounding to a doc not in the corpus is refused", () => {
  const { facts, refusals } = gateFacts({
    candidates: [
      {
        id: "f1",
        text: "Churn fell to two percent.",
        groundings: [{ docId: "nonexistent", quote: "churn fell to two percent last quarter" }],
      },
    ],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 0);
  assert.match(refusals[0].reason, /not in the corpus/);
});

test("a below-floor quote cannot ground a fact", () => {
  const { facts, refusals } = gateFacts({
    candidates: [{ id: "f1", text: "It scores.", groundings: [{ docId: "system-map", quote: "scores" }] }],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 0);
  assert.match(refusals[0].reason, /evidential floor/);
});

test("a fact keeps only its valid groundings, and stands if at least one holds", () => {
  const { facts, refusals } = gateFacts({
    candidates: [
      {
        id: "f1",
        text: "The scorer stacks fit and intent and also reads the weather.",
        groundings: [
          { docId: "system-map", quote: "the v3 scorer stacks fit and intent" }, // valid
          { docId: "system-map", quote: "and also reads the barometric weather feed" }, // fabricated
        ],
      },
    ],
    corpus: CORPUS,
  });
  assert.equal(facts.length, 1, "one valid grounding is enough to stand");
  assert.equal(refusals.length, 0);
  assert.equal(facts[0].groundings.length, 1, "the fabricated grounding is dropped");
  assert.equal(facts[0].groundings[0].quote, "the v3 scorer stacks fit and intent");
});

test("gateVisuals drops a visual that references a fact which did not clear the gate", () => {
  const facts = [{ id: "f1", text: "x", groundings: [{ docId: "omtm", quote: "qualified pipeline created per week" }] }];
  const { visuals, refusedVisuals } = gateVisuals({
    visuals: [
      { kind: "stat", title: "OMTM", factIds: ["f1"], body: { value: "pipeline/wk" } }, // ok
      { kind: "verdict-card", title: "Ghost", factIds: ["f99"], body: { verdict: "green" } }, // references nothing real
    ],
    facts,
  });
  assert.equal(visuals.length, 1);
  assert.equal(visuals[0].title, "OMTM");
  assert.equal(refusedVisuals.length, 1);
  assert.match(refusedVisuals[0].reason, /f99/);
});
