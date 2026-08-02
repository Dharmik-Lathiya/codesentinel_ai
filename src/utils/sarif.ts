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
  fullDescription?: { text: string };
  helpUri?: string;
}

let PKG_VERSION = "0.0.0";
let REPO_URL = "";
try {
  const pkg = createRequire(import.meta.url)("../../package.json") as {
    version: string;
    repository?: { url?: string };
  };
  PKG_VERSION = pkg.version;
  REPO_URL = pkg.repository?.url?.replace(/\.git$/, "").replace(/^git\+/, "") ?? "";
} catch {}

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

const COMMENT_TRUNCATION_LENGTH = 40;
const HASH_RADIX = 36;

function truncateComment(comment: string): string {
  return comment.length > COMMENT_TRUNCATION_LENGTH
    ? `${comment.slice(0, COMMENT_TRUNCATION_LENGTH)}...`
    : comment;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(HASH_RADIX);
}

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: file.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/") },
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
  const ruleIdsByComment = new Map<string, string>();

  for (const f of report.findings) {
    const commentKey = `${f.category}:${f.comment}`;
    let ruleId = ruleIdsByComment.get(commentKey);
    if (!ruleId) {
      ruleId = `${f.category}:${simpleHash(f.comment)}:${rules.size + 1}`;
      ruleIdsByComment.set(commentKey, ruleId);
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: truncateComment(f.comment) },
        fullDescription: { text: f.comment },
        helpUri: REPO_URL ? `${REPO_URL}/blob/main/README.md` : undefined,
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
