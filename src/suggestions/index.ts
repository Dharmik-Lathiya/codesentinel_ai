import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

function normalizeSuggestion(suggestion?: string): string {
  return sanitize(
    suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "",
  );
}

function sanitize(text: string): string {
  return text.replace(/`{3,}/g, "```").replace(/\r?\n/g, " ").trim();
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
    const comment = sanitize(f.comment);
    const suggested = normalizeSuggestion(f.suggestion);
    if (f.line && f.line > 0) {
      const lines = (fileContents.get(f.file) ?? "").split("\n");
      if (f.line <= lines.length) {
        const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
        const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
        const context = ctxBefore ? ctxBefore + "\n" : "";
        const after = ctxAfter ? ctxAfter : "";
        const original = lines[f.line - 1];
const code = suggested ? `// ${original}\n${suggested}` : `${context}  // ${comment}\n${original}\n${after}`;
        parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
        continue;
      }
    }
    parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
  }
  const remaining = findings.length - MAX_FINDINGS;
  if (remaining > 0) parts.push(`_...and ${remaining} more findings_`);
  return parts.join("\n---\n");
}
