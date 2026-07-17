import type { EngineReport } from "../engine/index.js";

/**
 * Generate a self-contained HTML dashboard report from an EngineReport.
 * The HTML includes inline CSS and is fully portable (no external deps).
 */
export function renderHtmlReport(report: EngineReport): string {
  const severityColors: Record<string, string> = {
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#d97706",
    low: "#2563eb",
    info: "#6b7280",
  };

  const categoryCounts: Record<string, number> = {};
  for (const f of report.findings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }

  const severityCounts = report.metrics.findingsBySeverity;

  const findingsRows = report.findings
    .map((f) => {
      const color = severityColors[f.severity] ?? "#6b7280";
      return `<tr>
        <td><span style="color:${color};font-weight:700">${f.severity}</span></td>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.file)}${f.line ? `:${f.line}` : ""}</td>
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
        <td><span style="color:${statusColor};font-weight:700">${status}</span></td>
        <td>${escapeHtml(a.explanation)}</td>
      </tr>`;
    })
    .join("\n");

  const testRows = report.generatedTests
    .map((t) => `<tr><td>${escapeHtml(t.file)}</td><td>${escapeHtml(t.testFilePath)}</td></tr>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeSentinel — ${report.mode} Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
    .meta { color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card .label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }
    .card .sub { font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem; }
    .score-ring { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; color: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 1.5rem; }
    th { background: #f1f5f9; text-align: left; padding: 0.6rem 0.75rem; font-size: 0.8rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    td { padding: 0.6rem 0.75rem; border-top: 1px solid #e2e8f0; font-size: 0.875rem; }
    tr:hover td { background: #f8fafc; }
    .empty { text-align: center; color: #94a3b8; padding: 2rem; }
    .bar-chart { display: flex; align-items: end; gap: 0.5rem; height: 120px; margin-top: 0.5rem; }
    .bar { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .bar-fill { width: 100%; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; }
    .bar-label { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; text-align: center; }
    .bar-value { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>CodeSentinel — ${report.mode} Report</h1>
  <p class="meta">Generated in ${report.metrics.durationMs}ms &middot; ${report.metrics.filesAnalyzed} file(s) analyzed</p>

  <div class="cards">
    <div class="card">
      <div class="label">Findings</div>
      <div class="value">${report.findings.length}</div>
      <div class="sub">${Object.entries(severityCounts).map(([s, c]) => `${c} ${s}`).join(", ") || "none"}</div>
    </div>
    ${
      report.score
        ? `
    <div class="card" style="display:flex;align-items:center;gap:1rem">
      <div class="score-ring" style="background:${scoreColor(report.score.overall)}">${report.score.overall}</div>
      <div>
        <div class="label">Quality Score</div>
        <div class="sub">Readability ${report.score.readability} &middot; Maintainability ${report.score.maintainability}</div>
        <div class="sub">Security ${report.score.security} &middot; Coverage ${report.score.test_coverage}</div>
      </div>
    </div>`
        : ""
    }
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

  ${
    report.findings.length > 0
      ? `<h2>Severity Distribution</h2>
  <div class="bar-chart">
    ${Object.entries(severityCounts)
      .map(([sev, count]) => {
        const maxCount = Math.max(...Object.values(severityCounts));
        const height = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return `<div class="bar">
        <div class="bar-value">${count}</div>
        <div class="bar-fill" style="height:${height}%;background:${severityColors[sev] ?? "#6b7280"}"></div>
        <div class="bar-label">${sev}</div>
      </div>`;
      })
      .join("\n    ")}
  </div>`
      : ""
  }

  ${
    Object.keys(categoryCounts).length > 0
      ? `<h2>Category Breakdown</h2>
  <div class="bar-chart">
    ${Object.entries(categoryCounts)
      .map(([cat, count]) => {
        const maxCount = Math.max(...Object.values(categoryCounts));
        const height = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return `<div class="bar">
        <div class="bar-value">${count}</div>
        <div class="bar-fill" style="height:${height}%;background:#6366f1"></div>
        <div class="bar-label">${cat}</div>
      </div>`;
      })
      .join("\n    ")}
  </div>`
      : ""
  }

  <h2>Findings</h2>
  ${
    report.findings.length > 0
      ? `<table>
    <thead><tr><th>Severity</th><th>Category</th><th>File</th><th>Comment</th><th>Suggestion</th></tr></thead>
    <tbody>${findingsRows}</tbody>
  </table>`
      : `<div class="empty">No findings detected.</div>`
  }

  ${
    report.fixAttempts.length > 0
      ? `<h2>Fix Attempts</h2>
  <table>
    <thead><tr><th>#</th><th>File</th><th>Status</th><th>Explanation</th></tr></thead>
    <tbody>${fixRows}</tbody>
  </table>`
      : ""
  }

  ${
    report.generatedTests.length > 0
      ? `<h2>Generated Tests</h2>
  <table>
    <thead><tr><th>Source</th><th>Test File</th></tr></thead>
    <tbody>${testRows}</tbody>
  </table>`
      : ""
  }

  <p class="meta" style="margin-top:2rem;text-align:center">Report generated by CodeSentinel AI</p>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}
