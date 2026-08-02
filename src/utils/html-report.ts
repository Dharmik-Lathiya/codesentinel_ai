import type { EngineReport } from "../engine/index.js";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#2563eb",
  info: "#6b7280",
};

const BOLD_FONT_WEIGHT = "700";
const H2_COLOR = "#334155";
const SHADOW_ALPHA = "0.08";
const BAR_HEIGHT_PERCENT = 100;
const SCORE_GREEN_THRESHOLD = 80;
const SCORE_ORANGE_THRESHOLD = 60;
const SCORE_RED_THRESHOLD = 40;
const BAR_WIDTH_PERCENT = 100;
const SEMI_BOLD_FONT_WEIGHT = "600";
const HALF_BAR_HEIGHT_PERCENT = 50;

/**
 * Generate a self-contained HTML dashboard report from an EngineReport.
 * The HTML includes inline CSS and is fully portable (no external deps).
 */
export function renderHtmlReport(report: EngineReport): string {
  const categoryCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {};
  for (const f of report.findings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
    severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
  }

  const findingsRows = report.findings
    .map((f) => {
      const color = SEVERITY_COLORS[f.severity] ?? "#6b7280";
      return `<tr>
        <td><span style="color:${color};font-weight:${BOLD_FONT_WEIGHT}">${escapeHtml(f.severity)}</span></td>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.file)}${f.line != null ? `:${f.line}` : ""}</td>
        <td>${escapeHtml(f.comment)}</td>
        <td>${f.suggestion ? escapeHtml(f.suggestion) : "—"}</td>
      </tr>`;
    })
    .join("\n");

  const fixRows = report.fixAttempts
    .map((a) => {
      const status = a.fixed ? (a.verified ? "verified" : "applied") : "skipped";
      const statusColor = a.fixed ? (a.verified ? "#16a34a" : "#d97706") : "#6b7280";
      return `<tr>
        <td>#${a.iteration}</td>
        <td>${escapeHtml(a.file)}</td>
        <td><span style="color:${statusColor};font-weight:${BOLD_FONT_WEIGHT}">${status}</span></td>
        <td>${escapeHtml(a.explanation)}</td>
      </tr>`;
    })
    .join("\n");

  const testRows = report.generatedTests
    .map((t) => `<tr><td>${escapeHtml(t.file)}</td><td>${escapeHtml(t.testFilePath)}</td></tr>`)
    .join("\n");

  const severityChart = renderBarChart(
    "Severity Distribution",
    Object.entries(severityCounts).map(([s, c]) => ({ key: s, value: c, color: SEVERITY_COLORS[s] ?? "#6b7280" })),
  );
  const categoryChart = renderBarChart(
    "Category Breakdown",
    Object.entries(categoryCounts).map(([c, n]) => ({ key: c, value: n, color: "#6366f1" })),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeSentinel — ${escapeHtml(report.mode)} Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: ${H2_COLOR}; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
    .meta { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,${SHADOW_ALPHA}); }
    .card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 1.75rem; font-weight: ${BOLD_FONT_WEIGHT}; margin-top: 0.25rem; }
    .card .sub { font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem; }
    .score-ring { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,${SHADOW_ALPHA}); margin-bottom: 1.5rem; }
    th { background: #f1f5f9; text-align: left; padding: 0.6rem 0.75rem; font-size: 0.8rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.875rem; }
    tr:hover td { background: #f8fafc; }
    .empty { text-align: center; color: #94a3b8; padding: 2rem; }
    .bar-chart { display: flex; align-items: end; gap: 0.5rem; height: 120px; margin-top: 0.5rem; }
    .bar { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .bar-fill { width: ${BAR_WIDTH_PERCENT}%; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
    .bar-label { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; text-align: center; }
    .bar-value { font-size: 0.75rem; font-weight: ${SEMI_BOLD_FONT_WEIGHT}; margin-bottom: 0.25rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>CodeSentinel — ${escapeHtml(report.mode)} Report</h1>
  <p class="meta">Generated in ${report.metrics.durationMs}ms &middot; ${report.metrics.filesAnalyzed} file(s) analyzed</p>

  <div class="cards">
    <div class="card">
      <div class="label">Findings</div>
      <div class="value">${report.findings.length}</div>
      <div class="sub">${Object.entries(severityCounts).map(([s, c]) => `${c} ${escapeHtml(s)}`).join(", ") || "none"}</div>
    </div>
    ${renderScoreCard(report.score)}
    <div class="card">
      <div class="label">Fix Attempts</div>
      <div class="value">${report.fixAttempts.length}</div>
      <div class="sub">${report.fixAttempts.filter((a) => a.fixed && a.verified).length} verified</div>
    </div>
    <div class="card">
      <div class="label">Tests Generated</div>
      <div class="value">${report.generatedTests.length}</div>
    </div>
  </div>

  ${severityChart}

  ${categoryChart}

  <h2>Findings</h2>
  ${renderFindingsTable(report.findings.length, findingsRows)}

  ${renderFixTable(report.fixAttempts.length, fixRows)}

  ${renderTestsTable(report.generatedTests.length, testRows)}

  <p class="meta" style="margin-top:2rem;text-align:center">Report generated by CodeSentinel AI</p>
</div>
</body>
</html>`;
}

function renderScoreCard(score: NonNullable<EngineReport["score"]> | null): string {
  if (!score) return "";
  return `
    <div class="card" style="display:flex;align-items:center;gap:1rem">
      <div class="score-ring" style="background:${scoreColor(score.overall)}">${score.overall}</div>
      <div>
        <div class="label">Quality Score</div>
        <div class="sub">Readability ${score.readability} &middot; Maintainability ${score.maintainability}</div>

  it("renders severity bar heights proportional to the max count", () => {
    const report = {
      ...baseReport,
      findings: [
        { severity: "high", category: "security", file: "a.ts", line: 1, comment: "c", source: "static" },
        { severity: "high", category: "security", file: "b.ts", line: 2, comment: "c", source: "static" },
        { severity: "low", category: "smell", file: "c.ts", line: null, comment: "c", source: "static" },
      ],
      metrics: { ...baseReport.metrics, findingsBySeverity: { high: 2, low: 1 } },
    };
    const html = renderHtmlReport(report);
    expect(html).toContain('class="bar-fill" style="height:${BAR_HEIGHT_PERCENT}%;background:#ea580c"');
    expect(html).toContain('class="bar-fill" style="height:${HALF_BAR_HEIGHT_PERCENT}%;background:#2563eb"');
  });

  it("tallies severity counts locally when findingsBySeverity is empty", () => {
    const report = {
      ...baseReport,
      metrics: { ...baseReport.metrics, findingsBySeverity: {} },
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("Severity Distribution");
    expect(html).toContain("1 high");
    expect(html).toContain("1 medium");
    expect(html).toContain("1 low");
    expect(html).not.toContain(">none</div>");
  });

  it("renders file:line suffix for a finding at line 0", () => {
    const report = {
      ...baseReport,
      findings: [{ severity: "high", category: "bug", file: "x.ts", line: 0, comment: "c", source: "static" }],
      metrics: { ...baseReport.metrics, findingsBySeverity: { high: 1 } },
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("x.ts:0");
  });

  it("renders skipped and applied fix statuses", () => {
    const report = {
      ...baseReport,
      fixAttempts: [
        { iteration: 1, file: "a.ts", fixed: false, explanation: "e" },
        { iteration: 2, file: "b.ts", fixed: true, verified: false, explanation: "e" },
      ],
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("skipped");
    expect(html).toContain("applied");
  });

  it("escapes AI-derived severity, category, and mode values plus single quotes", () => {
    const report = {
      ...baseReport,
      mode: "<script>evil</script>" as unknown as typeof baseReport.mode,
      findings: [{
        severity: "<b>high</b>" as unknown as typeof baseReport.findings[number]["severity"],
        category: "<i>smell</i>" as unknown as typeof baseReport.findings[number]["category"],
        file: "x.ts",
        line: 1,
        comment: "it's fine",
        source: "static" as const,
      }],
      metrics: { ...baseReport.metrics, findingsBySeverity: {} },
    };
    const html = renderHtmlReport(report);
    expect(html).not.toContain("<script>evil");
    expect(html).not.toContain("<b>high</b>");
    expect(html).not.toContain("<i>smell</i>");
    expect(html).toContain("&lt;script&gt;evil");
    expect(html).toContain("&lt;b&gt;high&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;smell&lt;/i&gt;");
    expect(html).toContain("it&#39;s fine");
  });
});
      </div>
    </div>`;
}

function renderBarChart(title: string, items: { key: string; value: number; color: string }[]): string {
  if (items.length === 0) return "";
  const maxCount = Math.max(...items.map((item) => item.value));
  return `<h2>${escapeHtml(title)}</h2>
  <div class="bar-chart">
    ${items
      .map((item) => {
        const height = maxCount > 0 ? Math.round((item.value / maxCount) * BAR_HEIGHT_PERCENT) : 0;
        return `<div class="bar">
        <div class="bar-value">${item.value}</div>
        <div class="bar-fill" style="height:${height}%;background:${item.color}"></div>
        <div class="bar-label">${escapeHtml(item.key)}</div>
      </div>`;
      })
      .join("\n    ")}
  </div>`;
}

function renderFindingsTable(count: number, rows: string): string {
  if (count === 0) return `<div class="empty">No findings detected.</div>`;
  return `<table>
    <thead><tr><th>Severity</th><th>Category</th><th>File</th><th>Comment</th><th>Suggestion</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderFixTable(count: number, rows: string): string {
  if (count === 0) return "";
  return `<h2>Fix Attempts</h2>
  <table>
    <thead><tr><th>#</th><th>File</th><th>Status</th><th>Explanation</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTestsTable(count: number, rows: string): string {
  if (count === 0) return "";
  return `<h2>Generated Tests</h2>
  <table>
    <thead><tr><th>Source</th><th>Test File</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreColor(score: number): string {
  if (score >= SCORE_GREEN_THRESHOLD) return "#16a34a";
  if (score >= SCORE_ORANGE_THRESHOLD) return "#d97706";
  if (score >= SCORE_RED_THRESHOLD) return "#ea580c";
  return "#dc2626";
}
