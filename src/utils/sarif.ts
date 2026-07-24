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
  tool: { driver: { name: string; version: string; rules: Array<{ id: string; shortDescription: { text: string } }> } };
  results: SarifResult[];
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

const SEVERITY_MAP: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

const MAX_COMMENT_LENGTH = 40;

function createSarifLocation(file: string, line?: number): SarifResult["locations"][number] {
  return {
    physicalLocation: {
      artifactLocation: { uri: file },
      ...(line ? { region: { startLine: line } } : {}),
    },
  };
}

function createToolDriver(
  rules: Map<string, { id: string; shortDescription: { text: string } }>
): { name: string; version: string; rules: Array<{ id: string; shortDescription: { text: string } }> } {
  return {
    name: "CodeSentinel AI",
    version: "0.1.6",
    rules: [...rules.values()],
  };
}

export function renderSarif(report: EngineReport): string {
  const rules = new Map<string, { id: string; shortDescription: { text: string } }>();
  const results: SarifResult[] = [];

  for (const f of report.findings) {
    const ruleId = `${f.category}:${f.comment.slice(0, MAX_COMMENT_LENGTH).replace(/[^a-zA-Z0-9]/g, "_")}`;
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: f.comment },
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
    runs: [
      {
        tool: {
          driver: createToolDriver(rules),
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
