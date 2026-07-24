import type { CodeSentinelConfig, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, ProgressiveAnalysisConfig, MultiFileAnalysisConfig, GateConfig, SecretPattern, DashboardConfig, LinterConfig, LearningConfig, MCPConfig, BatchConfig } from "./types.js";
/**
 * Default severity adjustment configuration.
 */
export declare const DEFAULT_SEVERITY_ADJUSTMENT: SeverityAdjustmentConfig;
/**
 * Default confidence thresholds.
 */
export declare const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds;
/**
 * Default progressive analysis configuration.
 */
export declare const DEFAULT_PROGRESSIVE_ANALYSIS: ProgressiveAnalysisConfig;
/**
 * Default multi-file analysis configuration.
 */
export declare const DEFAULT_MULTI_FILE_ANALYSIS: MultiFileAnalysisConfig;
/**
 * Default analyzer configuration.
 */
export declare const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig;
export declare const DEFAULT_GATE_CONFIG: GateConfig;
export declare const DEFAULT_SECRET_PATTERNS: SecretPattern[];
export declare const DEFAULT_DASHBOARD_CONFIG: DashboardConfig;
export declare const DEFAULT_LINTER_CONFIG: LinterConfig;
export declare const DEFAULT_LEARNING_CONFIG: LearningConfig;
export declare const DEFAULT_MCP_CONFIG: MCPConfig;
export declare const DEFAULT_BATCH_CONFIG: BatchConfig;
/**
 * Default configuration. Values here are safe fallbacks; users are expected to
 * override via a config file, environment variables, or CLI flags.
 */
export declare const DEFAULT_CONFIG: CodeSentinelConfig;
/** Deep-merge two configs (shallow per top-level key, special-cased objects/arrays). */
export declare function mergeConfig(base: CodeSentinelConfig, override: Partial<CodeSentinelConfig>): CodeSentinelConfig;
