import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  const fallback = "0.0.0";
  try {
    const require = createRequire(import.meta.url);
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      const candidate = resolve(dir, "package.json");
      if (existsSync(candidate)) {
        return (require(candidate) as { version?: string }).version ?? fallback;
      }
      dir = resolve(dir, "..");
    }
    return fallback;
  } catch {
    return fallback;
  }
})();

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: file.replace(/\\/g, "/").split("/").map((seg) => encodeURIComponent(seg)).join("/") },
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
    const ruleId = f.category;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: f.category },
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
    runs: results.length > 0 ? [createSarifRun(rules, results)] : [],
  };

  return JSON.stringify(sarif, null, 2);
}
