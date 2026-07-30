import { readFile } from "node:fs/promises";

export interface OpencodeLine {
  type: "summary" | "verdict" | "strength" | "issue" | "suggestion";
  data: Record<string, unknown>;
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
  verdict: Verdict;
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

function handleSummary(result: OpencodeResult, data: Record<string, unknown>): void {
  if (typeof data.text === "string") {
    result.summary = data.text;
  }
}

function handleVerdict(result: OpencodeResult, data: Record<string, unknown>): void {
  if (typeof data.ready === "boolean" && typeof data.reasoning === "string") {
    const raw = data.confidence;
    let confidence: Verdict["confidence"] | undefined;
    if (raw === "high" || raw === "medium" || raw === "low") {
      confidence = raw;
    }
    result.verdict = {
      ready: data.ready,
      reasoning: data.reasoning,
      autoFixable: typeof data.autoFixable === "boolean" ? data.autoFixable : undefined,
      confidence,
    };
  }
}

function handleStrength(result: OpencodeResult, data: Record<string, unknown>): void {
  const msg = data.message;
  if (typeof msg === "string") {
    result.strengths.push({
      file: typeof data.file === "string" ? data.file : undefined,
      line: typeof data.line === "number" ? data.line : undefined,
      message: msg,
    });
  }
}

function handleIssue(result: OpencodeResult, data: Record<string, unknown>): void {
  const severity = data.severity;
  const file = data.file;
  const line = data.line;
  const message = data.message;
  if (typeof severity === "string" && typeof file === "string" && typeof line === "number" && typeof message === "string") {
    const valid = ["critical", "important", "minor"];
    if (valid.includes(severity)) {
      result.issues.push({
        severity: severity as Issue["severity"],
        file,
        line,
        message,
        suggestion: typeof data.suggestion === "string" ? data.suggestion : undefined,
        suggestionCode: typeof data.suggestionCode === "string" ? data.suggestionCode : undefined,
      });
    }
  }
}

function handleSuggestion(result: OpencodeResult, data: Record<string, unknown>): void {
  const file = data.file;
  const line = data.line;
  const suggestion = data.suggestion;
  if (typeof file === "string" && typeof line === "number" && typeof suggestion === "string") {
    result.suggestions.push({ file, line, suggestion });
  }
}

export function parseOpencodeOutput(lines: string[]): OpencodeResult {
  const result = emptyOpencodeResult();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = tryParseLine(trimmed);
    if (!parsed) continue;

    switch (parsed.type) {
      case "summary": handleSummary(result, parsed.data); break;
      case "verdict": handleVerdict(result, parsed.data); break;
      case "strength": handleStrength(result, parsed.data); break;
      case "issue": handleIssue(result, parsed.data); break;
      case "suggestion": handleSuggestion(result, parsed.data); break;
    }
  }
  return result;
}

export async function parseOpencodeFile(filePath: string): Promise<OpencodeResult> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return emptyOpencodeResult();
  }
  return parseOpencodeOutput(content.split("\n"));
}
