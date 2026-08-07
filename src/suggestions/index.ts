import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

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
    const suggested = f.suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
    if (typeof f.line === "number" && f.line > 0 && f.line <= lines.length) {
      if (suggested) {
        parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested}\n\`\`\`\n`);
      } else {
        const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
        const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
        const context = ctxBefore ? ctxBefore + "\n" : "";
        const after = ctxAfter ? ctxAfter : "";
        const original = lines[f.line - 1];
        const code = `${context}  // ${f.comment}\n${original}\n${after}`;
        parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
      }
    } else {
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + f.comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
