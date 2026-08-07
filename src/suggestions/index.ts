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
  const splitCache = new Map<string, string[]>();
  const getLines = (file: string): string[] => {
    const cached = splitCache.get(file);
    if (cached) return cached;
    const lines = (fileContents.get(file) ?? "").split("\n");
    splitCache.set(file, lines);
    return lines;
  };
  const escapeFence = (text: string): string =>
    text.split("\n").map((line) => (line.trim() === "```" ? "`\\`" : line)).join("\n");
  const stripFences = (s?: string): string =>
    s?.trim().replace(/^```\w*\s*/, "").replace(/\s*```\s*$/, "") ?? "";
  for (const f of findings.slice(0, MAX_FINDINGS)) {
    const comment = escapeFence(f.comment);
    const rawSuggested = stripFences(f.suggestion);
    const suggested = escapeFence(rawSuggested);
    const lines = getLines(f.file);
    if (f.line && f.line > 0 && lines.length > 0) {
      const idx = Math.min(f.line, lines.length) - 1;
      const original = lines[idx];
      const header = f.line <= lines.length
        ? `**${f.file}:${f.line}**`
        : `**${f.file}** (near line ${f.line})`;
      let code: string;
      if (suggested) {
        code = `- ${original}\n+ ${suggested}`;
      } else {
        const ctxBefore = lines.slice(Math.max(0, idx - CONTEXT_BEFORE), idx).join("\n");
        const ctxAfter = lines.slice(idx + 1, Math.min(lines.length, idx + 1 + CONTEXT_AFTER)).join("\n");
        code = `${ctxBefore ? ctxBefore + "\n" : ""}  // ${comment}\n${original}\n${ctxAfter ? ctxAfter : ""}`;
      }
      parts.push(`${header} — ${f.severity.toUpperCase()} — ${comment}\n\n` + "```suggestion\n" + `${code}\n` + "```\n");
    } else {
      parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${comment}\n\n` + "```suggestion\n" + (suggested || "// " + comment) + "\n```\n");
    }
  }
  const truncated = findings.length - MAX_FINDINGS;
  if (truncated > 0) {
    parts.push(`...and ${truncated} more finding${truncated === 1 ? "" : "s"}.`);
  }
  return parts.join("\n---\n");
}
