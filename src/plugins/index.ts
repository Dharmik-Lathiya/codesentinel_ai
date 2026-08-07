import path from "node:path";
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
  /** Dynamically import and register plugins listed in config. */
  async load(paths: string[]): Promise<void> {
    for (const p of paths) {
      if (!this.isSafePluginPath(p)) {
        this.ctx.logger.warn(
          `Plugin "${p}" rejected: absolute paths, http(s):// URLs, and node:/file: schemes are not allowed.`,
        );
        continue;
      }
      const result = await this.loadPlugin(p);
      if (!result.ok) {
        this.ctx.logger.warn(result.reason);
        continue;
      }
      this.plugins.push(result.plugin);
      try {
        await result.plugin.init?.(this.ctx);
        this.ctx.logger.info(`Loaded plugin: ${result.plugin.name}`);
      } catch (err) {
        this.ctx.logger.warn(
          `Failed to init plugin "${result.plugin.name}":`,
          err,
        );
      }
    }
  }

  /**
   * Reject absolute paths, http(s) URLs, and node:/file: schemes. Relative
   * paths are resolved against the project root and must remain inside it.
   */
  private isSafePluginPath(spec: string): boolean {
    if (
      spec.startsWith("/") ||
      /^[a-zA-Z]:[\\/]/.test(spec) ||
      /^https?:\/\//i.test(spec) ||
      /^(node|file):/i.test(spec)
    ) {
      return false;
    }
    if (spec.startsWith(".")) {
      const root = `${path.resolve(process.cwd())}${path.sep}`;
      return path.resolve(process.cwd(), spec).startsWith(root);
    }
    return true;
  }

  private async loadPlugin(
    path: string,
  ): Promise<
    | { ok: true; plugin: CodeSentinelPlugin }
    | { ok: false; reason: string }
  > {
    let mod: { default?: CodeSentinelPlugin };
    try {
      mod = (await import(path)) as { default?: CodeSentinelPlugin };
    } catch (err) {
      return { ok: false, reason: `Failed to load plugin "${path}": ${String(err)}` };
    }
    const plugin = mod.default;
    if (!plugin) {
      return {
        ok: false,
        reason: `Plugin "${path}" does not export a default CodeSentinelPlugin.`,
      };
    }
    if (typeof plugin.name !== "string" || plugin.name.length === 0) {
      return {
        ok: false,
        reason: `Plugin "${path}" is missing a valid "name" property.`,
      };
    }
    return { ok: true, plugin };
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
