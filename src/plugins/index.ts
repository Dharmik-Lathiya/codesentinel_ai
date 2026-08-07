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

/**
 * PluginManager loads plugin modules (from config.plugins) and dispatches
 * lifecycle hooks. Modules must default-export a CodeSentinelPlugin.
 */
export class PluginManager {
  private plugins: CodeSentinelPlugin[] = [];
  private loadedPaths = new Set<string>();

  constructor(private ctx: PluginContext) {}

  /** Dynamically import and register plugins listed in config.
   * Plugin paths must be absolute: dynamic import() resolves a relative
   * path against the importing module, not the process CWD, so relative
   * paths are ambiguous and unsupported. */
  async load(paths: string[]): Promise<void> {
    for (const p of paths) {
      if (this.loadedPaths.has(p)) continue;
      this.loadedPaths.add(p);
      try {
        await this.registerPlugin(p);
      } catch (err) {
        this.ctx.logger.warn(`Failed to load plugin "${p}":`, err);
      }
    }
  }

  private async registerPlugin(path: string): Promise<void> {
    const plugin = await this.loadPlugin(path);
    if (!plugin) {
      return;
    }
    await plugin.init?.(this.ctx);
    this.plugins.push(plugin);
    this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
  }

  private async loadPlugin(path: string): Promise<CodeSentinelPlugin | null> {
    try {
      const mod = (await import(path)) as { default?: CodeSentinelPlugin };
      return this.validatePlugin(mod.default, path);
    } catch (err) {
      this.ctx.logger.warn(`Failed to load plugin "${path}":`, err);
      return null;
    }
  }

  private validatePlugin(
    plugin: CodeSentinelPlugin | undefined,
    path: string,
  ): CodeSentinelPlugin | null {
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
    for (const hook of ["analyze", "score"] as const) {
      if (plugin[hook] !== undefined && typeof plugin[hook] !== "function") {
        this.ctx.logger.warn(
          `Plugin "${path}" has a non-function "${hook}" hook.`,
        );
        return null;
      }
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
    const results = await Promise.allSettled(
      this.plugins.map((p) => this.runAnalyzeFor(p, files)),
    );
    return results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
  }

  private async runAnalyzeFor(
    plugin: CodeSentinelPlugin,
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    try {
      return (await plugin.analyze?.(files)) ?? [];
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
      b = await this.runScoreFor(p, b, files);
    }
    return b;
  }

  private async runScoreFor(
    plugin: CodeSentinelPlugin,
    breakdown: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): Promise<ScoreBreakdown> {
    try {
      return (await plugin.score?.(breakdown, files)) ?? breakdown;
    } catch (err) {
      this.ctx.logger.warn(
        `Score hook failed for plugin "${plugin.name}":`,
        err,
      );
      return breakdown;
    }
  }
}
