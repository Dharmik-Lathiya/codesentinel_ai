import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonc } from "../utils/jsonc.js";
const SEARCH_PATHS = [
    ".opencode-reviewer.yml",
    ".opencode-reviewer.yaml",
    "codesentinel.config.yml",
    "codesentinel.config.yaml",
    "codesentinel.config.json",
];
export function searchConfigPaths(cwd) {
    const dir = cwd ?? process.cwd();
    if (process.env.CODESENTINEL_CONFIG) {
        const p = resolve(dir, process.env.CODESENTINEL_CONFIG);
        if (existsSync(p))
            return p;
    }
    for (const name of SEARCH_PATHS) {
        const p = resolve(dir, name);
        if (existsSync(p))
            return p;
    }
    return null;
}
export function loadYamlConfig(filePath) {
    const raw = readFileSync(filePath, "utf8");
    if (filePath.endsWith(".json")) {
        return parseJsonc(raw);
    }
    try {
        const yamlModule = require("js-yaml");
        return yamlModule.load(raw);
    }
    catch (err) {
        throw new Error(`Failed to parse YAML config ${filePath}: ${err}`);
    }
}
export function getApplicableOverrides(overrides, filePath, branchName) {
    if (!overrides?.length)
        return [];
    const micromatch = (pattern, value) => {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return regex.test(value);
    };
    return overrides.filter((o) => {
        let match = true;
        if (o.path)
            match = match && micromatch(o.path, filePath);
        if (o.branch && branchName)
            match = match && micromatch(o.branch, branchName);
        return match;
    });
}
//# sourceMappingURL=loader.js.map