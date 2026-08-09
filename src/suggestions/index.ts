import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const stripFences = (s: string): string =>
  s.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "");

const escapeFences = (s: string): string => s.replace(/```/g, "`\u200b``");

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  const ranked = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  for (const f of ranked.slice(0, MAX_FINDINGS)) {
    const suggested = escapeFences(stripFences(f.suggestion ?? ""));
    const comment = escapeFences(f.comment);
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? ctxAfter : "";
      const original = lines[f.line - 1];
      const code = suggested || `${context}  // ${comment}\n${original}\n${after}`;
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
