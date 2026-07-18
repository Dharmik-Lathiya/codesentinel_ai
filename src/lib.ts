export { Engine } from "./engine/index.js";
export type { EngineReport, ReviewComment, FixAttempt } from "./engine/index.js";

export { loadConfig, configFromInputs } from "./config/index.js";
export type {
  CodeSentinelConfig,
  ModelConfig,
  Provider,
  Mode,
  RuntimeSecrets,
  Severity,
  TestRunner,
  OutputConfig,
  AnalyzerConfig,
  CustomRule,
  ConfidenceThresholds,
  SeverityAdjustmentConfig,
  ProgressiveAnalysisConfig,
  MultiFileAnalysisConfig,
} from "./config/types.js";

export { DEFAULT_CONFIG, mergeConfig } from "./config/defaults.js";

export type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
  ChatMessage,
} from "./ai/provider.js";
export { extractJson, ProviderUnavailableError } from "./ai/provider.js";
export { AIHub } from "./ai/index.js";
export type { TaskName } from "./ai/index.js";

export type { Finding } from "./analyzer/index.js";
export type { ScoreBreakdown } from "./scorer/index.js";
export type { CodeSentinelPlugin, PluginContext } from "./plugins/index.js";
export type { GeneratedTest, DetectedFunction } from "./testgen/index.js";
