import { openaiFactory } from "./openai.js";
import { anthropicFactory } from "./anthropic.js";
import { geminiFactory } from "./gemini.js";
import { opencodeFactory } from "./opencode.js";
import type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
} from "./provider.js";
import type {
  CodeSentinelConfig,
  ModelConfig,
  RuntimeSecrets,
} from "../config/types.js";

export type TaskName = "review" | "fix" | "audit" | "score" | "testgen" | "chat";

/**
 * AIHub wires together provider factories and resolves the correct model for a
 * given task. It caches provider instances and exposes a single `complete`
 * entry point used by the engine.
 */
export class AIHub {
  private providers = new Map<string, AIProvider>();
  private factories: Record<string, (s: RuntimeSecrets) => AIProvider | null> = {
    openai: openaiFactory,
    anthropic: anthropicFactory,
    gemini: geminiFactory,
    opencode: opencodeFactory,
  };

  constructor(
    private readonly config: CodeSentinelConfig,
    private readonly secrets: RuntimeSecrets,
  ) {}

  /** Resolve the model configuration for a task, falling back to default. */
  modelForTask(task: TaskName): ModelConfig {
    return this.config.models[task] ?? this.config.default_model;
  }

  /** Get (or lazily build) the provider for a given model. */
  private providerFor(model: ModelConfig): AIProvider {
    const existing = this.providers.get(model.provider);
    if (existing) return existing;

    const factory = this.factories[model.provider];
    if (!factory) {
      throw new Error(`Unknown provider: ${model.provider}`);
    }
    const provider = factory(this.secrets);
    if (!provider) {
      throw new Error(
        `Provider "${model.provider}" could not be initialized (missing API key or SDK?)`,
      );
    }
    this.providers.set(model.provider, provider);
    return provider;
  }

  /** Run a completion for a task with the resolved model. */
  async complete(
    task: TaskName,
    messages: CompletionRequest["messages"],
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<CompletionResult> {
    const model = this.modelForTask(task);
    const provider = this.providerFor(model);
    return provider.complete({
      model,
      messages,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
  }
}
