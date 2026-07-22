import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { z, ZodError } from "zod";

import { DEFAULT_CONFIG, mergeConfig } from "./defaults.js";
import type { CodeSentinelConfig, Mode, AnalyzerConfig } from "./types.js";
import { loadYamlConfig, searchConfigPaths } from "./loader.js";
import { parseJsonc } from "../utils/jsonc.js";

/**
 * Loose schema used only to validate user-supplied config files. We intentionally
 * keep it permissive and fall back to defaults for anything missing.
 */
const userConfigSchema = z
  .object({
    mode: z
      .enum(["review", "fix", "audit", "score", "testgen", "chat", "gate", "describe", "improve"])
      .optional(),
    max_iterations: z.number().int().positive().optional(),
    enable_auto_fix: z.boolean().optional(),
    enable_scoring: z.boolean().optional(),
    enable_test_generation: z.boolean().optional(),
    include_positive_feedback: z.boolean().optional(),
    dry_run: z.boolean().optional(),
    custom_prompt_paths: z.record(z.string()).optional(),
    project_context: z.string().optional(),
    default_model: z
      .object({ provider: z.string(), model: z.string() })
      .optional(),
    models: z.record(z.string(), z.any()).optional(),
    test_runner: z.enum(["jest", "vitest"]).optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    output: z.record(z.any()).optional(),
    enable_cache: z.boolean().optional(),
    cache_dir: z.string().optional(),
    plugins: z.array(z.string()).optional(),
    analyzer: z
      .object({
        enableEnhancedAnalysis: z.boolean().optional(),
        severityAdjustment: z
          .object({
            highRiskPatterns: z.array(z.string()).optional(),
            lowRiskPatterns: z.array(z.string()).optional(),
            historyBasedAdjustment: z.boolean().optional(),
            changeFrequencyMultiplier: z.number().optional(),
          })
          .optional(),
        confidenceThresholds: z
          .object({
            security: z.number().min(0).max(1).optional(),
            bug: z.number().min(0).max(1).optional(),
            performance: z.number().min(0).max(1).optional(),
            smell: z.number().min(0).max(1).optional(),
            style: z.number().min(0).max(1).optional(),
          })
          .optional(),
        customRules: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              pattern: z.string(),
              severity: z.enum(["info", "low", "medium", "high", "critical"]),
              category: z.enum(["bug", "security", "performance", "smell", "style", "praise"]),
              comment: z.string(),
              suggestion: z.string().optional(),
              filePatterns: z.array(z.string()).optional(),
              confidence: z.number().min(0).max(1).optional(),
            }),
          )
          .optional(),
        progressiveAnalysis: z
          .object({
            quickScanRules: z.array(z.string()).optional(),
            standardScanRules: z.array(z.string()).optional(),
            deepScanRules: z.array(z.string()).optional(),
            autoEscalate: z.boolean().optional(),
            escalationThreshold: z.number().optional(),
          })
          .optional(),
        multiFileAnalysis: z
          .object({
            maxConcurrentFiles: z.number().optional(),
            analyzeDependencies: z.boolean().optional(),
            analyzeImports: z.boolean().optional(),
            analyzePatterns: z.boolean().optional(),
            fileGroupPatterns: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .optional(),
    gate: z
      .object({
        minScore: z.number().min(0).max(100).optional(),
        maxCritical: z.number().min(0).optional(),
        maxHigh: z.number().min(0).optional(),
        blockOnSecurity: z.boolean().optional(),
        blockOnBugs: z.boolean().optional(),
      })
      .optional(),
    secretPatterns: z
      .array(z.object({
        id: z.string(),
        name: z.string(),
        regex: z.string(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        message: z.string(),
        suggestion: z.string().optional(),
      }))
      .optional(),
    dismissalsFile: z.string().optional(),
    dashboard: z
      .object({
        port: z.number().optional(),
        dataDir: z.string().optional(),
      })
      .optional(),
    jsonl_output: z.boolean().optional(),
    linters: z
      .object({
        enabled: z.boolean().optional(),
        tools: z.array(z.string()).optional(),
        args: z.record(z.array(z.string())).optional(),
      })
      .optional(),
    enableSecretScanner: z.boolean().optional(),
    securityBlendStrategy: z.enum(["min", "avg", "static-only"]).optional(),
    learning: z
      .object({
        enabled: z.boolean().optional(),
        dbPath: z.string().optional(),
        metaReview: z.boolean().optional(),
        patternDiscovery: z.boolean().optional(),
        metaReviewInterval: z.number().optional(),
      })
      .optional(),
    mcp: z
      .object({
        enabled: z.boolean().optional(),
        servers: z.array(z.any()).optional(),
      })
      .optional(),
    batch: z
      .object({
        enabled: z.boolean().optional(),
        batchSize: z.number().optional(),
        maxFilesPerBatch: z.number().optional(),
        maxLinesPerFile: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Resolve the effective configuration by layering, in increasing priority:
 *   1. built-in defaults
 *   2. config file (JSON or JSONC)
 *   3. explicit overrides (e.g. CLI flags / GitHub Action inputs)
 */
export function loadConfig(opts: {
  configPath?: string;
  overrides?: Partial<CodeSentinelConfig>;
} = {}): CodeSentinelConfig {
  let fileConfig: Record<string, unknown> = {};

  const configPath = opts.configPath;
  if (configPath) {
    const path = resolve(configPath);
    if (!existsSync(path)) {
      throw new Error(`Config file not found: ${path}`);
    }
    const ext = extname(path).toLowerCase();
    if (ext === ".yml" || ext === ".yaml") {
      fileConfig = loadYamlConfig(path);
    } else {
      const raw = readFileSync(path, "utf8");
      fileConfig = parseJsonc(raw);
    }
  } else {
    // Auto-discover YAML config if no --config given
    const yamlPath = searchConfigPaths();
    if (yamlPath) {
      fileConfig = loadYamlConfig(yamlPath);
    }
  }

  const parsed = userConfigSchema.safeParse(fileConfig);
  if (!parsed.success) {
    const friendly = formatZodErrors(parsed.error);
    throw new Error(`Invalid config${configPath ? ` in ${configPath}` : ""}:\n${friendly}`);
  }
  const fromFile = mergeConfig(DEFAULT_CONFIG, parsed.data as Partial<CodeSentinelConfig>);
  const final = mergeConfig(
    fromFile,
    opts.overrides ?? ({} as Partial<CodeSentinelConfig>),
  );

  validateConfig(final);
  return final;
}



/** Convert a ZodError into a concise, human-readable list of issues. */
function formatZodErrors(error: ZodError): string {
  const LABELS: Record<string, string> = {
    mode: "mode",
    max_iterations: "max_iterations",
    enable_auto_fix: "enable_auto_fix",
    enable_scoring: "enable_scoring",
    enable_test_generation: "enable_test_generation",
    test_runner: "test_runner",
    include: "include",
    exclude: "exclude",
    plugins: "plugins",
    gate: "gate",
    analyzer: "analyzer",
    default_model: "default_model",
    cache_dir: "cache_dir",
    enable_cache: "enable_cache",
    secretPatterns: "secretPatterns",
    dismissalsFile: "dismissalsFile",
    dashboard: "dashboard",
  };

  const lines: string[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
    const label = path ? (LABELS[path] ?? path) : "(root)";

    if (issue.code === "invalid_type") {
      const expected = issue.received === "undefined" ? "optional" : `type ${issue.expected}`;
      lines.push(`  - ${label}: expected ${expected}, got ${issue.received}`);
    } else if (issue.code === "invalid_enum_value") {
      const valid = issue.options.map((o) => `"${o}"`).join(", ");
      lines.push(`  - ${label}: must be one of ${valid}, got "${issue.received}"`);
    } else if (issue.code === "too_small") {
      lines.push(`  - ${label}: must be >= ${issue.minimum}`);
    } else if (issue.code === "too_big") {
      lines.push(`  - ${label}: must be <= ${issue.maximum}`);
    } else if (issue.code === "invalid_string") {
      lines.push(`  - ${label}: ${issue.validation} string expected`);
    } else {
      lines.push(`  - ${label}: ${issue.message}`);
    }
  }
  return lines.join("\n");
}

/** Sanity-check a fully-merged config. */
function validateConfig(config: CodeSentinelConfig): void {
  if (config.max_iterations < 1) {
    throw new Error("max_iterations must be >= 1");
  }
  const validModes: Mode[] = [
    "review",
    "fix",
    "audit",
    "score",
    "testgen",
    "chat",
    "gate",
    "describe",
  ];
  if (!validModes.includes(config.mode)) {
    throw new Error(`Invalid mode: ${config.mode}`);
  }
}

/** Normalize a partial config from stringly-typed GitHub Action inputs. */
export function configFromInputs(
  inputs: Record<string, string | undefined>,
): Partial<CodeSentinelConfig> {
  const out: Record<string, unknown> = {};
  if (inputs.mode) out.mode = inputs.mode as Mode;
  if (inputs.max_iterations)
    out.max_iterations = Number(inputs.max_iterations);
  if (inputs.enable_auto_fix)
    out.enable_auto_fix = inputs.enable_auto_fix === "true";
  if (inputs.enable_scoring)
    out.enable_scoring = inputs.enable_scoring === "true";
  if (inputs.enable_test_generation)
    out.enable_test_generation = inputs.enable_test_generation === "true";
  if (inputs.project_context) out.project_context = inputs.project_context;
  if (inputs.test_runner) out.test_runner = inputs.test_runner as "jest" | "vitest";
  if (inputs.provider) {
    const providerModel = { provider: inputs.provider, model: "default" };
    out.default_model = providerModel;
    out.models = {
      review: providerModel,
      fix: providerModel,
      audit: providerModel,
      score: providerModel,
      testgen: providerModel,
      chat: providerModel,
    };
  }
  if (inputs.jsonl_output) out.jsonl_output = inputs.jsonl_output === "true";
  if (inputs.mcp_enabled) out.mcp = { enabled: inputs.mcp_enabled === "true", servers: [] };
  if (inputs.learning_enabled) {
    out.learning = {
      enabled: inputs.learning_enabled === "true",
      dbPath: inputs.learning_db_path ?? DEFAULT_CONFIG.learning.dbPath,
    };
  }
  return out as Partial<CodeSentinelConfig>;
}
