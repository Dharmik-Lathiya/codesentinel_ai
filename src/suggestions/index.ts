import type { Finding } from "../analyzer/index.js";
import type { Severity } from "../config/types.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/**
 * Format a finding as a suggestion block.
 * Note: GitHub renders the "Commit suggestion" button only for review
 * comments attached to a diff hunk, not standalone comment bodies.
 */
export function formatSuggestion(
  finding: Finding,
  suggestedCode: string,
): string {
  const header = `**${finding.severity.toUpperCase()}** — ${finding.comment}`;
  const suggestion = finding.suggestion ? `> ${finding.suggestion}` : "";
  const codeBlock = `\`\`\`suggestion\n${suggestedCode}\n\`\`\``;
  return `${header}\n${suggestion}\n\n${codeBlock}`;
}

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 0) - (SEVERITY_RANK[b.severity] ?? 0),
  );
  const linesCache = new Map<string, string[]>();
  const getLines = (file: string): string[] => {
    let lines = linesCache.get(file);
    if (!lines) {
      lines = (fileContents.get(file) ?? "").split("\n");
      linesCache.set(file, lines);
    }
    return lines;
  };
  for (const f of sorted.slice(0, MAX_FINDINGS)) {
    const suggested = f.suggestion?.replace(/^```\w*\n?|```$/g, "").trim() ?? "";
    if (f.line && f.line > 0 && f.line <= getLines(f.file).length) {
      if (!suggested) {
        const lines = getLines(f.file);
        const ctxBefore = lines.slice(Math.max(0, f.line - CONTEXT_BEFORE), f.line - 1).join("\n");
        const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
        const context = ctxBefore ? ctxBefore + "\n" : "";
        const after = ctxAfter ? "\n" + ctxAfter : "";
        const code = `${context}  // ${f.comment}\n${after}`;
        parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
        continue;
      }
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested}\n\`\`\`\n`);
      continue;
    }
    parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + f.comment}\n\`\`\`\n`);
  }
  return parts.join("\n---\n");
}
