import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

/**
 * Strip surrounding code fences and collapse backtick runs from a suggestion.
 */
function sanitizeSuggestion(s?: string): string {
  return (s ?? "")
    .trim()
    .replace(/^```\w*\s*/, "")
    .replace(/\s*```\s*$/, "")
    .replace(/`{3,}/g, "`");
}

/**
 * Collapse backtick runs in comment text so embedded code can't close the fence.
 */
function sanitizeComment(c: string): string {
  return c.replace(/`{3,}/g, "`");
}

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  if (findings.length === 0) return "";
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  for (const f of findings.slice(0, MAX_FINDINGS)) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    const comment = sanitizeComment(f.comment);
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? ctxAfter : "";
      const suggested = sanitizeSuggestion(f.suggestion);
      const original = lines[f.line - 1];
      const replacement = suggested || `// ${comment}`;
      const code = `${context}-${original}\n+${replacement}${after ? "\n" + after : ""}`;
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      const suggested = sanitizeSuggestion(f.suggestion);
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
