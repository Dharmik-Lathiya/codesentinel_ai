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

function packageVersion(): string {
  try {
    return (createRequire(import.meta.url)("../../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

const COMMENT_TRUNCATION_LENGTH = 40;
const HASH_RADIX = 36;

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(HASH_RADIX);
}
function truncateComment(text: string): string {
  return text.length > COMMENT_TRUNCATION_LENGTH
    ? text.slice(0, COMMENT_TRUNCATION_LENGTH - 1) + "…"
    : text;
}

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: encodeURI(file.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F") },
      ...(line != null ? { region: { startLine: line } } : {}),
    },
  };
}

function createToolDriver(
  rules: Map<string, ReportingDescriptor>
): { name: string; version: string; rules: ReportingDescriptor[] } {
  return {
    name: "CodeSentinel AI",
    version: packageVersion(),
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
    const description = truncateComment(f.comment);
    const baseRuleId = `${f.category}:${simpleHash(f.comment)}`;
    let ruleId = baseRuleId;
    let suffix = 1;
    while (rules.has(ruleId) && rules.get(ruleId)?.shortDescription.text !== description) {
      ruleId = `${baseRuleId}-${suffix++}`;
    }
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: description },
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
