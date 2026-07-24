import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Default prompt directory bundled with the package. */
const DEFAULT_PROMPT_DIR = resolve(__dirname, "..", "..", "prompts");
/**
 * PromptRegistry loads prompt templates (from disk, honoring per-name custom
 * overrides in config) and renders them by substituting {{variables}}.
 */
export class PromptRegistry {
    config;
    promptDir;
    cache = new Map();
    constructor(config, promptDir = DEFAULT_PROMPT_DIR) {
        this.config = config;
        this.promptDir = promptDir;
    }
    /** Load a prompt by name, honoring `custom_prompt_paths` overrides. */
    load(name) {
        if (this.cache.has(name))
            return this.cache.get(name);
        const custom = this.config.custom_prompt_paths[name];
        const candidates = [
            custom && resolve(custom),
            join(this.promptDir, `${name}.md`),
        ].filter(Boolean);
        for (const path of candidates) {
            if (path && existsSync(path)) {
                const content = readFileSync(path, "utf8");
                this.cache.set(name, content);
                return content;
            }
        }
        throw new Error(`Prompt "${name}" not found in ${candidates.join(", ")}`);
    }
    /** Render a prompt, replacing {{var}} placeholders with provided values. */
    render(name, vars) {
        const template = this.load(name);
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
            const value = vars[key];
            if (value === undefined || value === null)
                return "";
            return String(value);
        });
    }
}
//# sourceMappingURL=index.js.map