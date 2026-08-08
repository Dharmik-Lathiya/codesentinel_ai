import type { Finding } from "../analyzer/index.js";
const MAX_FINDINGS = 10;

function normalizeSuggestion(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  const leadingMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\r?\n/);
  if (leadingMatch && /(^|\n)\s*```\s*$/.test(trimmed)) {
    return trimmed.slice(leadingMatch[0].length).replace(/\s*```\s*$/, "").trim();
  }
  return trimmed;
}

function escapeHeaderText(text: string): string {
  return text.replace(/`/g, "\\`");
}

function suggestionFence(code: string): string {
  let longest = 0;
  let run = 0;
  for (const char of code) {
    if (char === "`") {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return "`".repeat(Math.max(3, longest + 1));
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
    const suggested = normalizeSuggestion(f.suggestion);
    const content = fileContents.get(f.file);
    const lines = content ? content.split("\n") : [];
    const line = f.line && f.line > 0 && f.line <= lines.length ? f.line : 0;
    const original = line > 0 ? lines[line - 1] || "" : "";
    const code = suggested || (line > 0 ? `${original}  // ${f.comment}` : `// ${f.comment}`);
    const label = line > 0 ? `${f.file}:${line}` : f.file;
    const fence = suggestionFence(code);
    parts.push(
      `**${label}** — ${f.severity.toUpperCase()} — ${escapeHeaderText(f.comment)}\n\n${fence}suggestion\n${code}\n${fence}\n`,
    );
  }
  return parts.join("\n---\n");
}

