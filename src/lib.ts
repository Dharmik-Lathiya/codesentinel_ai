export { Engine } from "./engine/index.js";
export type { EngineReport, ReviewComment, FixAttempt, Hunk } from "./engine/index.js";
export { applyHunks } from "./engine/index.js";

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
  SecurityBlendStrategy,
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

export { renderHtmlReport } from "./utils/html-report.js";
export { renderSarif } from "./utils/sarif.js";
export { concurrentMap } from "./utils/concurrency.js";

export { parseJsonlString, parseJsonlFile, validateAndNormalize, buildReviewBody, buildInlineComments } from "./jsonl-parser.js";
export type { ReviewResult } from "./jsonl-parser.js";

export { MCPManager } from "./mcp/client.js";
export type { MCPServerConfig, MCPContextEntry } from "./mcp/client.js";
export { getDefaultMCPServers } from "./mcp/servers.js";

export { LearningStore } from "./learning/store.js";
export type { FindingRecord, PatternRecord, CustomRuleRecord } from "./learning/store.js";

export { EventBus } from "./event-bus/bus.js";
export type { GitHubEvent, Subscriber } from "./event-bus/types.js";

export { setupOpenCode } from "./opencode/installer.js";
