import { readFileSync, existsSync } from "node:fs";
import { ReviewEntrySchema, IssueEntrySchema, type ReviewEntry, type IssueEntry } from "./types/jsonl.js";

export interface ReviewResult {
  summary: string;
  verdict: "approved" | "changes_requested" | "comment";
  strengths: { title: string; description?: string }[];
  issues: IssueEntry[];
}

export function emptyResult(): ReviewResult {
  return { summary: "", verdict: "comment", strengths: [], issues: [] };
}

export function parseJsonlString(raw: string): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  for (const line of raw.split("\n").map((l) => l.trim())) {
    if (!line || line.startsWith("#")) continue;
    try {
      const parsed = JSON.parse(line);
      const result = ReviewEntrySchema.safeParse(parsed);
      if (result.success) {
        entries.push(result.data);
      }
    } catch {
      // skip unparseable lines
    }
  }
  return entries;
}

export function parseJsonlFile(filePath: string): ReviewEntry[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  return parseJsonlString(raw);
}

export function validateAndNormalize(entries: ReviewEntry[]): ReviewResult {
  const result = emptyResult();
  for (const entry of entries) {
    switch (entry.type) {
      case "summary":
        result.summary = entry.summary;
        break;
      case "verdict":
        result.verdict = entry.verdict;
        break;
      case "strength":
        result.strengths.push({ title: entry.title, description: entry.description });
        break;
      case "issue":
        result.issues.push(entry);
        break;
    }
  }
  return result;
}

export function buildReviewBody(result: ReviewResult): string {
  const parts: string[] = [];
  if (result.summary) parts.push(`### Review Summary\n\n${result.summary}`);
  if (result.strengths.length) {
    parts.push(`\n### Strengths\n`);
    for (const s of result.strengths) {
      parts.push(`- **${s.title}**${s.description ? `: ${s.description}` : ""}`);
    }
  }
  if (result.issues.length) {
    parts.push(`\n### Issues\n`);
    for (const i of result.issues) {
      const label = i.severity === "critical" || i.severity === "high"
        ? `**[${i.severity.toUpperCase()}]** `
        : "";
      parts.push(
        `- ${label}**${i.file}${i.line ? `:${i.line}` : ""}** — ${i.message}${i.suggestion ? `\n  > Suggestion: ${i.suggestion}` : ""}`,
      );
    }
  }
  return parts.join("\n");
}

export function buildInlineComments(result: ReviewResult): { file: string; line: number | null; body: string; severity: string }[] {
  return result.issues.map((i) => ({
    file: i.file,
    line: i.line ?? null,
    body: `[${i.severity.toUpperCase()}] ${i.message}${i.suggestion ? `\n\n> Suggestion: ${i.suggestion}` : ""}`,
    severity: i.severity,
  }));
}
