import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { EngineReport } from "../engine/index.js";
import type { Severity } from "../config/types.js";
import { logger } from "./logger.js";

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
    logger.warn('Could not resolve package.json version, defaulting to "0.0.0"');
    return "0.0.0";
  }
})();

type SarifLevel = "error" | "warning" | "note";

const SEVERITY_MAP: Record<Severity, SarifLevel> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

function sarifLevel(severity: Severity): SarifLevel {
  const level: SarifLevel | undefined = SEVERITY_MAP[severity];
  if (level == null) {
    logger.warn(`Unhandled finding severity "${severity}", defaulting to "note"`);
    return "note";
  }
  return level;
}

const COMMENT_TRUNCATION_LENGTH = 40;

function ruleHash(comment: string): string {
  return createHash("sha1").update(comment).digest("hex").slice(0, 12);
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
    const ruleId = `${f.category}:${ruleHash(f.comment)}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: f.comment },
      });
    }
    results.push({
      ruleId,
      level: sarifLevel(f.severity),
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
