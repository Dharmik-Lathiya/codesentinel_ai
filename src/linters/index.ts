import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Finding } from "../analyzer/index.js";
import { logger } from "../utils/logger.js";

const MAX_BUFFER = 10 * 1024 * 1024;

export interface LinterTool {
  name: string;
  detect(root: string): boolean;
  run(root: string, extraArgs: string[]): Finding[];
}

function tryParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface EslintMessage {
  filePath: string;
  messages: { line: number; severity: number; message: string; ruleId: string | null }[];
}

function toEslintFindings(f: EslintMessage): Finding[] {
  return f.messages.map((m) => ({
    file: f.filePath,
    line: m.line || null,
    severity: m.severity >= 2 ? "high" as const : "low" as const,
    category: "smell" as const,
    comment: m.message,
    suggestion: `See rule: ${m.ruleId ?? "unknown"}`,
    source: "linter" as const,
  }));
}

const eslint: LinterTool = {
  name: "eslint",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "eslint"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    try {
      const out = execSync(
        `npx eslint --format json --no-color ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (!out.trim()) return [];
      const results = tryParse<EslintMessage[]>(out);
      if (!results) return [];
      return results.flatMap(toEslintFindings);
    } catch (e) {
      logger.warn(`eslint run failed: ${e}`);
      return [];
    }
  },
};

interface BiomeDiagnostic {
  location: { path: { file: string }; span: { start: { line: number } } | null };
  severity: string;
  message: { text: string };
  category: string;
}

const biome: LinterTool = {
  name: "biome",
  detect(root: string): boolean {
    return existsSync(resolve(root, "node_modules", ".bin", "biome"));
  },
  run(root: string, extraArgs: string[]): Finding[] {
    try {
      const out = execSync(
        `npx biome lint --diagnostic-level=warn --max-diagnostics=200 ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (!out.trim()) return [];
      const parsed = tryParse<{ diagnostics: BiomeDiagnostic[] }>(out);
      if (!parsed) return [];
      return (parsed.diagnostics ?? []).map((d) => ({
        file: d.location.path.file,
        line: d.location.span?.start.line ?? null,
        severity: d.severity === "error" ? "high" as const : "medium" as const,
        category: "smell" as const,
        comment: d.message.text,
        suggestion: `Category: ${d.category}`,
        source: "linter" as const,
      }));
    } catch (e) {
      logger.warn(`biome run failed: ${e}`);
      return [];
    }
  },
};

interface PylintMessage {
  path: string;
  line: number;
  message: string;
  symbol: string;
  type: string;
}

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
    try {
      const out = execSync(
        `pylint --output-format=json ${extraArgs.join(" ")} . 2>/dev/null || true`,
        { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER },
      );
      if (!out.trim()) return [];
      const results = tryParse<PylintMessage[]>(out);
      if (!results) return [];
      return results.map((m) => ({
        file: m.path,
        line: m.line || null,
        severity: (m.type === "error" || m.type === "fatal" ? "high" : m.type === "warning" ? "medium" : "low") as "high" | "medium" | "low",
        category: "smell" as const,
        comment: m.message,
        suggestion: `Symbol: ${m.symbol}`,
        source: "linter" as const,
      }));
    } catch (e) {
      logger.warn(`pylint run failed: ${e}`);
      return [];
    }
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