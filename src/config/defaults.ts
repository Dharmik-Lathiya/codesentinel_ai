import type { CodeSentinelConfig, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, ProgressiveAnalysisConfig, MultiFileAnalysisConfig, GateConfig, SecretPattern, DashboardConfig, LinterConfig, LearningConfig, MCPConfig, BatchConfig } from "./types.js";

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
  { id: "ssh-key", name: "SSH Private Key", regex: "(?i)-----BEGIN\\s+(?:(?:RSA|DSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY-----", severity: "critical", message: "Hardcoded SSH private key detected.", suggestion: "Use SSH agent or secrets manager." },
  { id: "jwt-token", name: "JWT Token", regex: "(?i)(jwt|bearer)\\s*[=:]\\s*['\"]eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}['\"]", severity: "high", message: "Hardcoded JWT token detected.", suggestion: "Use short-lived tokens from a secure source." },
  { id: "pg-conn-str", name: "PostgreSQL Connection String", regex: "postgres(ql)?://\\w+:\\w+@", severity: "high", message: "Hardcoded PostgreSQL connection string detected.", suggestion: "Use environment variables for database URLs." },
  { id: "redis-conn-str", name: "Redis Connection String", regex: "redis://\\w+:\\w+@", severity: "high", message: "Hardcoded Redis connection string detected.", suggestion: "Use environment variables for Redis URLs." },
  { id: "private-key-header", name: "Private Key Header", regex: "(?i)-----BEGIN\\s+(?:(?:RSA|DSA|EC|OPENSSH)\\s+)?PRIVATE\\s+KEY-----", severity: "critical", message: "Hardcoded private key detected.", suggestion: "Use a secrets manager or environment variables." },
  { id: "npm-token", name: "npm Token", regex: "(?i)npm[-_]?token\\s*[=:]\\s*['\"][a-f0-9]{36}['\"]", severity: "high", message: "Hardcoded npm token detected.", suggestion: "Use environment variables for npm tokens." },
  { id: "generic-api-key", name: "Generic API Key", regex: "(?i)(api[-_]?(key|token|secret)|secret[-_]?key)\\s*[=:]\\s*['\"][A-Za-z0-9_\\-]{20,}['\"]", severity: "high", message: "Possible hardcoded API key or secret detected.", suggestion: "Use environment variables or a secrets manager." },
  { id: "google-api-key", name: "Google API Key", regex: "(?i)AIza[0-9A-Za-z\\-_]{35}", severity: "high", message: "Hardcoded Google API key detected.", suggestion: "Use environment variables or Google Cloud IAM." },
  { id: "google-oauth-id", name: "Google OAuth Client ID", regex: "[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com", severity: "high", message: "Hardcoded Google OAuth client ID detected.", suggestion: "Store client IDs in environment variables." },
  { id: "stripe-live-key", name: "Stripe Live API Key", regex: "(?i)sk_live_[0-9a-zA-Z]{24,}", severity: "critical", message: "Hardcoded Stripe live secret key detected.", suggestion: "Use Stripe's restricted keys or environment variables." },
  { id: "stripe-publishable-key", name: "Stripe Publishable Key", regex: "(?i)pk_(live|test)_[0-9a-zA-Z]{24,}", severity: "low", message: "Stripe publishable key exposed.", suggestion: "Stripe publishable keys are public but should still be in env vars." },
  { id: "mongodb-conn-str", name: "MongoDB Connection String", regex: "mongodb(?:\\+srv)?://[^\\s@]+:[^\\s@]+@", severity: "critical", message: "Hardcoded MongoDB connection string with credentials detected.", suggestion: "Use environment variables for MongoDB URIs." },
  { id: "discord-token", name: "Discord Bot Token", regex: "[MN][A-Za-z0-9_-]{23}\\.[A-Za-z0-9_-]{6}\\.[A-Za-z0-9_-]{27}", severity: "critical", message: "Hardcoded Discord bot token detected.", suggestion: "Use environment variables for Discord tokens." },
  { id: "telegram-token", name: "Telegram Bot Token", regex: "[0-9]{8,10}:[A-Za-z0-9_-]{35}", severity: "critical", message: "Hardcoded Telegram bot token detected.", suggestion: "Use environment variables for Telegram tokens." },
  { id: "twilio-account-sid", name: "Twilio Account SID", regex: "(?i)AC[0-9a-f]{32}", severity: "high", message: "Hardcoded Twilio Account SID detected.", suggestion: "Use environment variables for Twilio credentials." },
  { id: "twilio-auth-token", name: "Twilio Auth Token", regex: "(?i)twilio(.{0,20})?(auth|secret|token)\\s*[=:]\\s*['\"][0-9a-f]{32}['\"]", severity: "critical", message: "Hardcoded Twilio auth token detected.", suggestion: "Use environment variables for Twilio credentials." },
  { id: "heroku-api-key", name: "Heroku API Key", regex: "(?i)heroku(.{0,20})?(api[-_]?key|token)\\s*[=:]\\s*['\"][A-Za-z0-9_-]{36,}['\"]", severity: "high", message: "Hardcoded Heroku API key detected.", suggestion: "Use environment variables for Heroku API access." },
  { id: "sendgrid-api-key", name: "SendGrid API Key", regex: "(?i)SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}", severity: "critical", message: "Hardcoded SendGrid API key detected.", suggestion: "Use environment variables for SendGrid credentials." },
  { id: "mailchimp-api-key", name: "Mailchimp API Key", regex: "[0-9a-f]{32}-us[0-9]{1,2}", severity: "high", message: "Hardcoded Mailchimp API key detected.", suggestion: "Use environment variables for Mailchimp API access." },
  { id: "square-access-token", name: "Square Access Token", regex: "(?i)EAAA[A-Za-z0-9_\\-]{50,}", severity: "critical", message: "Hardcoded Square access token detected.", suggestion: "Use environment variables for Square credentials." },
  { id: "pypi-api-token", name: "PyPI API Token", regex: "(?i)pypi[-_]?token\\s*[=:]\\s*['\"]pypi-[A-Za-z0-9_]{36,}['\"]", severity: "high", message: "Hardcoded PyPI API token detected.", suggestion: "Use environment variables for package registry tokens." },
  { id: "docker-hub-token", name: "Docker Hub Token", regex: "(?i)docker[-_]?(hub|token|pat)\\s*[=:]\\s*['\"][A-Za-z0-9_\\-]{36,}['\"]", severity: "high", message: "Hardcoded Docker Hub token detected.", suggestion: "Use Docker Hub credentials via environment variables." },
  { id: "sentry-dsn", name: "Sentry DSN", regex: "https://[0-9a-f]{32}@[a-z0-9]+\\.ingest\\.sentry\\.io", severity: "medium", message: "Sentry DSN exposed.", suggestion: "Sentry DSNs are public but should use environment variables." },
  { id: "datadog-api-key", name: "Datadog API Key", regex: "(?i)datadog(.{0,20})?(api[-_]?key)\\s*[=:]\\s*['\"][0-9a-f]{32}['\"]", severity: "high", message: "Hardcoded Datadog API key detected.", suggestion: "Use environment variables for Datadog credentials." },
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

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: false,
  dbPath: ".codesentinel/learning.db",
  metaReview: true,
  patternDiscovery: true,
  metaReviewInterval: 10,
};

export const DEFAULT_MCP_CONFIG: MCPConfig = {
  enabled: false,
  servers: [],
};

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  enabled: true,
  batchSize: 5,
  maxFilesPerBatch: 5,
  maxLinesPerFile: 500,
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

  default_model: { provider: "opencode", model: "deepseek-v4-flash-free" },
  models: {
    review: { provider: "opencode", model: "deepseek-v4-flash-free" },
    fix: { provider: "opencode", model: "deepseek-v4-flash-free" },
    audit: { provider: "opencode", model: "deepseek-v4-flash-free" },
    score: { provider: "opencode", model: "deepseek-v4-flash-free" },
    testgen: { provider: "opencode", model: "deepseek-v4-flash-free" },
    chat: { provider: "opencode", model: "deepseek-v4-flash-free" },
    describe: { provider: "opencode", model: "deepseek-v4-flash-free" },
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
  jsonl_output: false,
  securityBlendStrategy: "min",

  learning: DEFAULT_LEARNING_CONFIG,
  mcp: DEFAULT_MCP_CONFIG,
  batch: DEFAULT_BATCH_CONFIG,
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
