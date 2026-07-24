import type { CodeSentinelConfig } from "./types.js";
/**
 * Resolve the effective configuration by layering, in increasing priority:
 *   1. built-in defaults
 *   2. config file (JSON or JSONC)
 *   3. explicit overrides (e.g. CLI flags / GitHub Action inputs)
 */
export declare function loadConfig(opts?: {
    configPath?: string;
    overrides?: Partial<CodeSentinelConfig>;
}): CodeSentinelConfig;
/** Normalize a partial config from stringly-typed GitHub Action inputs. */
export declare function configFromInputs(inputs: Record<string, string | undefined>): Partial<CodeSentinelConfig>;
