import type { CodeSentinelConfig, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, ProgressiveAnalysisConfig, MultiFileAnalysisConfig, GateConfig, SecretPattern, DashboardConfig, LinterConfig } from "./types.js";

/**
 * Default severity adjustment configuration.
 */
export const DEFAULT_SEVERITY_ADJUSTMENT: SeverityAdjustmentConfig = {
  highRiskPatterns: ["src/", "lib/", "app/"],
  lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
  historyBasedAdjustment: true,
  changeFrequencyMultiplier: 1.5,
};

/**
 * Default confidence thresholds.
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  security: 0.7,
  bug: 0.6,
  performance: 0.5,
  smell: 0.4,
  style: 0.3,
};

/**
 * Default progressive analysis configuration.
 */
export const DEFAULT_PROGRESSIVE_ANALYSIS: ProgressiveAnalysisConfig = {
  quickScanRules: ["security", "critical"],
  standardScanRules: ["security", "bug", "performance", "smell"],
  deepScanRules: ["security", "bug", "performance", "smell", "style", "experimental"],
  autoEscalate: true,
  escalationThreshold: 5,
};

/**
 * Default multi-file analysis configuration.
 */
export const DEFAULT_MULTI_FILE_ANALYSIS: MultiFileAnalysisConfig = {
  maxConcurrentFiles: 10,
  analyzeDependencies: true,
  analyzeImports: true,
  analyzePatterns: true,
  fileGroupPatterns: ["src/", "lib/", "test/"],
};

/**
 * Default analyzer configuration.
 */
export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  enableEnhancedAnalysis: false,
  severityAdjustment: DEFAULT_SEVERITY_ADJUSTMENT,
  confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  customRules: [],
  progressiveAnalysis: DEFAULT_PROGRESSIVE_ANALYSIS,
  multiFileAnalysis: DEFAULT_MULTI_FILE_ANALYSIS,
};

export const DEFAULT_GATE_CONFIG: GateConfig = {
  minScore: 0,
  maxCritical: 10,
  maxHigh: 50,
  blockOnSecurity: false,
  blockOnBugs: false,
};

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  { id: "aws-key", name: "AWS Access Key", regex: "AKIA[0-9A-Z]{16}", severity: "critical", message: "Hardcoded AWS Access Key ID detected.", suggestion: "Use IAM roles or environment variables instead." },
  { id: "aws-secret", name: "AWS Secret Key", regex: "(?i)aws(.{0,20})?(secret|access)_?key\\s*[=:]\\s*['\"][A-Za-z0-9/+=]{40}['\"]", severity: "critical", message: "Hardcoded AWS Secret Access Key detected.", suggestion: "Use IAM roles or environment variables instead." },
  { id: "github-token", name: "GitHub Token", regex: "(?i)github[-_]?(token|pat|key)\\s*[=:]\\s*['\"](ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}['\"]", severity: "critical", message: "Hardcoded GitHub token detected.", suggestion: "Use GITHUB_TOKEN secret or environment variables." },
  { id: "slack-token", name: "Slack Token", regex: "(xox[baprs]-[0-9a-zA-Z]{10,})", severity: "high", message: "Hardcoded Slack token detected.", suggestion: "Use environment variables for Slack tokens." },
  { id: "ssh-key", name: "SSH Private Key", regex: "-----BEGIN\\s+(RSA|DSA|EC|OPENSSH|PRIVATE)\\s+KEY-----", severity: "critical", message: "Hardcoded SSH private key detected.", suggestion: "Use SSH agent or secrets manager." },
  { id: "jwt-token", name: "JWT Token", regex: "(?i)(jwt|bearer)\\s*[=:]\\s*['\"]eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}['\"]", severity: "high", message: "Hardcoded JWT token detected.", suggestion: "Use short-lived tokens from a secure source." },
  { id: "pg-conn-str", name: "PostgreSQL Connection String", regex: "postgres(ql)?://\\w+:\\w+@", severity: "high", message: "Hardcoded PostgreSQL connection string detected.", suggestion: "Use environment variables for database URLs." },
  { id: "redis-conn-str", name: "Redis Connection String", regex: "redis://\\w+:\\w+@", severity: "high", message: "Hardcoded Redis connection string detected.", suggestion: "Use environment variables for Redis URLs." },
  { id: "private-key-header", name: "Private Key Header", regex: "(?i)-----BEGIN\\s+(?:(?:RSA|DSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY-----", severity: "critical", message: "Hardcoded private key detected.", suggestion: "Use a secrets manager or environment variables." },
  { id: "npm-token", name: "npm Token", regex: "(?i)npm[-_]?token\\s*[=:]\\s*['\"][a-f0-9]{36}['\"]", severity: "high", message: "Hardcoded npm token detected.", suggestion: "Use environment variables for npm tokens." },
  { id: "generic-api-key", name: "Generic API Key", regex: "(?i)(api[-_]?(key|token|secret)|secret[-_]?key)\\s*[=:]\\s*['\"][A-Za-z0-9_\\-]{20,}['\"]", severity: "high", message: "Possible hardcoded API key or secret detected.", suggestion: "Use environment variables or a secrets manager." },
];

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  port: 4173,
  dataDir: ".codesentinel-dashboard",
};

