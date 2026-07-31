import { readFile } from "node:fs/promises";
export function emptyOpencodeResult() {
    return {
        summary: "",
        verdict: { ready: false, reasoning: "" },
        strengths: [],
        issues: [],
        suggestions: [],
    };
}
const VALID_TYPES = new Set(["summary", "verdict", "strength", "issue", "suggestion"]);
function tryParseLine(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed;
        if (typeof obj.type === "string" && VALID_TYPES.has(obj.type) && obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
            return { type: obj.type, data: obj.data };
        }
    }
    return null;
}
function handleSummary(result, data) {
    if (typeof data.text === "string") {
        result.summary = data.text;
    }
}
function handleVerdict(result, data) {
    if (typeof data.ready === "boolean" && typeof data.reasoning === "string") {
        const raw = data.confidence;
        let confidence;
        if (raw === "high" || raw === "medium" || raw === "low") {
            confidence = raw;
        }
        result.verdict = {
            ready: data.ready,
            reasoning: data.reasoning,
            autoFixable: typeof data.autoFixable === "boolean" ? data.autoFixable : undefined,
            confidence,
        };
    }
}
function handleStrength(result, data) {
    const msg = data.message;
    if (typeof msg === "string") {
        result.strengths.push({
            file: typeof data.file === "string" ? data.file : undefined,
            line: typeof data.line === "number" ? data.line : undefined,
            message: msg,
        });
    }
}
function handleIssue(result, data) {
    const severity = data.severity;
    const file = data.file;
    const line = data.line;
    const message = data.message;
    if (typeof severity === "string" && typeof file === "string" && typeof line === "number" && typeof message === "string") {
        const valid = ["critical", "important", "minor"];
        if (valid.includes(severity)) {
            result.issues.push({
                severity: severity,
                file,
                line,
                message,
                suggestion: typeof data.suggestion === "string" ? data.suggestion : undefined,
                suggestionCode: typeof data.suggestionCode === "string" ? data.suggestionCode : undefined,
            });
        }
    }
}
function handleSuggestion(result, data) {
    const file = data.file;
    const line = data.line;
    const suggestion = data.suggestion;
    if (typeof file === "string" && typeof line === "number" && typeof suggestion === "string") {
        result.suggestions.push({ file, line, suggestion });
    }
}
export function parseOpencodeOutput(lines) {
    const result = emptyOpencodeResult();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const parsed = tryParseLine(trimmed);
        if (!parsed)
            continue;
        switch (parsed.type) {
            case "summary":
                handleSummary(result, parsed.data);
                break;
            case "verdict":
                handleVerdict(result, parsed.data);
                break;
            case "strength":
                handleStrength(result, parsed.data);
                break;
            case "issue":
                handleIssue(result, parsed.data);
                break;
            case "suggestion":
                handleSuggestion(result, parsed.data);
                break;
        }
    }
    return result;
}
export async function parseOpencodeFile(filePath) {
    let content;
    try {
        content = await readFile(filePath, "utf8");
    }
    catch {
        return emptyOpencodeResult();
    }
    return parseOpencodeOutput(content.split("\n"));
}
//# sourceMappingURL=jsonl-parser.js.map