const EXCLUDED_DIR_PREFIXES = ["node_modules/", ".git/", "dist/"];
const VAGUE_PHRASES = [
    "needs improvement",
    "could be better",
    "consider refactoring",
];
const MIN_MESSAGE_LENGTH = 15;
function isExcludedDir(file) {
    return EXCLUDED_DIR_PREFIXES.some((prefix) => file.startsWith(prefix));
}
function isVagueMessage(message) {
    if (message.length < MIN_MESSAGE_LENGTH)
        return true;
    const lower = message.toLowerCase();
    return VAGUE_PHRASES.some((phrase) => lower.includes(phrase));
}
function applyRuleBasedFilter(findings) {
    return findings.filter((f) => {
        if (f.severity === "critical")
            return true;
        if (f.line <= 0)
            return false;
        if (isExcludedDir(f.file))
            return false;
        if (isVagueMessage(f.message))
            return false;
        return true;
    });
}
function buildAiPrompt(findings) {
    const lines = findings.map((f, i) => `${i}: [${f.severity}] ${f.file}:${f.line} — ${f.message}`);
    return [
        "You are verifying code review findings. Return a JSON array of indices that represent genuine, actionable issues worth reporting.",
        "",
        ...lines,
        "",
        'Respond with ONLY a JSON array of numbers, e.g. [0, 2, 3].',
    ].join("\n");
}
function parseAiResponse(content, maxIndex) {
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            const indices = parsed.filter((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < maxIndex);
            return indices.length > 0 ? indices : null;
        }
    }
    catch {
        // fall through
    }
    const extracted = content.match(/\[[\d\s,]*\]/);
    if (extracted) {
        try {
            const parsed = JSON.parse(extracted[0]);
            if (Array.isArray(parsed)) {
                const indices = parsed.filter((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < maxIndex);
                return indices.length > 0 ? indices : null;
            }
        }
        catch {
            // fall through
        }
    }
    return null;
}
async function aiVerify(afterRules, aiHub) {
    const prompt = buildAiPrompt(afterRules);
    let result;
    try {
        result = await aiHub.complete("review", [{ role: "user", content: prompt }], { maxTokens: 1024 });
    }
    catch {
        return afterRules;
    }
    const indices = parseAiResponse(result.content, afterRules.length);
    if (indices === null)
        return afterRules;
    return indices.map((i) => afterRules[i]);
}
export async function verifyFindings(findings, options = {}) {
    if (findings.length === 0)
        return [];
    const afterRules = applyRuleBasedFilter(findings);
    if (options.useAi && options.aiHub && afterRules.length > 0) {
        return aiVerify(afterRules, options.aiHub);
    }
    return afterRules;
}
//# sourceMappingURL=verifier.js.map