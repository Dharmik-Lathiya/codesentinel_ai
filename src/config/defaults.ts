import type { CodeSentinelConfig } from "./types.js";

/**
 * Default configuration. Values here are safe fallbacks; users are expected to
 * override via a config file, environment variables, or CLI flags.
 */
export const DEFAULT_CONFIG: CodeSentinelConfig = {
  mode: "review",
  max_iterations: 5,
  enable_auto_fix: false,
  enable_scoring: true,
  enable_test_generation: false,
  include_positive_feedback: true,
  custom_prompt_paths: {},
  project_context: "",

  default_model: { provider: "opencode", model: "opencode/default" },
  models: {},

  test_runner: "vitest",

  include: ["**/*.{ts,tsx,js,jsx,py,go,java,rb}"],
  exclude: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".git/**",
    "**/*.test.*",
    "**/*.spec.*",
  ],

  output: {
    postGithubComments: false,
    createGithubIssues: false,
    writeReportFile: true,
    reportDir: "codesentinel-reports",
  },

  enable_cache: true,
  cache_dir: ".codesentinel-cache",

  plugins: [],
};

/** Deep-merge two configs (shallow per top-level key, special-cased objects). */
export function mergeConfig(
  base: CodeSentinelConfig,
  override: Partial<CodeSentinelConfig>,
): CodeSentinelConfig {
  const merged: CodeSentinelConfig = { ...base, ...override };

  if (override.default_model) {
    merged.default_model = { ...base.default_model, ...override.default_model };
  }
  if (override.models) {
    merged.models = { ...base.models, ...override.models };
  }
  if (override.output) {
    merged.output = { ...base.output, ...override.output };
  }
  if (override.custom_prompt_paths) {
    merged.custom_prompt_paths = {
      ...base.custom_prompt_paths,
      ...override.custom_prompt_paths,
    };
  }
  return merged;
}
