// Lane C — the renderer. An Answer becomes one self-contained HTML page:
// verdict cards, progress bars, stats, a simple diagram, and an honest footer
// listing what the gate refused. Deterministic, no external asset, every string
// escaped — the content came from an LLM and a corpus, so it is never trusted
// into the markup raw.

import test from "node:test";
import assert from "node:assert/strict";

import { makeAnswer, makeFact, makeVisual } from "../../src/types.mjs";
import { makeRefusal } from "../../src/types.mjs";
import { renderAnswer } from "../../src/render/render.mjs";

function answerWith({ facts = [], visuals = [], refusals = [] } = {}) {
  return makeAnswer({
    question: "how are the ads performing?",
    generatedAt: "2026-09-07T12:00:00.000Z",
    facts,
    visuals,
    refusals,
    meta: { mode: "recorded" },
  });
}

const FACT = makeFact({ id: "spend", text: "Spend is $32k/mo.", groundings: [{ docId: "ads", quote: "spend is thirty two thousand a month" }] });

test("the page is self-contained — a full document with inline style and no external asset", () => {
  const html = renderAnswer(answerWith({ facts: [FACT], visuals: [makeVisual({ kind: "stat", title: "Spend", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { value: "$32k/mo" } })] }));
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.doesNotMatch(html, /https?:\/\//, "no external asset URLs — the page must stand alone");
  assert.match(html, /how are the ads performing\?/);
});

test("a stat visual renders its value and title", () => {
  const html = renderAnswer(answerWith({ facts: [FACT], visuals: [makeVisual({ kind: "stat", title: "Monthly spend", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { value: "$32k / mo", note: "up 4%" } })] }));
  assert.match(html, /Monthly spend/);
  assert.match(html, /\$32k \/ mo/);
  assert.match(html, /up 4%/);
});

test("a progress-bar renders a fill proportional to value/max", () => {
  const html = renderAnswer(answerWith({ facts: [FACT], visuals: [makeVisual({ kind: "progress-bar", title: "Conversion", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { value: 25, max: 100, unit: "%" } })] }));
  assert.match(html, /Conversion/);
  assert.match(html, /width:\s*25%/, "a value of 25 of 100 fills the bar to 25%");
});

test("a verdict-card carries a verdict class the CSS can colour", () => {
  const html = renderAnswer(answerWith({ facts: [FACT], visuals: [makeVisual({ kind: "verdict-card", title: "Health", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { verdict: "green", line: "on track" } })] }));
  assert.match(html, /verdict-green/);
  assert.match(html, /on track/);
});

test("the refusals footer lists what the gate dropped, so nothing hides", () => {
  const html = renderAnswer(answerWith({
    facts: [FACT],
    visuals: [makeVisual({ kind: "stat", title: "Spend", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { value: "$32k" } })],
    refusals: [makeRefusal({ text: "Revenue doubled.", reason: "quote does not appear in the content of ads" })],
  }));
  assert.match(html, /Refused/i);
  assert.match(html, /Revenue doubled\./);
  assert.match(html, /quote does not appear/);
});

test("every drawn fact is shown beside its verbatim canon quote, so a paraphrase that strays is exposed not hidden", () => {
  // The gate anchors a fact to a real quote; it does not judge whether the
  // paraphrase is faithful (that is the evals rubric's job). This is the
  // transparency that makes the honest weaker guarantee safe: a fact whose text
  // strays from its quote still renders, but the quote is shown right beside it,
  // so the divergence is on the page rather than hidden behind a confident line.
  const straying = makeFact({
    id: "s",
    text: "Harbor is insolvent and revenue collapsed ninety percent.",
    groundings: [{ docId: "ads", quote: "spend is thirty two thousand a month" }],
  });
  const html = renderAnswer(answerWith({ facts: [straying], visuals: [] }));
  assert.match(html, /Grounded in canon/);
  assert.match(html, /Harbor is insolvent/);
  assert.match(html, /spend is thirty two thousand a month/, "the canon quote is shown beside the claim, exposing the mismatch");
});

test("every string is HTML-escaped — no markup from content reaches the page raw", () => {
  const evil = makeVisual({ kind: "stat", title: "<script>alert(1)</script>", factIds: ["spend"], evidence: "spend is thirty two thousand a month", body: { value: "<img src=x onerror=alert(2)>" } });
  const html = renderAnswer(answerWith({ facts: [FACT], visuals: [evil] }));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, "a title's script tag must be escaped");
  assert.doesNotMatch(html, /<img src=x onerror/, "a body value's tag must be escaped");
  assert.match(html, /&lt;script&gt;/);
});
