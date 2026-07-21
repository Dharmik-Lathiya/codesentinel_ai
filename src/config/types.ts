/**
 * Configuration type definitions for CodeSentinel AI.
 *
 * The configuration is intentionally flexible: users can select an operational
 * `mode`, enable/disable individual capabilities, point at custom prompt files,
 * and pick different AI providers/models for different tasks.
 */

/** Supported operational modes. */
export type Mode = "review" | "fix" | "audit" | "score" | "testgen" | "chat" | "gate" | "describe";

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
  /** Emit an HTML dashboard report. */
  writeHtmlReport: boolean;
  /** Directory to write reports into (relative to cwd). */
  reportDir: string;
}

/**
 * Configuration for dynamic severity adjustment.
 */
export interface SeverityAdjustmentConfig {
  /** File patterns that should have increased severity (e.g., production code). */
  highRiskPatterns: string[];
  /** File patterns that should have decreased severity (e.g., test files). */
  lowRiskPatterns: string[];
  /** Adjustments based on file history (frequency of changes). */
  historyBasedAdjustment: boolean;
  /** Multiplier for files with high change frequency. */
  changeFrequencyMultiplier: number;
}

/**
 * Configuration for confidence thresholds per analysis type.
 */
export interface ConfidenceThresholds {
  /** Minimum confidence threshold for security findings. */
  security: number;
  /** Minimum confidence threshold for bug findings. */
  bug: number;
  /** Minimum confidence threshold for performance findings. */
  performance: number;
  /** Minimum confidence threshold for smell findings. */
  smell: number;
  /** Minimum confidence threshold for style findings. */
  style: number;
}

/**
 * Custom rule definition for user-defined patterns.
 */
export interface CustomRule {
  /** Unique rule identifier. */
  id: string;
  /** Human-readable rule name. */
  name: string;
  /** Regular expression pattern to match. */
  pattern: string;
  /** Severity of findings from this rule. */
  severity: Severity;
  /** Category of findings from this rule. */
  category: "bug" | "security" | "performance" | "smell" | "style" | "praise";
  /** Human-readable comment for findings. */
  comment: string;
  /** Optional suggestion for fixing the issue. */
  suggestion?: string;
  /** File patterns where this rule applies. */
  filePatterns?: string[];
  /** Confidence threshold for this rule (0-1). */
  confidence?: number;
}

/**
 * Configuration for progressive analysis.
 */
export interface ProgressiveAnalysisConfig {
  /** Quick scan: only critical and high severity rules. */
  quickScanRules: string[];
  /** Standard scan: all rules except experimental. */
  standardScanRules: string[];
  /** Deep scan: all rules including experimental. */
  deepScanRules: string[];
  /** Whether to automatically escalate if quick scan finds issues. */
  autoEscalate: boolean;
  /** Threshold for auto-escalation (number of findings). */
  escalationThreshold: number;
}

/**
 * Configuration for multi-file analysis.
 */
export interface MultiFileAnalysisConfig {
  /** Maximum number of files to analyze concurrently. */
  maxConcurrentFiles: number;
  /** Whether to analyze cross-file dependencies. */
  analyzeDependencies: boolean;
  /** Whether to analyze import/export relationships. */
  analyzeImports: boolean;
  /** Whether to analyze code patterns across files. */
  analyzePatterns: boolean;
  /** File patterns to group for analysis. */
  fileGroupPatterns: string[];
}

/**
 * Enhanced analyzer configuration.
 */
export interface AnalyzerConfig {
  /** Enable enhanced analysis features. */
  enableEnhancedAnalysis: boolean;
  /** Severity adjustment configuration. */
  severityAdjustment: SeverityAdjustmentConfig;
  /** Confidence thresholds per analysis type. */
  confidenceThresholds: ConfidenceThresholds;
  /** Custom rules for user-defined patterns. */
  customRules: CustomRule[];
  /** Progressive analysis configuration. */
  progressiveAnalysis: ProgressiveAnalysisConfig;
  /** Multi-file analysis configuration. */
  multiFileAnalysis: MultiFileAnalysisConfig;
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
  /** Show what would be fixed without writing files. */
  dry_run: boolean;
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
    describe?: ModelConfig;
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

  /** Enhanced analyzer configuration. */
  analyzer: AnalyzerConfig;

  /** Quality gate configuration. */
  gate: GateConfig;

  /** Secret scanning patterns (built-in + custom). */
  secretPatterns: SecretPattern[];

  /** Path to false-positive dismissals file. */
  dismissalsFile: string;

  /** Dashboard configuration. */
  dashboard: DashboardConfig;

  /** External linter integration. */
  linters: LinterConfig;

  /** Enable 3rd-party secret scanner (gitleaks/trufflehog). */
  enableSecretScanner: boolean;

  /** Strategy for blending AI security scores with static baseline. */
  securityBlendStrategy: SecurityBlendStrategy;
}

/** External linter configuration. */
export interface LinterConfig {
  /** Enable running external linters. */
  enabled: boolean;
  /** Linter tools to run, e.g. "eslint", "oxlint", "pylint", "biome". */
  tools: string[];
  /** Extra CLI arguments per tool (keyed by tool name). */
  args: Record<string, string[]>;
}

/** Quality gate threshold configuration. */
export interface GateConfig {
  /** Minimum overall score (0-100) required to pass. */
  minScore: number;
  /** Maximum number of critical findings allowed. */
  maxCritical: number;
  /** Maximum number of high findings allowed. */
  maxHigh: number;
  /** Fail on any security findings. */
  blockOnSecurity: boolean;
  /** Fail on any bug findings. */
  blockOnBugs: boolean;
}

/** Strategy for blending AI security scores with static baseline. */
export type SecurityBlendStrategy = "min" | "avg" | "static-only";

/** Secret scanning pattern configuration. */
export interface SecretPattern {
  id: string;
  name: string;
  regex: string;
  severity: Severity;
  message: string;
  suggestion: string;
}

/** False positive dismissal record. */
export interface Dismissal {
  file: string;
  line: number | null;
  ruleId: string;
  reason: string;
  dismissedAt: string;
}

/** Dashboard configuration. */
export interface DashboardConfig {
  /** Port to serve the dashboard on. */
  port: number;
  /** Directory to persist dashboard data. */
  dataDir: string;
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
