import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Finding } from "../analyzer/index.js";
import type { Dismissal } from "../config/types.js";

export class DismissalManager {
  private dismissals: Dismissal[] = [];

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, "utf8");
        this.dismissals = JSON.parse(raw);
      } catch {
        this.dismissals = [];
      }
    }
  }

  private save(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.dismissals, null, 2), "utf8");
  }

  dismiss(finding: Finding, reason: string): void {
    this.dismissals.push({
      file: finding.file,
      line: finding.line,
      ruleId: `${finding.category}:${finding.comment.slice(0, 40)}`,
      reason,
      dismissedAt: new Date().toISOString(),
    });
    this.save();
  }

  dismissByRule(ruleId: string, reason: string): void {
    this.dismissals.push({
      file: "",
      line: null,
      ruleId,
      reason,
      dismissedAt: new Date().toISOString(),
    });
    this.save();
  }

  isDismissed(finding: Finding): boolean {
    const ruleId = `${finding.category}:${finding.comment.slice(0, 40)}`;
    return this.dismissals.some(
      (d) =>
        d.ruleId === ruleId &&
        d.file === finding.file &&
        (d.line === null || d.line === finding.line),
    );
  }

  filterDismissed(findings: Finding[]): Finding[] {
    return findings.filter((f) => !this.isDismissed(f));
  }

  listDismissals(): Dismissal[] {
    return [...this.dismissals];
  }

  clearDismissals(): void {
    this.dismissals = [];
    this.save();
  }
}
