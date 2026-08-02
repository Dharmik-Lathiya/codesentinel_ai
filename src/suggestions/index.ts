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
  const lineCache = new Map<string, string[]>();
  const shown = findings.slice(0, MAX_FINDINGS);
  for (const f of shown) {
    let lines = lineCache.get(f.file);
    if (!lines) {
      lines = (fileContents.get(f.file) ?? "").split("\n");
      lineCache.set(f.file, lines);
    }
    const suggested = f.suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
    const singleLineComment = f.comment.replace(/\s+/g, " ").trim();
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? ctxAfter : "";
      const original = lines[f.line - 1];
      const code = suggested || `${context}  // ${singleLineComment}\n${original}\n${after}`;
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + singleLineComment}\n\`\`\`\n`);
    }
  }
  if (shown.length < findings.length) {
    const remaining = findings.length - shown.length;
    parts.push(`_...and ${remaining} more finding${remaining === 1 ? "" : "s"} not shown._`);
  }
  return parts.join("\n---\n");
}
