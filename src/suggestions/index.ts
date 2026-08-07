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
  const clean = (s?: string): string => s?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "").replace(/```/g, "'''") ?? "";
  const esc = (s: string): string => s.replace(/```/g, "'''");
  for (const f of findings.slice(0, MAX_FINDINGS)) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    const suggested = clean(f.suggestion);
    const comment = esc(f.comment);
    const file = esc(f.file);
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const original = lines[f.line - 1];
      let code: string;
      if (suggested) {
        code = `${suggested}\n\n// ${comment}\n${original}`;
      } else {
        const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
        const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
        code = `${ctxBefore ? ctxBefore + "\n" : ""}  // ${comment}\n${original}${ctxAfter ? "\n" + ctxAfter : ""}`;
      }
      parts.push(`**${file}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code.trim()}\n\`\`\`\n`);
    } else {
      parts.push(`**${file}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
