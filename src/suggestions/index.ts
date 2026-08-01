import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

function sanitize(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/```/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/---+/, "—")
    .trim();
}

function snippet(text: string | undefined): string {
  return (text ?? "").replace(/```/g, "").trim();
}

function buildSuggestionHunk(lines: string[], finding: Finding): string {
  const start = Math.max(1, Math.min(finding.line ?? 1, lines.length));
  const before = lines.slice(Math.max(0, (finding.line ?? start) - CONTEXT_BEFORE - 1), (finding.line ?? start) - 1);
  const after = lines.slice(start, Math.min(lines.length, start + CONTEXT_AFTER));
  const original = lines[start - 1] ?? "";
  const comment = sanitize(finding.comment);
  const indent = original.match(/^\s*/)?.[0] ?? "";
  const suggested = snippet(finding.suggestion);
  const body: string[] = [];
  before.forEach((l) => body.push(` ${l}`));
  if (suggested) {
    body.push(`-${original}`);
    suggested.split("\n").forEach((l) => body.push(`+${l}`));
  } else {
    body.push(` ${original}`);
    body.push(`+${indent}// ${comment}`);
  }
  after.forEach((l) => body.push(` ${l}`));
  const added = suggested ? suggested.split("\n").length : 1;
  const oldCount = before.length + 1 + after.length;
  const newCount = before.length + (suggested ? added : 2) + after.length;
  const oldStart = start - before.length;
  return `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@\n${body.join("\n")}`;
}

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  for (const f of findings.slice(0, MAX_FINDINGS)) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    const file = sanitize(f.file);
    const severity = f.severity.toUpperCase();
    const comment = sanitize(f.comment);
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const hunk = buildSuggestionHunk(lines, f);
      parts.push(`**${file}:${f.line}** — ${severity} — ${comment}\n\n\`\`\`suggestion\n${hunk}\n\`\`\`\n`);
    } else {
      const code = (snippet(f.suggestion) || `// ${comment}`)
        .split("\n")
        .map((l) => `+${l}`)
        .join("\n");
      parts.push(`**${file}** — ${severity} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    }
  }
  if (findings.length > MAX_FINDINGS) {
    parts.push(`... and ${findings.length - MAX_FINDINGS} more findings omitted`);
  }
  return parts.join("\n---\n");
}
