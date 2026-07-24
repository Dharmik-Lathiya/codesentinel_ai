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
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
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
    for (const p of paths) {
      try {
        const mod = (await import(p)) as { default?: CodeSentinelPlugin };
        const plugin = mod.default;
        if (!this.isValidPlugin(plugin, p)) continue;
        this.plugins.push(plugin);
        await plugin.init?.(this.ctx);
        this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
      } catch (err) {
        this.ctx.logger.warn(`Failed to load plugin "${p}":`, err);
      }
    }
  }

  private isValidPlugin(
    plugin: CodeSentinelPlugin | undefined,
    path: string,
  ): boolean {
    if (!plugin) {
      this.ctx.logger.warn(
        `Plugin "${path}" does not export a default CodeSentinelPlugin.`,
      );
      return false;
    }
    if (typeof plugin.name !== "string" || plugin.name.length === 0) {
      this.ctx.logger.warn(
        `Plugin "${path}" is missing a valid "name" property.`,
      );
      return false;
    }
    return true;
  }

  get all(): CodeSentinelPlugin[] {
    return this.plugins;
  }

  /** Run all plugins' analyze hooks and merge their findings. */
  async runAnalyze(
    files: { path: string; content: string }[],
  ): Promise<Finding[]> {
    const results = await Promise.all(
      this.plugins.map(async (p) => {
        try {
          return (await p.analyze?.(files)) ?? [];
        } catch (e) {
          this.ctx.logger.warn(
            `Plugin "${p.name}" analyze threw: ${e}`,
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
      } catch (e) {
        this.ctx.logger.warn(
          `Plugin "${p.name}" score threw: ${e}`,
        );
      }
    }
    return b;
  }
}
