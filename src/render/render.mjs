// Lane C — the renderer. An Answer becomes one self-contained HTML page. It is
// deterministic (the same answer renders the same bytes), inline-styled (no
// external asset, so the page stands alone anywhere), and it ESCAPES every
// string it draws — the facts and titles came from an LLM over a corpus, so
// nothing is trusted into the markup raw.
//
// It also renders what the gate REFUSED, in a footer. A visual answer that
// silently omitted the claims it could not ground would look more confident than
// it earned; showing them is the honest counterpart to the gate.

/** Escape the five characters that matter for HTML text and attributes. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f6f7f9; color: #1a1c22;
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 40px 24px 64px; }
  .q { font-size: 24px; font-weight: 680; letter-spacing: -0.02em; margin: 0 0 4px; text-wrap: balance; }
  .meta { color: #6b7280; margin: 0 0 28px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; }
  .card h3 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600; }
  .stat .val { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; }
  .stat .note { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .bar { background: #eef0f3; border-radius: 999px; height: 12px; overflow: hidden; margin-top: 6px; }
  .bar > span { display: block; height: 100%; background: #2f6df6; }
  .bar-label { font-size: 13px; color: #374151; margin-top: 6px; }
  .verdict { border-left: 4px solid #9ca3af; }
  .verdict-green { border-left-color: #17a34a; }
  .verdict-amber { border-left-color: #d69e2e; }
  .verdict-red   { border-left-color: #e11d48; }
  .verdict .line { font-size: 16px; font-weight: 560; }
  .diagram ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .diagram li { background: #eef2ff; border: 1px solid #dbe0f5; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
  .diagram li::after { content: "\\2192"; margin-left: 10px; color: #9ca3af; }
  .diagram li:last-child::after { content: ""; margin: 0; }
  .refused { margin-top: 36px; border-top: 1px solid #e5e7eb; padding-top: 18px; }
  .refused h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin: 0 0 10px; }
  .refused li { color: #6b7280; font-size: 13px; margin-bottom: 6px; }
  .refused .rtext { color: #374151; }
`;

function renderStat(v) {
  const note = v.body.note ? `<div class="note">${escapeHtml(v.body.note)}</div>` : "";
  return `<div class="card stat"><h3>${escapeHtml(v.title)}</h3>` +
    `<div class="val">${escapeHtml(v.body.value ?? "")}</div>${note}</div>`;
}

function renderProgress(v) {
  const max = Number(v.body.max) || 100;
  const value = Number(v.body.value) || 0;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const unit = v.body.unit ? escapeHtml(v.body.unit) : "";
  return `<div class="card"><h3>${escapeHtml(v.title)}</h3>` +
    `<div class="bar"><span style="width: ${pct}%"></span></div>` +
    `<div class="bar-label">${escapeHtml(value)}${unit} of ${escapeHtml(max)}${unit}</div></div>`;
}

function renderVerdict(v) {
  const cls = ["green", "amber", "red"].includes(v.body.verdict) ? `verdict-${v.body.verdict}` : "";
  return `<div class="card verdict ${cls}"><h3>${escapeHtml(v.title)}</h3>` +
    `<div class="line">${escapeHtml(v.body.line ?? "")}</div></div>`;
}

function renderDiagram(v) {
  const steps = Array.isArray(v.body.steps) ? v.body.steps : [];
  const items = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  return `<div class="card diagram"><h3>${escapeHtml(v.title)}</h3><ol>${items}</ol></div>`;
}

function renderVisual(v) {
  switch (v.kind) {
    case "stat": return renderStat(v);
    case "progress-bar": return renderProgress(v);
    case "verdict-card": return renderVerdict(v);
    case "diagram": return renderDiagram(v);
    default: return "";
  }
}

/**
 * Render a validated Answer to one self-contained HTML page.
 *
 * @param {object} answer a frozen Answer from src/types.mjs
 * @returns {string} the HTML document
 */
export function renderAnswer(answer) {
  const cards = answer.visuals.map(renderVisual).join("\n");

  const refused =
    answer.refusals.length === 0
      ? ""
      : `<section class="refused"><h2>Refused (${answer.refusals.length}) — claims the canon could not ground</h2><ul>` +
        answer.refusals
          .map((r) => `<li><span class="rtext">${escapeHtml(r.text)}</span> — ${escapeHtml(r.reason)}</li>`)
          .join("") +
        `</ul></section>`;

  const model = answer.meta.model ? `, ${escapeHtml(answer.meta.model)}` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(answer.question)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<h1 class="q">${escapeHtml(answer.question)}</h1>
<p class="meta">Grounded answer · ${escapeHtml(answer.facts.length)} fact(s), ${escapeHtml(answer.visuals.length)} visual(s) · ${escapeHtml(answer.meta.mode)}${model} · ${escapeHtml(answer.generatedAt)}</p>
<div class="grid">
${cards}
</div>
${refused}
</div>
</body>
</html>
`;
}
