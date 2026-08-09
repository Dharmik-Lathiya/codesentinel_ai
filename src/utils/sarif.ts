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

const SARIF_SCHEMA_URL =
  "https://docs.oasis-open.org/sarif/sarif/v2.1.0/os/schemas/sarif-schema-2.1.0.json";

let warnedUnknownSeverity = false;

function resolveLevel(severity: string): "error" | "warning" | "note" {
  const level = SEVERITY_MAP[severity];
  if (level) return level;
  if (!warnedUnknownSeverity) {
    warnedUnknownSeverity = true;
    console.warn(`sarif: unknown severity "${severity}" mapped to "warning"`);
  }
  return "warning";
}

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
    ? `${text.slice(0, COMMENT_TRUNCATION_LENGTH)}...`
    : text;
}

const encodePathSegment = (segment: string): string => encodeURIComponent(segment);

function createRuleId(
  base: string,
  comment: string,
  rules: Map<string, ReportingDescriptor>
): string {
  const hash = simpleHash(comment);
  let ruleId = `${base}:${hash}`;
  for (let n = 1; rules.has(ruleId) && rules.get(ruleId)?.shortDescription.text !== truncateComment(comment); n++) {
    ruleId = `${base}:${hash}:${n}`;
  }
  return ruleId;
}

function createArtifactUri(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  const driveMatch = /^([A-Za-z]):\/?(.*)$/.exec(normalized);
  const isAbsolute = normalized.startsWith("/");

  const tail = (driveMatch ? driveMatch[2] : normalized)
    .split("/")
    .filter(Boolean)
    .map(encodePathSegment)
    .join("/");

  if (driveMatch) {
    return `file:///${driveMatch[1]}:${tail ? `/${tail}` : "/"}`;
  }
  if (isAbsolute) {
    return `file:///${tail}`;
  }
  return tail;
}

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: createArtifactUri(file) },
      ...(line != null && Number.isInteger(line) && line > 0 ? { region: { startLine: line } } : {}),
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
    const ruleId = createRuleId(f.category, f.comment, rules);
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: truncateComment(f.comment) },
      });
    }
    results.push({
      ruleId,
      level: resolveLevel(f.severity),
      message: { text: f.comment },
      locations: [createSarifLocation(f.file, f.line ?? undefined)],
    });
  }

  const sarif: SarifLog = {
    $schema: SARIF_SCHEMA_URL,
    version: "2.1.0",
    runs: [createSarifRun(rules, results)],
  };

  return JSON.stringify(sarif, null, 2);
}
