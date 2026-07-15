/**
 * Configuration type definitions for CodeSentinel AI.
 *
 * The configuration is intentionally flexible: users can select an operational
 * `mode`, enable/disable individual capabilities, point at custom prompt files,
 * and pick different AI providers/models for different tasks.
 */

/** Supported operational modes. */
export type Mode = "review" | "fix" | "audit" | "score" | "testgen" | "chat";

/** Supported AI providers. */
export type Provider = "openai" | "anthropic" | "gemini" | "opencode";

/** Supported test runners targeted by the test generation module. */
export type TestRunner = "jest" | "vitest";

/** Per-task model routing: each capability can use its own provider + model. */
export interface ModelConfig {
  provider: Provider;
  model: string;
}

/** A single categorization of a finding produced by the analyzer/AI. */
export type Severity = "info" | "low" | "medium" | "high" | "critical";

/** Output target for reports / comments. */
export interface OutputConfig {
  /** Post inline + summary comments to the GitHub PR when available. */
  postGithubComments: boolean;
  /** Create GitHub issues for audit findings. */
  createGithubIssues: boolean;
  /** Emit a local markdown report file. */
  writeReportFile: boolean;
  /** Directory to write reports into (relative to cwd). */
  reportDir: string;
}

/** Full, normalized configuration object used by the engine. */
export interface CodeSentinelConfig {
  /** Operational mode. */
  mode: Mode;
  /** Maximum iterations for fix-mode loop. */
  max_iterations: number;
  /** Whether the engine may apply automatic fixes. */
  enable_auto_fix: boolean;
  /** Whether scoring should be computed. */
  enable_scoring: boolean;
  /** Whether tests should be generated for untested functions. */
  enable_test_generation: boolean;
  /** Include praise / positive notes in review output. */
  include_positive_feedback: boolean;
  /** Custom prompt override paths keyed by prompt name. */
  custom_prompt_paths: Record<string, string>;
  /** Free-form project context injected into prompts. */
  project_context: string;

  /** Default provider + model for every task unless overridden per-task. */
  default_model: ModelConfig;
  /** Per-task model overrides. */
  models: {
    review?: ModelConfig;
    fix?: ModelConfig;
    audit?: ModelConfig;
    score?: ModelConfig;
    testgen?: ModelConfig;
    chat?: ModelConfig;
  };

  /** Test runner to generate tests for. */
  test_runner: TestRunner;

  /** Files / globs to include and ignore. */
  include: string[];
  exclude: string[];

  /** Output / side-effect configuration. */
  output: OutputConfig;

  /** Enable on-disk caching of AI responses to avoid repeat calls. */
  enable_cache: boolean;
  cache_dir: string;

  /** Comma-separated list of plugin module paths to load. */
  plugins: string[];
}

/** Environment-derived secrets and runtime values (never logged). */
export interface RuntimeSecrets {
  github_token?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  opencode_api_key?: string;
  /** Optional base URL for self-hosted OpenCode-compatible endpoints. */
  opencode_base_url?: string;
}
