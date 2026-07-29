export interface OpencodeLine {
  type: "summary" | "verdict" | "strength" | "issue" | "suggestion";
  data: Record<string, unknown>;
}

export interface ReviewSummary {
  text: string;
}

export interface Verdict {
  ready: boolean;
  reasoning: string;
  autoFixable?: boolean;
  confidence?: "high" | "medium" | "low";
}

export interface Strength {
  file?: string;
  line?: number;
  message: string;
}

export interface Issue {
  severity: "critical" | "important" | "minor";
  file: string;
  line: number;
  message: string;
  suggestion?: string;
  suggestionCode?: string;
}

export interface Suggestion {
  file: string;
  line: number;
  suggestion: string;
}

export interface OpencodeResult {
  summary: string;
  verdict: { ready: boolean; reasoning: string };
  strengths: Strength[];
  issues: Issue[];
  suggestions: Suggestion[];
}

export function emptyOpencodeResult(): OpencodeResult {
  return {
    summary: "",
    verdict: { ready: false, reasoning: "" },
    strengths: [],
    issues: [],
    suggestions: [],
  };
}

const VALID_TYPES = new Set(["summary", "verdict", "strength", "issue", "suggestion"]);

function tryParseLine(raw: string): OpencodeLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.type === "string" && VALID_TYPES.has(obj.type) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      return { type: obj.type as OpencodeLine["type"], data: obj.data as Record<string, unknown> };
    }
  }
  return null;
}

export function parseOpencodeOutput(lines: string[]): OpencodeResult {
  const result = emptyOpencodeResult();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = tryParseLine(trimmed);
    if (!parsed) continue;

    switch (parsed.type) {
      case "summary":
        if (typeof parsed.data.text === "string") {
          result.summary = parsed.data.text;
        }
        break;

      case "verdict":
        if (typeof parsed.data.ready === "boolean" && typeof parsed.data.reasoning === "string") {
          result.verdict = { ready: parsed.data.ready, reasoning: parsed.data.reasoning };
        }
        break;

      case "strength": {
        const msg = parsed.data.message;
        if (typeof msg === "string") {
          result.strengths.push({
            file: typeof parsed.data.file === "string" ? parsed.data.file : undefined,
            line: typeof parsed.data.line === "number" ? parsed.data.line : undefined,
            message: msg,
          });
        }
        break;
      }

      case "issue": {
        const severity = parsed.data.severity;
        const file = parsed.data.file;
        const line = parsed.data.line;
        const message = parsed.data.message;
        if (typeof severity === "string" && typeof file === "string" && typeof line === "number" && typeof message === "string") {
          const valid = ["critical", "important", "minor"];
          if (valid.includes(severity)) {
            result.issues.push({
              severity: severity as Issue["severity"],
              file,
              line,
              message,
              suggestion: typeof parsed.data.suggestion === "string" ? parsed.data.suggestion : undefined,
              suggestionCode: typeof parsed.data.suggestionCode === "string" ? parsed.data.suggestionCode : undefined,
            });
          }
        }
        break;
      }

      case "suggestion": {
        const file = parsed.data.file;
        const line = parsed.data.line;
        const suggestion = parsed.data.suggestion;
        if (typeof file === "string" && typeof line === "number" && typeof suggestion === "string") {
          result.suggestions.push({ file, line, suggestion });
        }
        break;
      }
    }
  }
  return result;
}

export async function parseOpencodeFile(filePath: string): Promise<OpencodeResult> {
  const { readFile } = await import("node:fs/promises");
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return emptyOpencodeResult();
  }
  return parseOpencodeOutput(content.split("\n"));
}
