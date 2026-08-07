import { execSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  path: string | null;
  detect(): boolean;
  run(root: string): Finding[];
}

const ONE_MB = 1024 * 1024;
const MAX_BUFFER = 10 * ONE_MB;
const SNIPPET_LENGTH = 80;

function redactSecret(value: string): string {
  return `${value.slice(0, 8)}[redacted ${value.length} chars]`;
}

function createExecScanner(opts: {
  name: string;
  detectCmd: string;
  runArgs: string;
  buildFindings: (out: string) => Finding[];
}): ScannerTool {
  const tool: ScannerTool = {
    name: opts.name,
    path: null,
    detect(): boolean {
      try {
        tool.path = execSync(`which ${opts.detectCmd}`, { stdio: "pipe" }).toString().trim();
        return true;
      } catch {
        logger.debug(`${opts.name} not found`);
        return false;
      }
    },
    run(root: string): Finding[] {
      if (!tool.path) return [];
      try {
        const out = execSync(
          `"${tool.path}" ${opts.runArgs} 2>/dev/null || true`,
          { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
        );
        return opts.buildFindings(out);
      } catch (e) {
        logger.warn(`${opts.name} run failed: ${e}`);
        return [];
      }
    },
  };
  return tool;
}

function parseTrufflehogLine(line: string): Finding | null {
  try {
    const r = JSON.parse(line);
    return {
      file: r.SourceMetadata?.Data?.Filesystem?.file ?? "unknown",
      line: r.SourceMetadata?.Data?.Filesystem?.line ?? null,
      severity: "high" as const,
      category: "security" as const,
      comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
      suggestion: `Matched: ${redactSecret(r.Raw ?? "")}`,
      source: "scanner" as const,
    } as Finding;
  } catch {
    logger.warn("Failed to parse trufflehog JSON line");
    return null;
  }
}

const gitleaks = createExecScanner({
  name: "gitleaks",
  detectCmd: "gitleaks",
  runArgs: "detect --no-git --source . --report-format json --report-path /dev/stdout",
  buildFindings(out: string): Finding[] {
    if (!out.trim()) return [];
    let results: { File: string; StartLine: number; RuleID: string; Description: string; Match: string; Severity: string }[];
    try {
      results = JSON.parse(out);
    } catch {
      logger.warn("gitleaks JSON parse failed");
      return [];
    }
    return results.map((r) => ({
      file: r.File,
      line: r.StartLine || null,
      severity: (r.Severity?.toLowerCase() === "high" ? "high" : "critical") as "high" | "critical",
      category: "security" as const,
      comment: `[gitleaks] ${r.Description}`,
      suggestion: `Match: ${redactSecret(r.Match.trim())}`,
      source: "scanner" as const,
    }));
  },
});

const trufflehog = createExecScanner({
  name: "trufflehog",
  detectCmd: "trufflehog",
  runArgs: "filesystem . --json --no-verification",
  buildFindings(out: string): Finding[] {
    if (!out.trim()) return [];
    const lines = out.trim().split("\n").filter(Boolean);
    return lines.map(parseTrufflehogLine).filter((f): f is Finding => f !== null);
  },
});

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