export const DEFAULT_LINTER_CONFIG: LinterConfig = {
  enabled: true,
  tools: ["eslint", "biome", "pylint"],
  args: {},
};

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
  dry_run: false,
  custom_prompt_paths: {},
  project_context: "",

  default_model: { provider: "opencode", model: "opencode/default" },
  models: {
    review: { provider: "opencode", model: "opencode/default" },
    fix: { provider: "opencode", model: "opencode/default" },
    audit: { provider: "opencode", model: "opencode/default" },
    score: { provider: "opencode", model: "opencode/default" },
    testgen: { provider: "opencode", model: "opencode/default" },
    chat: { provider: "opencode", model: "opencode/default" },
    describe: { provider: "opencode", model: "opencode/default" },
  },

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
    writeHtmlReport: false,
    reportDir: "codesentinel-reports",
  },

  enable_cache: true,
  cache_dir: ".codesentinel-cache",

  plugins: [],

  analyzer: DEFAULT_ANALYZER_CONFIG,
  gate: DEFAULT_GATE_CONFIG,
  secretPatterns: DEFAULT_SECRET_PATTERNS,
  dismissalsFile: ".codesentinel/dismissals.json",
  dashboard: DEFAULT_DASHBOARD_CONFIG,
  linters: DEFAULT_LINTER_CONFIG,
  enableSecretScanner: false,
  securityBlendStrategy: "min",
};

/** Deep-merge two configs (shallow per top-level key, special-cased objects/arrays). */
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
  if (override.include) {
    merged.include = [...base.include, ...override.include];
  }
  if (override.exclude) {
    merged.exclude = [...base.exclude, ...override.exclude];
  }
  if (override.plugins) {
    merged.plugins = [...base.plugins, ...override.plugins];
  }
  if (override.gate) {
    merged.gate = { ...base.gate, ...override.gate };
  }
  if (override.secretPatterns) {
    merged.secretPatterns = [...override.secretPatterns];
  }
  if (override.dashboard) {
    merged.dashboard = { ...base.dashboard, ...override.dashboard };
  }
  if (override.linters) {
    merged.linters = {
      ...base.linters,
      ...override.linters,
      args: { ...base.linters.args, ...override.linters.args },
    };
  }
  if (override.enableSecretScanner !== undefined) {
    merged.enableSecretScanner = override.enableSecretScanner;
  }
  if (override.analyzer) {
    merged.analyzer = {
      ...base.analyzer,
      ...override.analyzer,
      severityAdjustment: {
        ...base.analyzer.severityAdjustment,
        ...override.analyzer.severityAdjustment,
      },
      confidenceThresholds: {
        ...base.analyzer.confidenceThresholds,
        ...override.analyzer.confidenceThresholds,
      },
      progressiveAnalysis: {
        ...base.analyzer.progressiveAnalysis,
        ...override.analyzer.progressiveAnalysis,
      },
      multiFileAnalysis: {
        ...base.analyzer.multiFileAnalysis,
        ...override.analyzer.multiFileAnalysis,
      },
    };
    if (override.analyzer.customRules) {
      merged.analyzer.customRules = [...base.analyzer.customRules, ...override.analyzer.customRules];
    }
  }
  return merged;
}
