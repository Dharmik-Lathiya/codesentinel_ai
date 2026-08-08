import { resolve } from "node:path";
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
 * Loads plugin modules listed in config.plugins and dispatches lifecycle hooks.
 * Modules must default-export a CodeSentinelPlugin.
 *
 * Security: config.plugins is a trust boundary. Paths are resolved against
 * the project root; config must be repo-owned and root-controlled.
 */
export class PluginManager {
  private plugins: CodeSentinelPlugin[] = [];

  constructor(
    private ctx: PluginContext,
    private root = process.cwd(),
  ) {}

  /** Dynamically load and register plugins in parallel, preserving order. */
  async load(paths: string[]): Promise<void> {
    const entries = await Promise.all(
      paths.map(async (p) => {
        try {
          return { p, plugin: await this.loadPlugin(p) };
        } catch (err) {
          this.ctx.logger.warn(`Failed to load plugin "${p}":`, err);
          return { p, plugin: null };
        }
      }),
    );
    for (const { p, plugin } of entries) {
      if (!plugin) continue;
      try {
        this.plugins.push(plugin);
        await plugin.init?.(this.ctx);
        this.ctx.logger.info(`Loaded plugin: ${plugin.name}`);
      } catch (err) {
        this.ctx.logger.warn(`Failed to load plugin "${p}":`, err);
      }
    }
  }

  private async loadPlugin(path: string): Promise<CodeSentinelPlugin | null> {
    // Resolve relative/absolute specs against the project root so untrusted
    // config cannot point at files outside the repo. Bare module specifiers
    // (e.g. npm packages) are left untouched.
    const spec =
      path.startsWith("/") || path.startsWith(".")
        ? resolve(this.root, path)
        : path;
    try {
      const mod = (await import(spec)) as { default?: CodeSentinelPlugin };
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
      for (const hook of ["init", "analyze", "score"] as const) {
        if (plugin[hook] != null && typeof plugin[hook] !== "function") {
          this.ctx.logger.warn(
            `Plugin "${path}" has a non-function "${hook}" hook; skipping it.`,
          );
          return null;
        }
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
    try {
      const results = await Promise.all(
        this.plugins.map(async (p) => {
          try {
            const raw = (await p.analyze?.(files)) ?? [];
            if (!Array.isArray(raw)) {
              this.ctx.logger.warn(
                `Analyze hook for plugin "${p.name}" did not return an array; ignoring its findings.`,
              );
              return [];
            }
            return raw;
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
    } catch (err) {
      this.ctx.logger.warn(`Analyze phase failed:`, err);
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
      try {
        const next = (await p.score?.(b, files)) ?? b;
        if (
          next &&
          typeof next === "object" &&
          typeof (next as ScoreBreakdown).readability === "number" &&
          typeof (next as ScoreBreakdown).maintainability === "number" &&
          typeof (next as ScoreBreakdown).security === "number" &&
          typeof (next as ScoreBreakdown).test_coverage === "number" &&
          typeof (next as ScoreBreakdown).overall === "number"
        ) {
          b = next;
        } else {
          this.ctx.logger.warn(
            `Score hook for plugin "${p.name}" returned an invalid breakdown; keeping current score.`,
          );
        }
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
