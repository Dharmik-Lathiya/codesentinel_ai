import { readFileSync, existsSync } from "node:fs";
import { ReviewEntrySchema } from "./types/jsonl.js";
export function emptyResult() {
    return { summary: "", verdict: "comment", strengths: [], issues: [] };
}
export function parseJsonlString(raw) {
    const entries = [];
    for (const line of raw.split("\n").map((l) => l.trim())) {
        if (!line || line.startsWith("#"))
            continue;
        try {
            const parsed = JSON.parse(line);
            const result = ReviewEntrySchema.safeParse(parsed);
            if (result.success) {
                entries.push(result.data);
            }
        }
        catch {
            // skip unparseable lines
        }
    }
    return entries;
}
export function parseJsonlFile(filePath) {
    if (!existsSync(filePath))
        return [];
    const raw = readFileSync(filePath, "utf8");
    return parseJsonlString(raw);
}
export function validateAndNormalize(entries) {
    const result = emptyResult();
    for (const entry of entries) {
        switch (entry.type) {
            case "summary":
                result.summary = entry.summary;
                break;
            case "verdict":
                result.verdict = entry.verdict;
                break;
            case "strength":
                result.strengths.push({ title: entry.title, description: entry.description });
                break;
            case "issue":
                result.issues.push(entry);
                break;
        }
    }
    return result;
}
export function buildReviewBody(result) {
    const parts = [];
    if (result.summary)
        parts.push(`### Review Summary\n\n${result.summary}`);
    if (result.strengths.length) {
        parts.push(`\n### Strengths\n`);
        for (const s of result.strengths) {
            parts.push(`- **${s.title}**${s.description ? `: ${s.description}` : ""}`);
        }
    }
    if (result.issues.length) {
        parts.push(`\n### Issues\n`);
        for (const i of result.issues) {
            const label = i.severity === "critical" || i.severity === "high"
                ? `**[${i.severity.toUpperCase()}]** `
                : "";
            parts.push(`- ${label}**${i.file}${i.line ? `:${i.line}` : ""}** — ${i.message}${i.suggestion ? `\n  > Suggestion: ${i.suggestion}` : ""}`);
        }
    }
    return parts.join("\n");
}
export function buildInlineComments(result) {
    return result.issues.map((i) => ({
        file: i.file,
        line: i.line ?? null,
        body: `[${i.severity.toUpperCase()}] ${i.message}${i.suggestion ? `\n\n> Suggestion: ${i.suggestion}` : ""}`,
        severity: i.severity,
    }));
}
//# sourceMappingURL=jsonl-parser.js.map