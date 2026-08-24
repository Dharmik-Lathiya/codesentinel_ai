import { createRequire } from "node:module";
const PKG_VERSION = (() => {
    try {
        return createRequire(import.meta.url)("../../package.json").version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
})();
const SEVERITY_MAP = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "note",
    info: "note",
};
const COMMENT_TRUNCATION_LENGTH = 40;
const HASH_RADIX = 36;
function simpleHash(s) {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        const char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(HASH_RADIX);
}
function truncateComment(text) {
    return text.length > COMMENT_TRUNCATION_LENGTH
        ? `${text.slice(0, COMMENT_TRUNCATION_LENGTH)}...`
        : text;
}
const encodePathSegment = (segment) => encodeURIComponent(segment);
function createRuleId(base, comment, rules) {
    const hash = simpleHash(comment);
    let ruleId = `${base}:${hash}`;
    for (let n = 1; rules.has(ruleId) && rules.get(ruleId)?.shortDescription.text !== comment; n++) {
        ruleId = `${base}:${hash}:${n}`;
    }
    return ruleId;
}
function createArtifactUri(file) {
    const normalized = file.replace(/\\/g, "/");
    const driveMatch = /^([A-Za-z]):\/?(.*)$/.exec(normalized);
    const isAbsolute = normalized.startsWith("/");
    const tail = (driveMatch ? driveMatch[2] : normalized)
        .split("/")
        .filter(Boolean)
        .map(encodePathSegment)
        .join("/");
    if (driveMatch) {
        return `file:///${driveMatch[1]}:${tail ? `/${tail}` : "/"}`;
    }
    if (isAbsolute) {
        return `file:///${tail}`;
    }
    return tail;
}
function createSarifLocation(file, line) {
    return {
        physicalLocation: {
            artifactLocation: { uri: createArtifactUri(file) },
            ...(line != null ? { region: { startLine: line } } : {}),
        },
    };
}
function createToolDriver(rules) {
    return {
        name: "CodeSentinel AI",
        version: PKG_VERSION,
        rules: Array.from(rules.values()),
    };
}
function createSarifRun(rules, results) {
    return {
        tool: {
            driver: createToolDriver(rules),
        },
        results,
    };
}
export function renderSarif(report) {
    const rules = new Map();
    const results = [];
    for (const f of report.findings) {
        const ruleId = createRuleId(f.category, f.comment, rules);
        if (!rules.has(ruleId)) {
            rules.set(ruleId, {
                id: ruleId,
                shortDescription: { text: truncateComment(f.comment) },
            });
        }
        results.push({
            ruleId,
            level: SEVERITY_MAP[f.severity] ?? "note",
            message: { text: f.comment },
            locations: [createSarifLocation(f.file, f.line ?? undefined)],
        });
    }
    const sarif = {
        $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        version: "2.1.0",
        runs: [createSarifRun(rules, results)],
    };
    return JSON.stringify(sarif, null, 2);
}
//# sourceMappingURL=sarif.js.map