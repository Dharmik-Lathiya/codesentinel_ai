import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

export interface LinterTool {
  name: string;
  detect(root: string): boolean;
  run(root: string, extraArgs: string[]): Finding[];
}

type Severity = "high" | "medium" | "low";

const MAX_BUFFER = 10 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

function levelToSeverity(level: number): Severity {
  return level >= 2 ? "high" : level === 1 ? "medium" : "low";
}

function runTool(
  label: string,
  root: string,
  cmd: string,
  cliArgs: string[],
  parse: (stdout: string) => Finding[],
): Finding[] {
  const res = spawnSync(cmd, cliArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
    timeout: TIMEOUT_MS,
    shell: process.platform === "win32",
  });
  const stderr = (typeof res.stderr === "string" ? res.stderr : "").trim();
  if (res.error) {
    logger.warn(`${label} run failed: ${res.error.message}`);
    return [];
  }
  if (res.signal) {
    logger.warn(`${label} run failed (timed out, signal ${res.signal})`);
    return [];
  }
  const out = (res.stdout ?? "").trim();
  if (!out) {
    if (stderr) logger.warn(`${label} exited with ${res.status}: ${stderr}`);
    return [];
  }
  try {
    return parse(out);
  } catch {
    if (stderr) logger.warn(`${label} exited with ${res.status}: ${stderr}`);
    else logger.warn(`${label} produced invalid JSON output`);
    return [];
  }
}

const eslint: LinterTool = {
  name: "eslint",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "eslint"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    return runTool("eslint", root, "npx", ["eslint", "--format", "json", "--no-color", ...extraArgs, "."], (out) => {
      const results = JSON.parse(out) as {
        filePath: string;
        messages: { line: number; severity: number; message: string; ruleId: string | null }[];
      }[];
      return results
        .flatMap((f) => f.messages.map((m) => toEslintFinding(f.filePath, m)))
        .slice(0, 200);
    });
  },
};

const biome: LinterTool = {
  name: "biome",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "biome"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    return runTool("biome", root, "npx", ["biome", "lint", "--diagnostic-level=warn", "--max-diagnostics=200", ...extraArgs, "."], (out) => {
      const parsed = JSON.parse(out) as {
        diagnostics?: {
          location: { path: { file: string }; span: { start: { line: number } } | null };
          severity: string;
          message: { text: string };
          category: string;
        }[];
      };
      return (parsed.diagnostics ?? []).map((d) => ({
        file: d.location.path.file,
        line: d.location.span?.start.line ?? null,
        severity: levelToSeverity(d.severity === "error" ? 2 : 1),
        category: "smell" as const,
        comment: d.message.text,
        suggestion: `Category: ${d.category}`,
        source: "linter" as const,
      }));
    });
  },
};

const pylint: LinterTool = {
  name: "pylint",
  detect(root: string): boolean {
    try {
      execSync("which pylint", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  run(root: string, extraArgs: string[]): Finding[] {
    return runTool("pylint", root, "pylint", ["--output-format=json", ...extraArgs, "."], (out) => {
      const results = JSON.parse(out) as { path: string; line: number; message: string; symbol: string; type: string }[];
      return results.map((m) => ({
        file: m.path,
        line: m.line || null,
        severity: levelToSeverity(m.type === "error" || m.type === "fatal" ? 2 : m.type === "warning" ? 1 : 0),
        category: "smell" as const,
        comment: m.message,
        suggestion: `Symbol: ${m.symbol}`,
        source: "linter" as const,
      }));
    });
  },
};

function toEslintFinding(filePath: string, m: { line: number; severity: number; message: string; ruleId: string | null }): Finding {
  return {
    file: filePath,
    line: m.line || null,
    severity: levelToSeverity(m.severity),
    category: "smell" as const,
    comment: m.message,
    suggestion: `See rule: ${m.ruleId ?? "unknown"}`,
    source: "linter" as const,
  };
}

const tools: Record<string, LinterTool> = { eslint, biome, pylint };

export function runLinters(root: string, config: { tools: string[]; args: Record<string, string[]> }): Finding[] {
  const active = config.tools.length > 0 ? config.tools : Object.keys(tools);
  const findings: Finding[] = [];
  for (const name of active) {
    const tool = tools[name];
    if (!tool) {
      logger.warn(`Unknown linter: "${name}", skipping`);
      continue;
    }
    if (!tool.detect(root)) {
      logger.info(`Linter "${name}" not found, skipping`);
      continue;
    }
    logger.info(`Running linter: ${name}`);
    const extra = config.args[name] ?? [];
    const start = Date.now();
    const result = tool.run(root, extra);
    logger.info(`Linter "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
    findings.push(...result);
  }
  return findings;
}
