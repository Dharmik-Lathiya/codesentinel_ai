import { logger } from "../utils/logger.js";
function checkLine(line, lineNumber, path, pattern, re) {
    const trimmed = line.trim();
    if (!trimmed)
        return null;
    // Strip inline comments before regex matching to avoid false positives
    const stripped = trimmed.replace(/\/\/.*$/, "").replace(/#.*$/, "").trim();
    if (!stripped)
        return null;
    re.lastIndex = 0;
    if (re.test(stripped)) {
        return {
            severity: pattern.severity,
            category: "security",
            file: path,
            line: lineNumber,
            comment: pattern.message,
            suggestion: pattern.suggestion,
            source: "static",
        };
    }
    return null;
}
export function scanSecrets(path, content, patterns) {
    const findings = [];
    const lines = content.split("\n");
    for (const pattern of patterns) {
        const flags = pattern.regex.startsWith("(?i)") ? "gi" : "g";
        const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
        let re;
        try {
            re = new RegExp(source, flags);
        }
        catch {
            continue;
        }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const finding = checkLine(line, i + 1, path, pattern, re);
            if (finding)
                findings.push(finding);
        }
    }
    return findings;
}
/**
 * Redact secrets from file content before sending to an AI provider.
 * Returns a new string with each detected secret replaced by
 * `[REDACTED:<pattern-id>]`. The original content is never modified.
 */
export function redactSecrets(content, patterns) {
    let redacted = content;
    let redactedCount = 0;
    for (const pattern of patterns) {
        const flags = pattern.regex.startsWith("(?i)") ? "gi" : "g";
        const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
        let re;
        try {
            re = new RegExp(source, flags);
        }
        catch {
            continue;
        }
        redacted = redacted.replace(re, (match) => {
            redactedCount++;
            return `[REDACTED:${pattern.id}]`;
        });
    }
    if (redactedCount > 0) {
        logger.info(`redactSecrets: redacted ${redactedCount} secret(s) from AI-bound content`);
    }
    return redacted;
}
//# sourceMappingURL=index.js.map