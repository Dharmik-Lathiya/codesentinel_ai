import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

/**
 *  Wrap all findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const sorted = [...findings].sort((a, b) => {
    const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
  });
  const shown = sorted.slice(0, MAX_FINDINGS);
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  if (sorted.length > MAX_FINDINGS) {
    parts.push(`> plus ${sorted.length - MAX_FINDINGS} more findings\n`);
  }
  for (const f of shown) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    const suggested = (f.suggestion ?? "").trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "").replace(/`/g, "\\`");
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const original = lines[f.line - 1];
      const indent = original.match(/^\s*/)?.[0] ?? "";
      const code = suggested || `${indent}// ${f.comment}\n${original}`;
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + f.comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
