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
    logger: {
        info: (...a: unknown[]) => void;
        warn: (...a: unknown[]) => void;
    };
}
export interface CodeSentinelPlugin {
    name: string;
    /** Called once at engine startup. */
    init?(ctx: PluginContext): void | Promise<void>;
    /** Add findings based on the analyzed files. */
    analyze?(files: {
        path: string;
        content: string;
    }[]): Finding[] | Promise<Finding[]>;
    /** Adjust the final score breakdown. */
    score?(breakdown: ScoreBreakdown, files: {
        path: string;
        content: string;
    }[]): ScoreBreakdown | Promise<ScoreBreakdown>;
}
/**
 * PluginManager loads plugin modules (from config.plugins) and dispatches
 * lifecycle hooks. Modules must default-export a CodeSentinelPlugin.
 */
export declare class PluginManager {
    private ctx;
    private plugins;
    constructor(ctx: PluginContext);
    /** Dynamically import and register plugins listed in config. */
    load(paths: string[]): Promise<void>;
    private loadPlugin;
    get all(): CodeSentinelPlugin[];
    /** Run all plugins' analyze hooks and merge their findings. */
    runAnalyze(files: {
        path: string;
        content: string;
    }[]): Promise<Finding[]>;
    /** Run all plugins' score hooks sequentially. */
    runScore(breakdown: ScoreBreakdown, files: {
        path: string;
        content: string;
    }[]): Promise<ScoreBreakdown>;
}
