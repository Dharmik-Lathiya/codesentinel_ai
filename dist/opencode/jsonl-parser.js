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
                if (typeof parsed.data.text === "string") {
                    result.summary = parsed.data.text;
                }
                break;
            case "verdict":
                if (typeof parsed.data.ready === "boolean" && typeof parsed.data.reasoning === "string") {
                    result.verdict = { ready: parsed.data.ready, reasoning: parsed.data.reasoning };
                }
                break;
            case "strength": {
                const msg = parsed.data.message;
                if (typeof msg === "string") {
                    result.strengths.push({
                        file: typeof parsed.data.file === "string" ? parsed.data.file : undefined,
                        line: typeof parsed.data.line === "number" ? parsed.data.line : undefined,
                        message: msg,
                    });
                }
                break;
            }
            case "issue": {
                const severity = parsed.data.severity;
                const file = parsed.data.file;
                const line = parsed.data.line;
                const message = parsed.data.message;
                if (typeof severity === "string" && typeof file === "string" && typeof line === "number" && typeof message === "string") {
                    const valid = ["critical", "important", "minor"];
                    if (valid.includes(severity)) {
                        result.issues.push({
                            severity: severity,
                            file,
                            line,
                            message,
                            suggestion: typeof parsed.data.suggestion === "string" ? parsed.data.suggestion : undefined,
                            suggestionCode: typeof parsed.data.suggestionCode === "string" ? parsed.data.suggestionCode : undefined,
                        });
                    }
                }
                break;
            }
            case "suggestion": {
                const file = parsed.data.file;
                const line = parsed.data.line;
                const suggestion = parsed.data.suggestion;
                if (typeof file === "string" && typeof line === "number" && typeof suggestion === "string") {
                    result.suggestions.push({ file, line, suggestion });
                }
                break;
            }
        }
    }
    return result;
}
export async function parseOpencodeFile(filePath) {
    const { readFile } = await import("node:fs/promises");
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