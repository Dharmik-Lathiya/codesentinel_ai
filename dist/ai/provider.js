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
export function extractJson(text) {
    try {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenced ? fenced[1] : text;
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start === -1 || end === -1 || end < start) {
            logger.warn("extractJson: No JSON object found in model response");
            return null;
        }
        return JSON.parse(candidate.slice(start, end + 1));
    }
    catch (err) {
        logger.warn(`extractJson: Failed to parse JSON — ${err instanceof Error ? err.message : err}`);
        return null;
    }
}
//# sourceMappingURL=provider.js.map