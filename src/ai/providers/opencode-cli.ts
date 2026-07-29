import type { AIProvider, CompletionRequest, CompletionResult, ChatMessage } from "../provider.js";
import { ProviderUnavailableError } from "../provider.js";
import type { ModelConfig, CodeSentinelConfig } from "../../config/types.js";
import type { TaskName } from "../index.js";
import type { AIHub } from "../index.js";
import { runReview } from "../../opencode/runner.js";
import { parseOpencodeOutput } from "../../opencode/jsonl-parser.js";

export function createOpencodeProvider(root?: string): AIProvider {
  return {
    name: "opencode-cli",
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const result = await runReview(["."], { cwd: root });
      const lines = result.rawOutput.split("\n").filter((l) => l.trim());
      const parsed = parseOpencodeOutput(lines);
      return {
        content: JSON.stringify(parsed),
        model: req.model.model,
        provider: "opencode-cli",
        usage: { totalTokens: result.rawOutput.length },
      };
    },
  };
}

export interface EngineAI {
  modelForTask(task: TaskName): ModelConfig;
  complete(task: TaskName, messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number; responseFormat?: "json_object" }): Promise<CompletionResult>;
}

export class OpencodeCliAdapter implements EngineAI {
  private provider: AIProvider;
  private fallback: AIHub | null;
  private config: CodeSentinelConfig;

  constructor(config: CodeSentinelConfig, root?: string, fallback?: AIHub) {
    this.config = config;
    this.fallback = fallback ?? null;
    this.provider = createOpencodeProvider(root);
  }

  modelForTask(task: TaskName): ModelConfig {
    return this.config.models[task] ?? this.config.default_model;
  }

  async complete(
    task: TaskName,
    messages: ChatMessage[],
    opts?: { temperature?: number; maxTokens?: number; responseFormat?: "json_object" },
  ): Promise<CompletionResult> {
    try {
      const model: ModelConfig = this.modelForTask(task);
      return await this.provider.complete({ model, messages, ...opts });
    } catch (err) {
      if (this.fallback && (err instanceof ProviderUnavailableError || err instanceof Error)) {
        return this.fallback.complete(task, messages, opts);
      }
      throw err;
    }
  }
}
