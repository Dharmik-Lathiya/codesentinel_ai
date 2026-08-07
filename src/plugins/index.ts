import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CodeSentinelConfig } from "../config/types.js";
import type { Finding } from "../analyzer/index.js";
import type { ScoreBreakdown } from "../scorer/index.js";

/**
 * Plugins extend CodeSentinel without modifying core code. Each plugin may hook
 * into lifecycle events and optionally contribute additional findings or alter
 * the score. This is the extension point mentioned in the design.
 */
export interface PluginContext {
  config: CodeSentinelConfig;
  /** Project root used to resolve relative plugin paths. */
  root?: string;
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
}

export interface CodeSentinelPlugin {
  name: string;
  /** Called once at engine startup. */
  init?(ctx: PluginContext): void | Promise<void>;
  /** Add findings based on the analyzed files. */
  analyze?(
    files: { path: string; content: string }[],
  ): Finding[] | Promise<Finding[]>;
  /** Adjust the final score breakdown. */
  score?(
    breakdown: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): ScoreBreakdown | Promise<ScoreBreakdown>;
}

const SEVERITIES: ReadonlySet<string> = new Set([
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);
const FINDING_CATEGORIES: ReadonlySet<string> = new Set([
  "bug",
  "security",
  "performance",
  "smell",
  "style",
  "praise",
]);

/** Lightweight shape check for plugin-provided findings. */
function isValidFinding(f: unknown): f is Finding {
  if (!f || typeof f !== "object") return false;
  const o = f as Record<string, unknown>;
  return (
    typeof o.file === "string" &&
    typeof o.comment === "string" &&
    (o.line === null || typeof o.line === "number") &&
    typeof o.severity === "string" &&
    SEVERITIES.has(o.severity) &&
    typeof o.category === "string" &&
    FINDING_CATEGORIES.has(o.category) &&
    (o.source === "static" ||
      o.source === "ai" ||
      o.source === "linter" ||
      o.source === "scanner")
  );
}

/** Lightweight shape check for plugin-provided score breakdowns. */
function isValidScoreBreakdown(b: unknown): b is ScoreBreakdown {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.readability === "number" &&
    typeof o.maintainability === "number" &&
    typeof o.security === "number" &&
    typeof o.test_coverage === "number" &&
    typeof o.overall === "number" &&
    typeof o.rationale === "string"
  );
}

/**
 * PluginManager loads plugin modules (from config.plugins) and dispatches
 * lifecycle hooks. Modules must default-export a CodeSentinelPlugin.
 */
export class PluginManager {
  private plugins: CodeSentinelPlugin[] = [];

  constructor(private ctx: PluginContext) {}

  /** Dynamically import and register plugins listed in config. */
  async load(paths: string[]): Promise<void> {
    const registered = new Set<string>();
    for (const p of paths) {
      // Issues log on failure inside loadPlugin and return null instead of
      // throwing, so a failing plugin does not abort the remaining ones.
      const plugin = await this.loadPlugin(p);
      if (!plugin) continue;
      if (registered.has(plugin.name)) {
        this.ctx.logger.warn(
          `Plugin "${plugin.name}" already loaded; skipping duplicate.`,
        );
        continue;
      }
      try {
        await plugin.init?.(this.ctx);
      } catch (err) {
        this.ctx.logger.warn(
          `Init hook failed for plugin "${plugin.name}":`,
          err,
        );
        // Do not register the plugin if init() failed.
        continue;
      }
      registered.add(plugin.name);
      this.plugins.push(plugin);
      this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
    }
  }

  /** Resolve a plugin specifier against the project root into an importable URL. */
  private toModuleSpecifier(path: string): string {
    if (!isAbsolute(path)) {
      const root = this.ctx.root ?? process.cwd();
      return pathToFileURL(resolve(root, path)).href;
    }
    return path;
  }

  private async loadPlugin(path: string): Promise<CodeSentinelPlugin | null> {
    let plugin: CodeSentinelPlugin | undefined;
    try {
      plugin = (
        (await import(this.toModuleSpecifier(path))) as {
          default?: CodeSentinelPlugin;
        }
      ).default;
    } catch (err) {
      this.ctx.logger.warn(`Failed to load plugin "${path}":`, err);
      return null;
    }
    if (!plugin) {
      this.ctx.logger.warn(
        `Plugin "${path}" does not export a default CodeSentinelPlugin.`,
      );
      return null;
    }
    if (typeof plugin.name !== "string" || plugin.name.length === 0) {
      this.ctx.logger.warn(
        `Plugin "${path}" is missing a valid "name" property.`,
      );
      return null;
    }
    return plugin;
  }

  get all(): CodeSentinelPlugin[] {
    return [...this.plugins];
  }

  /** Run all plugins' analyze hooks and merge their findings. */
  async runAnalyze(
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    try {
      // Sequential collection keeps finding ordering deterministic across plugins.
      const out: Finding[] = [];
      for (const p of this.plugins) {
        out.push(...(await this.runAnalyzeOne(p, files)));
      }
      return out;
    } catch (err) {
      this.ctx.logger.warn(`Analyze phase failed:`, err);
      return [];
    }
  }

  private async runAnalyzeOne(
    plugin: CodeSentinelPlugin,
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    try {
      const findings = await plugin.analyze?.(files);
      if (!Array.isArray(findings)) return [];
      return findings.filter(isValidFinding);
    } catch (err) {
      this.ctx.logger.warn(
        `Analyze hook failed for plugin "${plugin.name}":`,
        err,
      );
      return [];
    }
  }

  /** Run all plugins' score hooks sequentially. */
  async runScore(
    breakdown: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): Promise<ScoreBreakdown> {
    let b = breakdown;
    for (const p of this.plugins) {
      b = await this.runScoreOne(p, b, files);
    }
    return b;
  }

  private async runScoreOne(
    plugin: CodeSentinelPlugin,
    breakdown: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): Promise<ScoreBreakdown> {
    try {
      const next = await plugin.score?.(breakdown, files);
      return isValidScoreBreakdown(next) ? (next as ScoreBreakdown) : breakdown;
    } catch (err) {
      this.ctx.logger.warn(
        `Score hook failed for plugin "${plugin.name}":`,
        err,
      );
      return breakdown;
    }
  }
}
