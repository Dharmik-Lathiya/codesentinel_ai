import type { Finding } from "../analyzer/index.js";

export interface MetricsReport {
  totalFiles: number;
  totalFindings: number;
  findingsPerFile: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topCategories: { category: string; count: number }[];
}

export interface MetricsStore {
  reports: MetricsReport[];
  add(report: MetricsReport): void;
  average(): MetricsReport | null;
}

export function computeMetrics(
  files: { path: string }[],
  findings: Finding[],
): MetricsReport {
  const counts: Record<string, number> = {};
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const f of findings) {
    counts[f.category] = (counts[f.category] ?? 0) + 1;
    if (f.severity === "critical") critical++;
    else if (f.severity === "high") high++;
    else if (f.severity === "medium") medium++;
    else if (f.severity === "low") low++;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  return {
    totalFiles: files.length,
    totalFindings: findings.length,
    findingsPerFile: findings.length / files.length,
    criticalCount: critical,
    highCount: high,
    mediumCount: medium,
    lowCount: low,
    topCategories: sorted,
  };
}

export function createMetricsStore(): MetricsStore {
  const reports: MetricsReport[] = [];

  return {
    reports,
    add(report: MetricsReport) {
      reports.push(report);
    },
    average() {
      if (reports.length === 0) return null;
      const total = reports.length;
      const sumFindings = reports.reduce((s, r) => s + r.totalFindings, 0);
      const sumFiles = reports.reduce((s, r) => s + r.totalFiles, 0);
      const sumCritical = reports.reduce((s, r) => s + r.criticalCount, 0);
      const sumHigh = reports.reduce((s, r) => s + r.highCount, 0);

      const last = reports[reports.length - 1];

      return {
        totalFiles: sumFiles / total,
        totalFindings: sumFindings / total,
        findingsPerFile: sumFindings / sumFiles,
        criticalCount: sumCritical / total,
        highCount: sumHigh / total,
        mediumCount: 0,
        lowCount: 0,
        topCategories: last.topCategories,
      };
    },
  };
}
