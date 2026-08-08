import { execSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Finding[];
}

const BYTES_PER_KILOBYTE = 1024;
const ONE_KB = BYTES_PER_KILOBYTE;
const ONE_MB = ONE_KB * ONE_KB;
const MAX_BUFFER_SIZE_IN_MB = 10;
const MAX_BUFFER_MB = MAX_BUFFER_SIZE_IN_MB;
const MAX_BUFFER = MAX_BUFFER_MB * ONE_MB;
const SNIPPET_MAX_CHAR_LENGTH = 80;
const SNIPPET_LENGTH = SNIPPET_MAX_CHAR_LENGTH;

const TRUFFLEHOG_HIGH_CONFIDENCE = [
  "AWS",
  "Azure",
  "GCP",
  "Postgres",
  "MsSQL",
  "MySQL",
  "Stripe",
  "GitHub",
  "Gitlab",
  "JWT",
];

function trufflehogSeverity(detectorName: string): "low" | "medium" | "high" {
  if (TRUFFLEHOG_HIGH_CONFIDENCE.some((d) => detectorName.includes(d))) {
    return "high";
  }
  return "medium";
}

export function parseTrufflehogLine(line: string): Finding | null {
  try {
    const r = JSON.parse(line);
    const lineNumber = Number(r.SourceMetadata?.Data?.Filesystem?.line);
    const fsFile = r.SourceMetadata?.Data?.Filesystem?.file;
    if (typeof fsFile !== "string") {
      logger.debug("trufflehog line missing filesystem metadata, skipping");
      return null;
    }
    const detectorName = String(r.DetectorName ?? "secret");
    return {
      file: fsFile,
      line: Number.isFinite(lineNumber) ? lineNumber : null,
      severity: trufflehogSeverity(detectorName),
      category: "security" as const,
      comment: `[trufflehog] ${detectorName}: ${r.Description ?? ""}`,
      suggestion: `Matched: ${(r.Raw || "").slice(0, SNIPPET_LENGTH)}`,
      source: "scanner" as const,
    };
  } catch {
    logger.warn("Failed to parse trufflehog JSON line");
    return null;
  }
}

function trufflehogIsV3(): boolean {
  try {
    const version = execSync("trufflehog --version", { encoding: "utf8" }).trim();
    return /^v3\./.test(version);
  } catch {
    return true;
  }
}

const gitleaks: ScannerTool = {
  name: "gitleaks",
  detect(): boolean {
    try {
      execSync("which gitleaks", { stdio: "ignore" });
      return true;
    } catch {
      logger.debug("gitleaks not found");
      return false;
    }
  },
  run(root: string): Finding[] {
    try {
      const out = execSync(
        "gitleaks detect --no-git --source . --report-format json --report-path /dev/stdout 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
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
        suggestion: `Match: ${r.Match.trim().slice(0, SNIPPET_LENGTH)}`,
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
      logger.debug("trufflehog not found");
      return false;
    }
  },
  run(root: string): Finding[] {
    try {
      const out = execSync(
        "trufflehog filesystem . --json --no-verification 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (!out.trim()) return [];
      const lines = out.trim().split("\n").filter(Boolean);
      return lines.map(parseTrufflehogLine).filter((f): f is Finding => f !== null);
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
