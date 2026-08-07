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

const PKG_VERSION = (() => {
  try {
    return (createRequire(import.meta.url)("../../package.json") as { version: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: encodeURI(file.replace(/\\/g, "/")) },
      ...(line != null && line > 0 ? { region: { startLine: line } } : {}),
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
    const ruleId = `${f.category}:${simpleHash(f.comment)}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: f.comment },
      });
    }
    const level = SEVERITY_MAP[f.severity];
    if (level === undefined) {
      throw new Error(`Unknown severity "${f.severity}" in renderSarif`);
    }
    results.push({
      ruleId,
      level,
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
