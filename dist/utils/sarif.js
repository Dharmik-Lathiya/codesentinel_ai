const SEVERITY_MAP = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "note",
    info: "note",
};
const COMMENT_TRUNCATION_LENGTH = 40;
const MAX_COMMENT_LENGTH = COMMENT_TRUNCATION_LENGTH;
function createSarifLocation(file, line) {
    return {
        physicalLocation: {
            artifactLocation: { uri: file },
            ...(line ? { region: { startLine: line } } : {}),
        },
    };
}
function createToolDriver(rules) {
    return {
        name: "CodeSentinel AI",
        version: "0.1.6",
        rules: [...rules.values()],
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
        const ruleId = `${f.category}:${f.comment.slice(0, MAX_COMMENT_LENGTH).replace(/[^a-zA-Z0-9]/g, "_")}`;
        if (!rules.has(ruleId)) {
            rules.set(ruleId, {
                id: ruleId,
                shortDescription: { text: f.comment },
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