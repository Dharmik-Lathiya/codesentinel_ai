import { logger } from "../utils/logger.js";
/** Thrown when a provider cannot be initialized (missing key, etc.). */
export class ProviderUnavailableError extends Error {
    constructor(provider, reason) {
        super(`Provider "${provider}" unavailable: ${reason}`);
        this.name = "ProviderUnavailableError";
    }
}
/**
 * Parse a JSON object out of a model's free-text response. Models often wrap
 * JSON in markdown fences or add commentary, so we are defensive here.
 * Returns null instead of throwing if JSON cannot be parsed.
 */
function tryParseJson(s) {
    try {
        return JSON.parse(s);
    }
    catch { }
    const cleaned = s.replace(/,(\s*[}\]])/g, "$1").replace(/,\s*,/g, ",").replace(/\/\/[^\n]*/g, "");
    try {
        return JSON.parse(cleaned);
    }
    catch { }
    const single = s.replace(/'/g, '"');
    try {
        return JSON.parse(single.replace(/,(\s*[}\]])/g, "$1"));
    }
    catch { }
    const lastBrace = s.lastIndexOf("}");
    if (lastBrace > s.indexOf("{")) {
        try {
            return JSON.parse(s.slice(0, lastBrace + 1));
        }
        catch { }
        const closed = s.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1").replace(/,\s*,/g, ",");
        try {
            return JSON.parse(closed);
        }
        catch { }
    }
    return null;
}
export function extractJson(text) {
    const result = tryParseJson(text.trim());
    if (result !== null)
        return result;
    const fenced = text.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi);
    for (const match of fenced) {
        const result = tryParseJson(match[1].trim());
        if (result !== null)
            return result;
    }
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "{") {
            if (start === -1)
                start = i;
            depth++;
        }
        else if (text[i] === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
                const result = tryParseJson(text.slice(start, i + 1));
                if (result !== null)
                    return result;
                start = -1;
            }
        }
    }
    logger.warn("extractJson: No valid JSON object found in model response");
    return null;
}
//# sourceMappingURL=provider.js.map