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

  constructor(private ctx: PluginContext) {}

  /** Dynamically import and register plugins listed in config. */
  async load(paths: string[]): Promise<void> {
    for (const p of paths) await this.loadOne(p);
  }

  private async loadOne(path: string): Promise<void> {
    const plugin = await this.loadPlugin(path);
    if (!plugin) return;
    try {
      await plugin.init?.(this.ctx);
    } catch (err) {
      this.ctx.logger.warn(`Init failed for plugin "${plugin.name}":`, err);
      return;
    }
    this.plugins.push(plugin);
    this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
  }

  private async loadPlugin(path: string): Promise<CodeSentinelPlugin | null> {
    const mod = await this.importPlugin(path);
    if (!mod) return null;
    const plugin = mod.default;
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

  private async importPlugin(
    path: string,
  ): Promise<{ default?: CodeSentinelPlugin } | null> {
    try {
      return (await import(path)) as { default?: CodeSentinelPlugin };
    } catch (err) {
      this.ctx.logger.warn(`Failed to load plugin "${path}":`, err);
      return null;
    }
  }

  get all(): CodeSentinelPlugin[] {
    return [...this.plugins];
  }

  /** Run all plugins' analyze hooks and merge their findings. */
  async runAnalyze(
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    const results = await Promise.all(
      this.plugins.map((p) => this.analyzeOne(p, files)),
    );
    return results.flat();
  }

  private async analyzeOne(
    p: CodeSentinelPlugin,
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    try {
      return (await p.analyze?.(files)) ?? [];
    } catch (err) {
      this.ctx.logger.warn(`Analyze hook failed for plugin "${p.name}":`, err);
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
      b = await this.scoreOne(p, b, files);
    }
    return b;
  }

  private async scoreOne(
    p: CodeSentinelPlugin,
    b: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): Promise<ScoreBreakdown> {
    try {
      return (await p.score?.(b, files)) ?? b;
    } catch (err) {
      this.ctx.logger.warn(`Score hook failed for plugin "${p.name}":`, err);
      return b;
    }
  }
}
