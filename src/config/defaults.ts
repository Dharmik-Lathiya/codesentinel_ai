import type { CodeSentinelConfig, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, ProgressiveAnalysisConfig, MultiFileAnalysisConfig } from "./types.js";

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
