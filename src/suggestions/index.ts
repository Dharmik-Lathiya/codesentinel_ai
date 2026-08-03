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
  const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  for (const f of findings.slice().sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, MAX_FINDINGS)) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content ? content.split("\n") : [];
    const suggested = f.suggestion?.replace(/^\s*```\w*\s*$/gm, "").trim() ?? "";
    const comment = f.comment.replace(/`/g, "\\`");
    const fileName = f.file.replace(/`/g, "\\`");
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? ctxAfter : "";
      const original = lines[f.line - 1];
      const code = suggested || `${context}  // ${comment}\n${original}\n${after}`;
      parts.push(`**${fileName}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      parts.push(`**${fileName}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
