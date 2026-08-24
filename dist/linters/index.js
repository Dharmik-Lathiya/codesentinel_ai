import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";
const MAX_BUFFER = 10 * 1024 * 1024;
function shq(s) {
    return '"' + s.replace(/"/g, '\\"') + '"';
}
const eslint = {
    name: "eslint",
    detect(root) {
        return existsSync(resolve(root, "node_modules", ".bin", "eslint"));
    },
    run(root, extraArgs) {
        try {
            const out = execSync(`npx eslint --format json --no-color ${extraArgs.map(shq).join(" ")} . 2>/dev/null || true`, { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
            if (!out.trim())
                return [];
            const results = JSON.parse(out);
            return results.flatMap((f) => f.messages.map((m) => ({
                file: f.filePath,
                line: m.line || null,
                severity: m.severity >= 2 ? "high" : "low",
                category: "smell",
                comment: m.message,
                suggestion: `See rule: ${m.ruleId ?? "unknown"}`,
                source: "linter",
            })));
        }
        catch (e) {
            logger.warn(`eslint run failed: ${e}`);
            return [];
        }
    },
};
const biome = {
    name: "biome",
    detect(root) {
        return existsSync(resolve(root, "node_modules", ".bin", "biome"));
    },
    run(root, extraArgs) {
        try {
            const out = execSync(`npx biome lint --diagnostic-level=warn --max-diagnostics=200 ${extraArgs.join(" ")} . 2>/dev/null || true`, { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
            if (!out.trim())
                return [];
            const parsed = JSON.parse(out);
            return (parsed.diagnostics ?? []).map((d) => ({
                file: d.location.path.file,
                line: d.location.span?.start.line ?? null,
                severity: d.severity === "error" ? "high" : "medium",
                category: "smell",
                comment: d.message.text,
                suggestion: `Category: ${d.category}`,
                source: "linter",
            }));
        }
        catch (e) {
            logger.warn(`biome run failed: ${e}`);
            return [];
        }
    },
};
const pylint = {
    name: "pylint",
    detect(root) {
        try {
            execSync("which pylint", { stdio: "ignore" });
            return true;
        }
        catch {
            return false;
        }
    },
    run(root, extraArgs) {
        try {
            const out = execSync(`pylint --output-format=json ${extraArgs.join(" ")} . 2>/dev/null || true`, { cwd: root, encoding: "utf8", maxBuffer: MAX_BUFFER });
            if (!out.trim())
                return [];
            const results = JSON.parse(out);
            return results.map((m) => ({
                file: m.path,
                line: m.line || null,
                severity: (m.type === "error" || m.type === "fatal" ? "high" : m.type === "warning" ? "medium" : "low"),
                category: "smell",
                comment: m.message,
                suggestion: `Symbol: ${m.symbol}`,
                source: "linter",
            }));
        }
        catch (e) {
            logger.warn(`pylint run failed: ${e}`);
            return [];
        }
    },
};
const tools = { eslint, biome, pylint };
export function runLinters(root, config) {
    const active = config.tools.length > 0 ? config.tools : Object.keys(tools);
    const findings = [];
    for (const name of active) {
        const tool = tools[name];
        if (!tool) {
            logger.warn(`Unknown linter: "${name}", skipping`);
            continue;
        }
        if (!tool.detect(root)) {
            logger.info(`Linter "${name}" not found, skipping`);
            continue;
        }
        logger.info(`Running linter: ${name}`);
        const extra = config.args[name] ?? [];
        const start = Date.now();
        const result = tool.run(root, extra);
        logger.info(`Linter "${name}" finished: ${result.length} findings in ${Date.now() - start}ms`);
        findings.push(...result);
    }
    return findings;
}
//# sourceMappingURL=index.js.map