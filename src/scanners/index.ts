import { execSync } from "node:child_process";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Finding[];
}

const BYTES_PER_KB = 1024;
const MAX_BUFFER_MB = 10;
const MAX_BUFFER = MAX_BUFFER_MB * BYTES_PER_KB * BYTES_PER_KB;
const SNIPPET_LENGTH = 80;

function redactSecret(match: string): string {
  const trimmed = String(match ?? "").trim();
  if (trimmed.length <= 8) return trimmed.slice(0, SNIPPET_LENGTH);
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function gitleaksFindings(json: string): Finding[] {
  try {
    const results = JSON.parse(json) as Array<{
      File?: string;
      StartLine?: number;
      RuleID?: string;
      Description?: string;
      Match?: string;
      Severity?: string;
    }>;
    if (!Array.isArray(results)) return [];
    return results.map((r) => ({
      file: r.File ?? "unknown",
      line: r.StartLine || null,
      severity: (r.Severity?.toLowerCase() === "high" ? "high" : "critical") as "high" | "critical",
      category: "security" as const,
      comment: `[gitleaks] ${r.Description ?? ""}`,
      suggestion: `Match: ${redactSecret(r.Match ?? "")}`,
      source: "scanner" as const,
    }));
  } catch {
    logger.warn("gitleaks JSON parse failed");
    return [];
  }
}

function trufflehogFinder(out: string): Finding[] {
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(parseTrufflehogLine)
    .filter((f): f is Finding => f !== null);
}

function isMaxBufferError(e: unknown): boolean {
  return (e as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

function runScanner(root: string, cmd: string, parse: (stdout: string) => Finding[]): Finding[] {
  const name = cmd.split(" ")[0];
  try {
    const out = execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!out.trim()) return [];
    return parse(out);
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (isMaxBufferError(e)) {
      logger.warn(`[${name}] output exceeded maxBuffer; results truncated/lost`);
      return [];
    }
    if (err.stdout) {
      if (err.stderr && err.stderr.trim()) logger.warn(`[${name}] stderr: ${err.stderr.trim()}`);
      return parse(err.stdout);
    }
    logger.warn(`[${name}] run failed: ${err.stderr ? err.stderr.trim() : err}`);
    return [];
  }
}

function parseTrufflehogLine(line: string): Finding | null {
  try {
    const r = JSON.parse(line);
    const meta = r.SourceMetadata?.Data?.Filesystem ?? {};
    const matched = typeof r.Raw === "string" ? r.Raw : "";
    return {
      file: typeof meta.file === "string" ? meta.file : "unknown",
      line: typeof meta.line === "number" ? meta.line : null,
      severity: "high" as const,
      category: "security" as const,
      comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
      suggestion: `Matched: ${matched.slice(0, SNIPPET_LENGTH)}`,
      source: "scanner" as const,
    } as Finding;
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
    return runScanner(root, "gitleaks detect --no-git --source . --report-format json --report-path /dev/stdout", gitleaksFindings);
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
    return runScanner(root, "trufflehog filesystem . --json --no-verification", trufflehogFinder);
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
