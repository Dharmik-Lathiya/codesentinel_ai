import { execFile, execSync } from "node:child_process";
import { promisify } from "node:util";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

interface ScannerTool {
  name: string;
  detect(): boolean;
  run(root: string): Promise<Finding[]>;
}

const BYTES_PER_KILOBYTE = 1024;
const MAX_BUFFER_SIZE_IN_MB = 10;
const MAX_BUFFER = MAX_BUFFER_SIZE_IN_MB * BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
const SNIPPET_MAX_CHAR_LENGTH = 80;

const execFileAsync = promisify(execFile);

interface ExecResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

async function runScanner(root: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout } = await execFileAsync(args[0], args.slice(1), {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
    });
    return { stdout: stdout as string, stderr: "", status: 0 };
  } catch (err) {
    const e = err as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number | null;
      code?: string | number;
    };
    if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      logger.warn(`Scanner output exceeded ${MAX_BUFFER_SIZE_IN_MB}MB buffer; scan truncated`);
    }
    return {
      stdout: String(e.stdout ?? ""),
      stderr: String(e.stderr ?? ""),
      status: typeof e.status === "number" ? e.status : null,
    };
  }
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
      suggestion: `Matched: ${String(r.Raw ?? "").slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
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
  async run(root: string): Promise<Finding[]> {
    const { stdout, stderr, status } = await runScanner(root, [
      "gitleaks",
      "detect",
      "--no-git",
      "--source",
      ".",
      "--report-format",
      "json",
      "--report-path",
      "/dev/stdout",
    ]);
    if (status !== 0 && status !== 1) {
      logger.warn(`gitleaks run failed (exit code ${status}): ${stderr.trim() || "unknown error"}`);
      return [];
    }
    const out = stdout;
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
      suggestion: `Match: ${String(r.Match ?? "").trim().slice(0, SNIPPET_MAX_CHAR_LENGTH)}`,
      source: "scanner" as const,
    }));
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
  async run(root: string): Promise<Finding[]> {
    const { stdout, stderr, status } = await runScanner(root, [
      "trufflehog",
      "filesystem",
      ".",
      "--json",
      "--no-verification",
    ]);
    if (status !== 0 && status !== 1) {
      logger.warn(`trufflehog run failed (exit code ${status}): ${stderr.trim() || "unknown error"}`);
      return [];
    }
    const out = stdout;
    if (!out.trim()) return [];
    const lines = out.trim().split("\n").filter(Boolean);
    return lines.map(parseTrufflehogLine).filter((f): f is Finding => f !== null);
  },
};

const scanners: Record<string, ScannerTool> = { gitleaks, trufflehog };

export async function runThirdPartySecrets(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const running: Promise<void>[] = [];
  for (const [name, tool] of Object.entries(scanners)) {
    if (!tool.detect()) {
      logger.info(`Secret scanner "${name}" not found, skipping`);
      continue;
    }
    logger.info(`Running secret scanner: ${name}`);
    const start = Date.now();
    running.push(
      tool.run(root).then((result) => {
        logger.info(`Secret scanner "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
        findings.push(...result);
      }),
    );
  }
  await Promise.all(running);
  return findings;
}
