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
    const seen = new Set<string>();
    for (const p of paths) {
      if (seen.has(p)) {
        this.ctx.logger.warn(`Skipping duplicate plugin path "${p}".`);
        continue;
      }
      const plugin = await this.loadPlugin(p);
      if (!plugin) continue;
      if (seen.has(plugin.name)) {
        this.ctx.logger.warn(`Skipping duplicate plugin "${plugin.name}".`);
        continue;
      }
      seen.add(p);
      seen.add(plugin.name);
      this.plugins.push(plugin);
      try {
        await plugin.init?.(this.ctx);
      } catch (err) {
        this.ctx.logger.warn(`Failed to init plugin "${p}":`, err);
        continue;
      }
      this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
    }
  }

  private async loadPlugin(path: string): Promise<CodeSentinelPlugin | null> {
    try {
      const mod = (await import(path)) as { default?: CodeSentinelPlugin };
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
      if (plugin.analyze !== undefined && typeof plugin.analyze !== "function") {
        this.ctx.logger.warn(
          `Plugin "${path}" has a non-function "analyze" hook.`,
        );
        return null;
      }
      if (plugin.score !== undefined && typeof plugin.score !== "function") {
        this.ctx.logger.warn(
          `Plugin "${path}" has a non-function "score" hook.`,
        );
        return null;
      }
      return plugin;
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
      this.plugins.map(async (p) => {
        try {
          return (await p.analyze?.(files)) ?? [];
        } catch (err) {
          this.ctx.logger.warn(
            `Analyze hook failed for plugin "${p.name}":`,
            err,
          );
          return [];
        }
      }),
    );
    return results.flat();
  }

  /** Run all plugins' score hooks sequentially. */
  async runScore(
    breakdown: ScoreBreakdown,
    files: { path: string; content: string }[],
  ): Promise<ScoreBreakdown> {
    let b = breakdown;
    for (const p of this.plugins) {
      try {
        b = (await p.score?.(b, files)) ?? b;
      } catch (err) {
        this.ctx.logger.warn(
          `Score hook failed for plugin "${p.name}":`,
          err,
        );
        // keep current breakdown
      }
    }
    return b;
  }
}
