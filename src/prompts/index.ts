import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CodeSentinelConfig } from "../config/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Default prompt directory bundled with the package. */
const DEFAULT_PROMPT_DIR = resolve(__dirname, "..", "..", "prompts");

export type PromptName = "review" | "fix" | "audit" | "score" | "testgen" | "chat";

/** Variables substituted into a prompt template. */
export type PromptVars = Record<string, string | number | boolean | null>;

/**
 * PromptRegistry loads prompt templates (from disk, honoring per-name custom
 * overrides in config) and renders them by substituting {{variables}}.
 */
export class PromptRegistry {
  private cache = new Map<PromptName, string>();

  constructor(
    private readonly config: CodeSentinelConfig,
    private readonly promptDir: string = DEFAULT_PROMPT_DIR,
  ) {}

  /** Load a prompt by name, honoring `custom_prompt_paths` overrides. */
  load(name: PromptName): string {
    if (this.cache.has(name)) return this.cache.get(name)!;

    const custom = this.config.custom_prompt_paths[name];
    const candidates = [
      custom && resolve(custom),
      join(this.promptDir, `${name}.md`),
    ].filter(Boolean) as string[];

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
  render(name: PromptName, vars: PromptVars): string {
    const template = this.load(name);
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const value = vars[key];
      if (value === undefined || value === null) return "";
      return String(value);
    });
  }
}
