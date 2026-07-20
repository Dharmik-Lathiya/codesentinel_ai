import { execSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Finding[];
}

const gitleaks: ScannerTool = {
  name: "gitleaks",
  detect(): boolean {
    try {
      execSync("which gitleaks", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root: string): Finding[] {
    try {
      const out = execSync(
        "gitleaks detect --no-git --source . --report-format json --report-path /dev/stdout 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      if (!out.trim()) return [];
      const results: { File: string; StartLine: number; RuleID: string; Description: string; Match: string; Severity: string }[] = JSON.parse(out);
      return results.map((r) => ({
        file: r.File,
        line: r.StartLine || null,
        severity: (r.Severity?.toLowerCase() === "high" ? "high" : "critical") as "high" | "critical",
        category: "security" as const,
        comment: `[gitleaks] ${r.Description}`,
        suggestion: `Match: ${r.Match.trim().slice(0, 80)}`,
        source: "scanner" as const,
      }));
    } catch (e) {
      logger.warn(`gitleaks run failed: ${e}`);
      return [];
    }
  },
};

const trufflehog: ScannerTool = {
  name: "trufflehog",
  detect(): boolean {
    try {
      execSync("which trufflehog", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root: string): Finding[] {
    try {
      const out = execSync(
        "trufflehog filesystem . --json --no-verification 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      if (!out.trim()) return [];
      const lines = out.trim().split("\n").filter(Boolean);
      return lines.map((line) => {
        try {
          const r = JSON.parse(line);
          return {
            file: r.SourceMetadata?.Data?.Filesystem?.file ?? "unknown",
            line: r.SourceMetadata?.Data?.Filesystem?.line ?? null,
            severity: "high" as const,
            category: "security" as const,
            comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
            suggestion: `Matched: ${(r.Raw || "").slice(0, 80)}`,
            source: "scanner" as const,
          } as Finding;
        } catch {
          return null;
        }
      }).filter((f): f is Finding => f !== null);
    } catch (e) {
      logger.warn(`trufflehog run failed: ${e}`);
      return [];
    }
  },
};

const scanners: Record<string, ScannerTool> = { gitleaks, trufflehog };

export function runThirdPartySecrets(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const [name, tool] of Object.entries(scanners)) {
    if (!tool.detect()) {
      logger.info(`Secret scanner "${name}" not found, skipping`);
      continue;
    }
    logger.info(`Running secret scanner: ${name}`);
    const start = Date.now();
    const result = tool.run(root);
    logger.info(`Secret scanner "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
    findings.push(...result);
  }
  return findings;
}
