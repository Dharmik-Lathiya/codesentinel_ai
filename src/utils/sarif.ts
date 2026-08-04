import { createRequire } from "node:module";
import type { EngineReport } from "../engine/index.js";

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: { startLine: number };
    };
  }>;
}

interface SarifRun {
  tool: { driver: { name: string; version: string; rules: ReportingDescriptor[] } };
  results: SarifResult[];
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}
interface ReportingDescriptor {
  id: string;
  shortDescription: { text: string };
}

function loadVersion(): string {
  const fromEnv = process.env.npm_package_version;
  if (fromEnv) return fromEnv;
  try {
    return (createRequire(import.meta.url)("../../package.json") as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const PKG_VERSION = loadVersion();

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

const COMMENT_TRUNCATION_LENGTH = 80;

function truncateComment(s: string): string {
  return s.length > COMMENT_TRUNCATION_LENGTH ? `${s.slice(0, COMMENT_TRUNCATION_LENGTH)}...` : s;
}

function encodeUri(file: string): string {
  return file.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
}

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: file.trim() ? encodeUri(file) : "(unknown)" },
      ...(line != null ? { region: { startLine: line } } : {}),
    },
  };
}

function createToolDriver(
  rules: Map<string, ReportingDescriptor>
): { name: string; version: string; rules: ReportingDescriptor[] } {
  return {
    name: "CodeSentinel AI",
    version: PKG_VERSION,
    rules: Array.from(rules.values()),
  };
}

function createSarifRun(
  rules: Map<string, ReportingDescriptor>,
  results: SarifResult[]
): SarifRun {
  return {
    tool: {
      driver: createToolDriver(rules),
    },
    results,
  };
}

export function renderSarif(report: EngineReport): string {
  const rules = new Map<string, ReportingDescriptor>();
  const results: SarifResult[] = [];

  for (const f of report.findings) {
    const ruleId = `codesentinel/${f.category}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: truncateComment(f.comment) },
      });
    }
    results.push({
      ruleId,
      level: SEVERITY_MAP[f.severity] ?? "note",
      message: { text: f.comment },
      locations: [createSarifLocation(f.file, f.line ?? undefined)],
    });
  }

  const sarif: SarifLog = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [createSarifRun(rules, results)],
  };

  return JSON.stringify(sarif, null, 2);
}
