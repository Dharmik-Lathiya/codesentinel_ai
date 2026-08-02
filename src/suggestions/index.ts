import type { Finding } from "../analyzer/index.js";
const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;

/** Strip surrounding code-fence markers from an LLM-provided suggestion. */
function stripCodeFence(suggestion?: string): string {
  return suggestion?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
}

/** Normalize a comment so it cannot break markdown or the enclosing fence. */
function sanitizeComment(comment: string): string {
  return comment.replace(/\s+/g, " ").replace(/`/g, "\\`");
}

/** Return fence-safe suggestion code, falling back to the comment on interior fences. */
function safeSuggestionCode(suggestion: string | undefined, comment: string): string {
  const code = stripCodeFence(suggestion);
  if (/```/.test(code)) {
    return `// ${comment} (suggestion omitted: contained code fences)`;
  }
  return code;
}

/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(
  findings: Finding[],
  fileContents: Map<string,string>,
): string {
  const parts: string[] = ["### CodeSentinel — Suggested Fixes\n"];
  const lineCache = new Map<string, string[]>();
  const total = findings.length;
  for (const f of findings.slice(0, MAX_FINDINGS)) {
    const comment = sanitizeComment(f.comment);
    if (!lineCache.has(f.file)) {
      lineCache.set(f.file, (fileContents.get(f.file) ?? "").split("\n"));
    }
    const lines = lineCache.get(f.file)!;
    if (f.line && f.line > 0 && f.line <= lines.length) {
      const ctxBefore = lines.slice(Math.max(0, f.line - 1 - CONTEXT_BEFORE), f.line - 1).join("\n");
      const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
      const context = ctxBefore ? ctxBefore + "\n" : "";
      const after = ctxAfter ? ctxAfter : "";
      const suggested = safeSuggestionCode(f.suggestion, comment);
      const original = lines[f.line - 1];
      const code = suggested || `${context}  // ${comment}\n${original}\n${after}`;
      parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
    } else {
      const suggested = safeSuggestionCode(f.suggestion, comment);
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${comment}\n\n\`\`\`suggestion\n${suggested || "// " + comment}\n\`\`\`\n`);
    }
  }
  if (total > MAX_FINDINGS) {
    parts.push(`…and ${total - MAX_FINDINGS} more findings\n`);
  }
  return parts.join("\n---\n");
}
