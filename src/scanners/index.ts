import { execSync, spawnSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Finding[];
}

const BYTES_PER_KILOBYTE = 1024;
const ONE_MB = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
const MAX_BUFFER_SIZE_IN_MB = 10;
const MAX_BUFFER = MAX_BUFFER_SIZE_IN_MB * ONE_MB;
const SNIPPET_MAX_CHAR_LENGTH = 80;

interface TrufflehogRecord {
  DetectorName?: string;
  Description?: string;
  Raw?: string;
  SourceMetadata?: {
    Data?: {
      Filesystem?: {
        file?: string;
        line?: number;
      };
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTrufflehogRecord(r: unknown): Finding | null {
  if (!isRecord(r)) {
    logger.warn("Failed to parse trufflehog JSON record");
    return null;
  }
  const record = r as Partial<TrufflehogRecord>;
  const raw = typeof record.Raw === "string" ? record.Raw : "";
  const rawLine = record.SourceMetadata?.Data?.Filesystem?.line;
  const line = typeof rawLine === "number" && Number.isFinite(rawLine) ? rawLine : null;
  const filePath = record.SourceMetadata?.Data?.Filesystem?.file;
  return {
    file: typeof filePath === "string" ? filePath : "unknown",
    line,
    severity: "high" as const,
    category: "security" as const,
    comment: `[trufflehog] ${record.DetectorName ?? "secret"}: ${record.Description ?? ""}`,
    suggestion: `Matched: ${raw.trim().slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
    source: "scanner" as const,
  };
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
      const res = spawnSync(
        "gitleaks",
        ["detect", "--no-git", "--source", ".", "--report-format", "json", "--report-path", "/dev/stdout"],
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (res.error) throw res.error;
      const out = res.stdout ?? "";
      if (!out.trim()) {
        if (res.status !== 0) {
          logger.warn(`gitleaks run failed (exit ${res.status})${res.stderr ? `: ${res.stderr}` : ""}`);
        }
        return [];
      }
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
severity: (r.Severity?.toLowerCase() ?? "medium") as Finding["severity"],
        category: "security" as const,
        comment: `[gitleaks] ${r.Description}`,
        suggestion: `Match: ${r.Match.trim().slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
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
      const trimmed = out.trim();
      if (!trimmed) return [];
      let records: unknown[] = [];
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) records = parsed;
      } catch {
      }
      if (records.length === 0) {
        for (const line of trimmed.split("\n")) {
          if (!line.trim()) continue;
          try {
            records.push(JSON.parse(line) as unknown);
          } catch {
            logger.warn("Failed to parse trufflehog JSON record");
          }
        }
      }
      const findings: Finding[] = [];
      for (const record of records) {
        const finding = parseTrufflehogRecord(record);
        if (finding) findings.push(finding);
      }
      return findings;
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
