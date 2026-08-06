import type { CodeSentinelConfig } from "../config/types.js";
export type PromptName = "review" | "fix" | "audit" | "score" | "testgen" | "chat" | "describe" | "generate-utils" | "generate-docs" | "plan";
/** Variables substituted into a prompt template. */
export type PromptVars = Record<string, string | number | boolean | null>;
/**
 * PromptRegistry loads prompt templates (from disk, honoring per-name custom
 * overrides in config) and renders them by substituting {{variables}}.
 */
export declare class PromptRegistry {
    private readonly config;
    private readonly promptDir;
    private cache;
    constructor(config: CodeSentinelConfig, promptDir?: string);
    /** Load a prompt by name, honoring `custom_prompt_paths` overrides. */
    load(name: PromptName): string;
    /** Render a prompt, replacing {{var}} placeholders with provided values. */
    render(name: PromptName, vars: PromptVars): string;
}
