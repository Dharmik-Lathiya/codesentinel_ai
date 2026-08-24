import type { CompletionRequest, CompletionResult } from "./provider.js";
import type { CodeSentinelConfig, ModelConfig, RuntimeSecrets } from "../config/types.js";
export type TaskName = "review" | "fix" | "audit" | "score" | "testgen" | "chat" | "describe" | "plan";
/**
 * AIHub wires together provider factories and resolves the correct model for a
 * given task. It caches provider instances and exposes a single `complete`
 * entry point used by the engine. Transient API errors (rate limits, 5xx) are
 * retried automatically with exponential backoff.
 */
export declare class AIHub {
    private readonly config;
    private readonly secrets;
    /** Repository root — used as the CLI working directory (e.g. opencode run). */
    private readonly root?;
    private providers;
    private factories;
    constructor(config: CodeSentinelConfig, secrets: RuntimeSecrets, 
    /** Repository root — used as the CLI working directory (e.g. opencode run). */
    root?: string | undefined);
    /** Resolve the model configuration for a task, falling back to default. */
    modelForTask(task: TaskName): ModelConfig;
    /** Get (or lazily build) the provider for a given model. */
    private providerFor;
    /** Run a completion for a task with the resolved model. Retries on transient errors. */
    complete(task: TaskName, messages: CompletionRequest["messages"], opts?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: "json_object";
    }): Promise<CompletionResult>;
}
