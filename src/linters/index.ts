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

const eslint: LinterTool = {
  name: "eslint",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "eslint"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    const bin = resolve(root, "node_modules", ".bin", "eslint");
    const res = spawnSync(bin, ["--format", "json", "--no-color", ...extraArgs, "."], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error || res.status === null) {
      logger.warn(`eslint run failed: ${res.error?.message ?? "unknown error"}`);
      return [];
    }
    if (res.stderr) logger.warn(`eslint stderr: ${res.stderr.trim()}`);
    if (!res.stdout?.trim()) return [];
    const results: { filePath: string; messages: { line: number; severity: number; message: string; ruleId: string | null }[] }[] = JSON.parse(res.stdout);
    return results.flatMap((f) =>
      f.messages.map((m) => ({
        file: f.filePath,
        line: m.line || null,
        severity: m.severity >= 2 ? "high" as const : m.severity === 1 ? "medium" as const : "low" as const,
        category: "smell" as const,
        comment: m.message,
        suggestion: `See rule: ${m.ruleId ?? "unknown"}`,
        source: "linter" as const,
      })),
    );
  },
};

const biome: LinterTool = {
  name: "biome",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "biome"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    const bin = resolve(root, "node_modules", ".bin", "biome");
    const res = spawnSync(bin, ["lint", "--diagnostic-level=warn", "--max-diagnostics=200", ...extraArgs, "."], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error || res.status === null) {
      logger.warn(`biome run failed: ${res.error?.message ?? "unknown error"}`);
      return [];
    }
    if (res.stderr) logger.warn(`biome stderr: ${res.stderr.trim()}`);
    if (!res.stdout?.trim()) return [];
    const parsed: { diagnostics: { location: { path: { file: string }; span: { start: { line: number } } | null }; severity: string; message: { text: string }; category: string }[] } = JSON.parse(res.stdout);
    return (parsed.diagnostics ?? []).map((d) => ({
      file: d.location.path.file,
      line: d.location.span?.start.line ?? null,
      severity: d.severity === "error" ? "high" as const : "medium" as const,
      category: "smell" as const,
      comment: d.message.text,
      suggestion: `Category: ${d.category}`,
      source: "linter" as const,
    }));
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
    const res = spawnSync("pylint", ["--output-format=json", ...extraArgs, "."], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error || res.status === null) {
      logger.warn(`pylint run failed: ${res.error?.message ?? "unknown error"}`);
      return [];
    }
    if (res.stderr) logger.warn(`pylint stderr: ${res.stderr.trim()}`);
    if (!res.stdout?.trim()) return [];
    const results: { path: string; line: number; message: string; symbol: string; type: string }[] = JSON.parse(res.stdout);
    return results.map((m) => ({
      file: m.path,
      line: m.line || null,
      severity: (m.type === "error" || m.type === "fatal" ? "high" : m.type === "warning" ? "medium" : "low") as "high" | "medium" | "low",
      category: "smell" as const,
      comment: m.message,
      suggestion: `Symbol: ${m.symbol}`,
      source: "linter" as const,
    }));
  },
};

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
