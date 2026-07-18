import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { DEFAULT_CONFIG, mergeConfig } from "./defaults.js";
import type { CodeSentinelConfig, Mode, AnalyzerConfig } from "./types.js";

/**
 * Loose schema used only to validate user-supplied config files. We intentionally
 * keep it permissive and fall back to defaults for anything missing.
 */
const userConfigSchema = z
  .object({
    mode: z
      .enum(["review", "fix", "audit", "score", "testgen", "chat"])
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

  if (opts.configPath) {
    const path = resolve(opts.configPath);
    if (!existsSync(path)) {
      throw new Error(`Config file not found: ${path}`);
    }
    const raw = readFileSync(path, "utf8");
    fileConfig = parseJsonc(raw);
  }

  const parsed = userConfigSchema.parse(fileConfig) as Partial<CodeSentinelConfig>;
  const fromFile = mergeConfig(DEFAULT_CONFIG, parsed);
  const final = mergeConfig(
    fromFile,
    opts.overrides ?? ({} as Partial<CodeSentinelConfig>),
  );

  validateConfig(final);
  return final;
}

/** Minimal JSONC parser: strips // and /* *\/ comments then JSON.parse. */
function parseJsonc(raw: string): Record<string, unknown> {
  // Strip block comments, then line comments — but only outside of strings.
  // We replace string contents with placeholders first to avoid false matches.
  const placeholders: string[] = [];
  let masked = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    placeholders.push(match);
    return `\x00STR${placeholders.length - 1}\x00`;
  });
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, "");
  masked = masked.replace(/(^|[^:])\/\/.*$/gm, "$1");
  // Restore strings.
  masked = masked.replace(/\x00STR(\d+)\x00/g, (_, i) => placeholders[Number(i)]);
  return JSON.parse(masked);
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
  return out as Partial<CodeSentinelConfig>;
}
