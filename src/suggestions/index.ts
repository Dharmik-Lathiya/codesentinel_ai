import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

function buildSnippet(lines: string[], lineNo: number, comment: string): string {
  const before = lines.slice(Math.max(0, lineNo - 1 - CONTEXT_BEFORE), lineNo - 1).join("\n");
  const after = lines.slice(lineNo, Math.min(lines.length, lineNo + CONTEXT_AFTER)).join("\n");
  const context = before ? before + "\n" : "";
  return `${context}  // ${comment}\n${lines[lineNo - 1]}\n${after}`;
}

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
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const suggested = f.suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
      const code = suggested || buildSnippet(lines, f.line, f.comment);
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      const suggested = f.suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + f.comment}\n\`\`\`\n`);
    }
  }
  return parts.join("\n---\n");
}
