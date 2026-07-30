const CONTEXT_BEFORE = 3;
const CONTEXT_AFTER = 2;
const MAX_FINDINGS = 10;
/**
 * Format a finding as a GitHub committable suggestion block.
 * GitHub shows "Commit suggestion" button on fenced code blocks with `suggestion` tag.
 */
export function formatSuggestion(finding, originalCode, suggestedCode) {
    const header = `**${finding.severity.toUpperCase()}** — ${finding.comment}`;
    const suggestion = finding.suggestion ? `> ${finding.suggestion}` : "";
    const codeBlock = `\`\`\`suggestion\n${suggestedCode}\n\`\`\``;
    return `${header}\n${suggestion}\n\n${codeBlock}`;
}
/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export function buildSuggestionsComment(findings, fileContents) {
    const parts = ["### CodeSentinel — Suggested Fixes\n"];
    for (const f of findings.slice(0, MAX_FINDINGS)) {
        const content = fileContents.get(f.file) ?? "";
        const lines = content.split("\n");
        if (f.line && f.line > 0 && f.line <= lines.length) {
            const ctxBefore = lines.slice(Math.max(0, f.line - CONTEXT_BEFORE), f.line - 1).join("\n");
            const ctxAfter = lines.slice(f.line, Math.min(lines.length, f.line + CONTEXT_AFTER)).join("\n");
            const context = ctxBefore ? ctxBefore + "\n" : "";
            const after = ctxAfter ? "\n" + ctxAfter : "";
            const suggested = f.suggestion?.replace(/^```\w*\n?|```$/g, "").trim() ?? "";
            const code = suggested || `${context}  // ${f.comment}\n${after}`;
            parts.push(`**${f.file}:${f.line}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${code}\n\`\`\`\n`);
        }
        else {
            const suggested = f.suggestion?.replace(/^```\w*\n?|```$/g, "").trim() ?? "";
            parts.push(`**${f.file}** — ${f.severity.toUpperCase()} — ${f.comment}\n\n\`\`\`suggestion\n${suggested || "// " + f.comment}\n\`\`\`\n`);
        }
    }
    return parts.join("\n---\n");
}
//# sourceMappingURL=index.js.map