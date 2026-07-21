import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonc } from "../utils/jsonc.js";

export interface ConfigOverride {
  path?: string;
  branch?: string;
  review?: { inline?: boolean };
  fix?: { maxIterations?: number };
}

export interface OpenCodeReviewerConfig {
  project?: { name?: string; description?: string; conventions?: string[]; commandReference?: string };
  review?: { customRules?: { id: string; pattern: string; severity: string; category: string; comment: string }[]; inline?: boolean };
  fix?: { maxIterations?: number; runChecks?: string[]; checkAllowlist?: string[] };
  audit?: { promptsDir?: string; categories?: string[]; targetDirs?: string[]; createIssues?: boolean; autoFix?: boolean };
  learning?: { enabled?: boolean; metaReview?: boolean; patternDiscovery?: boolean };
  overrides?: ConfigOverride[];
  mcpServers?: { name: string; type: "local" | "remote"; command?: string[]; url?: string; environment?: Record<string, string> }[];
}

const SEARCH_PATHS = [
  ".opencode-reviewer.yml",
  ".opencode-reviewer.yaml",
  "codesentinel.config.yml",
  "codesentinel.config.yaml",
  "codesentinel.config.json",
];

export function searchConfigPaths(cwd?: string): string | null {
  const dir = cwd ?? process.cwd();
  if (process.env.CODESENTINEL_CONFIG) {
    const p = resolve(dir, process.env.CODESENTINEL_CONFIG);
    if (existsSync(p)) return p;
  }
  for (const name of SEARCH_PATHS) {
    const p = resolve(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadYamlConfig(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return parseJsonc(raw) as Record<string, unknown>;
  }
  try {
    const yamlModule = require("js-yaml") as typeof import("js-yaml");
    return yamlModule.load(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse YAML config ${filePath}: ${err}`);
  }
}

export function getApplicableOverrides(
  overrides: ConfigOverride[] | undefined,
  filePath: string,
  branchName?: string,
): ConfigOverride[] {
  if (!overrides?.length) return [];
  const micromatch = (pattern: string, value: string): boolean => {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
    return regex.test(value);
  };
  return overrides.filter((o) => {
    let match = true;
    if (o.path) match = match && micromatch(o.path, filePath);
    if (o.branch && branchName) match = match && micromatch(o.branch, branchName);
    return match;
  });
}
