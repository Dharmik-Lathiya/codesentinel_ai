import { execSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Finding[];
}

const ONE_KB = 1024;
const ONE_MB = ONE_KB * ONE_KB;
const MAX_BUFFER_SIZE_IN_MB = 10;
const MAX_BUFFER = MAX_BUFFER_SIZE_IN_MB * ONE_MB;
const SNIPPET_MAX_CHAR_LENGTH = 80;

function parseTrufflehogLine(line: string): Finding | null {
  try {
    const r = JSON.parse(line);
    return {
      file: r.SourceMetadata?.Data?.Filesystem?.file ?? "unknown",
      line: r.SourceMetadata?.Data?.Filesystem?.line ?? null,
      severity: "high" as const,
      category: "security" as const,
      comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
      suggestion: `Matched: ${(r.Raw || "").slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
      source: "scanner" as const,
    };
  } catch {
    logger.warn("Failed to parse trufflehog JSON line");
    return null;
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
      return results
        .filter((r): r is (typeof results)[number] => typeof r.File === "string" && r.File.length > 0)
        .map((r) => ({
          file: r.File,
          line: r.StartLine || null,
          severity: r.Severity?.toLowerCase() === "high" ? "high" : "critical",
          category: "security" as const,
          comment: `[gitleaks] ${r.Description ?? ""}`,
          suggestion: `Match: ${(r.Match ?? "").trim().slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
          source: "scanner" as const,
        }));
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        logger.warn(`gitleaks output exceeded ${MAX_BUFFER_SIZE_IN_MB}MB maxBuffer; results truncated. Scan a smaller directory or raise maxBuffer.`);
      } else {
        logger.warn(`gitleaks run failed: ${e}`);
      }
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
        "trufflehog filesystem . --json 2>/dev/null || true",
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (!out.trim()) return [];
      const lines = out.trim().split("\n").filter(Boolean);
      return lines.map(parseTrufflehogLine).filter((f): f is Finding => f !== null);
    } catch (e) {
      if ((e as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        logger.warn(`trufflehog output exceeded ${MAX_BUFFER_SIZE_IN_MB}MB maxBuffer; results truncated. Scan a smaller directory or raise maxBuffer.`);
      } else {
        logger.warn(`trufflehog run failed: ${e}`);
      }
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
