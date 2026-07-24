import { execSync } from "node:child_process";
import { logger } from "../utils/logger.js";
const MAX_BUFFER = 10 * 1024 * 1024;
const SNIPPET_LENGTH = 80;
function parseTrufflehogLine(line) {
    try {
        const r = JSON.parse(line);
        return {
            file: r.SourceMetadata?.Data?.Filesystem?.file ?? "unknown",
            line: r.SourceMetadata?.Data?.Filesystem?.line ?? null,
            severity: "high",
            category: "security",
            comment: `[trufflehog] ${r.DetectorName ?? "secret"}: ${r.Description ?? ""}`,
            suggestion: `Matched: ${(r.Raw || "").slice(0, SNIPPET_LENGTH)}`,
            source: "scanner",
        };
    }
    catch {
        return null;
    }
}
const gitleaks = {
    name: "gitleaks",
    detect() {
        try {
            execSync("which gitleaks", { stdio: "ignore" });
            return true;
        }
        catch {
            return false;
        }
    },
    run(root) {
        try {
            const out = execSync("gitleaks detect --no-git --source . --report-format json --report-path /dev/stdout 2>/dev/null || true", { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
            if (!out.trim())
                return [];
            let results;
            try {
                results = JSON.parse(out);
            }
            catch {
                logger.warn("gitleaks JSON parse failed");
                return [];
            }
            return results.map((r) => ({
                file: r.File,
                line: r.StartLine || null,
                severity: (r.Severity?.toLowerCase() === "high" ? "high" : "critical"),
                category: "security",
                comment: `[gitleaks] ${r.Description}`,
                suggestion: `Match: ${r.Match.trim().slice(0, SNIPPET_LENGTH)}`,
                source: "scanner",
            }));
        }
        catch (e) {
            logger.warn(`gitleaks run failed: ${e}`);
            return [];
        }
    },
};
const trufflehog = {
    name: "trufflehog",
    detect() {
        try {
            execSync("which trufflehog", { stdio: "ignore" });
            return true;
        }
        catch {
            return false;
        }
    },
    run(root) {
        try {
            const out = execSync("trufflehog filesystem . --json --no-verification 2>/dev/null || true", { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
            if (!out.trim())
                return [];
            const lines = out.trim().split("\n").filter(Boolean);
            return lines.map(parseTrufflehogLine).filter((f) => f !== null);
        }
        catch (e) {
            logger.warn(`trufflehog run failed: ${e}`);
            return [];
        }
    },
};
const scanners = { gitleaks, trufflehog };
export function runThirdPartySecrets(root) {
    const findings = [];
    for (const [name, tool] of Object.entries(scanners)) {
        if (!tool.detect()) {
            logger.info(`Secret scanner "${name}" not found, skipping`);
            continue;
        }
        logger.info(`Running secret scanner: ${name}`);
        const start = Date.now();
        const result = tool.run(root);
        logger.info(`Secret scanner "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
        findings.push(...result);
    }
    return findings;
}
//# sourceMappingURL=index.js.map