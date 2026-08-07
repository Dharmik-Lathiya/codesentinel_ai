import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

const stripSuggestion = (s: string | undefined): string =>
  (s ?? "").trim().replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```\s*$/, "");

function intoFence(code: string): string {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}suggestion\n${code}\n${fence}`;
}

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  const rendered = findings.slice(0, MAX_FINDINGS);
  for (const f of rendered) {
    const content = fileContents.get(f.file) ?? "";
    const lines = content.split("\n");
    const suggested = stripSuggestion(f.suggestion);
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const original = lines[f.line - 1];
      const header = `**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}`;
      if (suggested) {
        const code = `// ${f.file}:${f.line} — ${f.severity.toUpperCase()} — ${f.comment}\n${original}\n\n${suggested}`;
        parts.push(`${header}\n\n${intoFence(code)}\n`);
      } else {
        const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
        const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
        const context = ctxBefore ? ctxBefore + "\n" : "";
        const after = ctxAfter ? ctxAfter : "";
        const code = `${context}// ${f.comment}\n${original}\n${after}`;
        parts.push(`${header}\n\n${intoFence(code)}\n`);
      }
    } else {
      const header = `**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}`;
      parts.push(`${header}\n\n${intoFence(suggested || "// " + f.comment)}\n`);
    }
  }
  if (findings.length > MAX_FINDINGS) {
    parts.push(`... ${findings.length - MAX_FINDINGS} more finding(s) omitted`);
  }
  return parts.join("\n---\n");
}
