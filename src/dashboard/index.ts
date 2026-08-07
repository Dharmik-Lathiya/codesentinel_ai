import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { logger } from "../utils/logger.js";

interface DashboardData {
  runs: {
    timestamp: string;
    mode: string;
    totalFindings: number;
    score: number | null;
    findingsBySeverity: Record<string, number>;
    findingsByCategory: Record<string, number>;
    durationMs: number;
  }[];
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeSentinel Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 24px; }
  h1 { color: #58a6ff; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .stat-card h3 { font-size: 14px; color: #8b949e; margin-bottom: 8px; }
  .stat-card .value { font-size: 28px; font-weight: 600; }
  .chart-container { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .chart-container h2 { font-size: 16px; margin-bottom: 12px; }
  canvas { max-height: 300px; }
  .runs-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .runs-table th, .runs-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #30363d; font-size: 14px; }
  .runs-table th { color: #8b949e; font-weight: 600; }
  .severity-critical { color: #f85149; }
  .severity-high { color: #d29922; }
  .severity-medium { color: #58a6ff; }
  .severity-low { color: #3fb950; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .empty { color: #8b949e; text-align: center; padding: 48px; font-size: 16px; }
</style>
</head>
<body>
<h1>📊 CodeSentinel Dashboard</h1>
<div id="empty-state" class="empty" style="display:none">
  <p>No analysis runs yet. Run <code>codesentinel review</code> or <code>codesentinel gate</code> to see data here.</p>
</div>
<div class="stats" id="stats"></div>
<div class="grid-2">
  <div class="chart-container"><h2>Findings by Severity</h2><canvas id="severityChart"></canvas></div>
  <div class="chart-container"><h2>Findings by Category</h2><canvas id="categoryChart"></canvas></div>
</div>
<div class="chart-container"><h2>Score Trend</h2><canvas id="scoreChart"></canvas></div>
<div class="chart-container"><h2>Recent Runs</h2>
<table class="runs-table">
<thead><tr><th>Time</th><th>Mode</th><th>Findings</th><th>Score</th><th>Duration</th></tr></thead>
<tbody id="runs-body"></tbody>
</table>
</div>
<script>
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SEVERITY_COLORS = { critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950' };
const PALETTE = ['#f85149', '#d29922', '#58a6ff', '#3fb950', '#8b949e'];

function colorFor(key, explicit = {}) {
  if (Object.prototype.hasOwnProperty.call(explicit, key)) return explicit[key];
  let hash = 0;
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

async function loadData() {
  let runs;
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Bad response');
    const data = await res.json();
    runs = data.runs || [];
  } catch (e) {
    console.error('Failed to load dashboard data', e);
    const empty = document.getElementById('empty-state');
    empty.textContent = 'Failed to load dashboard data.';
    empty.style.display = 'block';
    return;
  }
  if (runs.length === 0) { document.getElementById('empty-state').style.display = 'block'; return; }
  const latest = runs[runs.length - 1];
  const totalFindings = runs.reduce((s, r) => s + r.totalFindings, 0);
  document.getElementById('stats').innerHTML = \`
    <div class="stat-card"><h3>Total Runs</h3><div class="value">\${runs.length}</div></div>
    <div class="stat-card"><h3>Latest Score</h3><div class="value">\${latest.score ?? 'N/A'}</div></div>
    <div class="stat-card"><h3>Total Findings</h3><div class="value">\${totalFindings}</div></div>
    <div class="stat-card"><h3>Latest Mode</h3><div class="value">\${escapeHtml(latest.mode)}</div></div>
  \`;
  const severityKeys = Object.keys(latest.findingsBySeverity);
  new Chart(document.getElementById('severityChart'), { type: 'bar', data: { labels: severityKeys, datasets: [{ label: 'Findings', data: severityKeys.map(k => latest.findingsBySeverity[k]), backgroundColor: severityKeys.map(k => colorFor(k, SEVERITY_COLORS)) }] }, options: { responsive: true, plugins: { legend: { display: false } } } });
  const categoryKeys = Object.keys(latest.findingsByCategory);
  new Chart(document.getElementById('categoryChart'), { type: 'doughnut', data: { labels: categoryKeys, datasets: [{ data: categoryKeys.map(k => latest.findingsByCategory[k]), backgroundColor: categoryKeys.map(k => colorFor(k)) }] }, options: { responsive: true } });
  new Chart(document.getElementById('scoreChart'), { type: 'line', data: { labels: runs.map(r => new Date(r.timestamp).toLocaleTimeString()), datasets: [{ label: 'Score', data: runs.map(r => r.score), borderColor: '#58a6ff', tension: 0.3 }] }, options: { responsive: true, scales: { y: { min: 0, max: 100 } } } });
  const tbody = document.getElementById('runs-body');
  runs.slice().reverse().forEach((r) => {
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    tdTime.textContent = new Date(r.timestamp).toLocaleString();
    const tdMode = document.createElement('td');
    tdMode.textContent = r.mode;
    const tdFindings = document.createElement('td');
    tdFindings.textContent = r.totalFindings;
    const tdScore = document.createElement('td');
    tdScore.textContent = r.score ?? 'N/A';
    const tdDuration = document.createElement('td');
    tdDuration.textContent = \`\${r.durationMs}ms\`;
    tr.append(tdTime, tdMode, tdFindings, tdScore, tdDuration);
    tbody.appendChild(tr);
  });
}
loadData();
</script>
</body>
</html>`;

export class DashboardServer {
  private server: ReturnType<typeof createServer> | null = null;
  private data: DashboardData = { runs: [] };
  private shutdownRegistered = false;

  constructor(
    private port: number,
    private dataDir: string,
  ) {
    this.loadData();
  }

  private dataPath(): string {
    return resolve(this.dataDir, "dashboard.json");
  }

  private loadData(): void {
    const p = this.dataPath();
    if (existsSync(p)) {
      try {
        const parsed = JSON.parse(readFileSync(p, "utf8"));
        this.data = parsed && Array.isArray(parsed.runs) ? parsed : { runs: [] };
      } catch {
        this.data = { runs: [] };
      }
    }
  }

  private saveData(): void {
    const p = this.dataPath();
    const dir = resolve(this.dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(p, JSON.stringify(this.data, null, 2), "utf8");
  }

  recordRun(run: DashboardData["runs"][0]): void {
    this.data.runs.push(run);
    if (this.data.runs.length > 100) this.data.runs = this.data.runs.slice(-100);
    this.saveData();
  }

  start(): void {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/api/data") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.data));
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HTML_PAGE);
      }
    });
    this.server.listen(this.port, () => {
      logger.info(`Dashboard server started at http://localhost:${this.port}`);
    });

    this.registerShutdownHandlers();
  }

  private registerShutdownHandlers(): void {
    if (this.shutdownRegistered) return;
    this.shutdownRegistered = true;
    const shutdown = () => {
      logger.info("Shutting down dashboard server...");
      this.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
