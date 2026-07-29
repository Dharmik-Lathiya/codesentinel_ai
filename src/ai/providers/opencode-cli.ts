import type { AIProvider, CompletionRequest, CompletionResult, ChatMessage } from "../provider.js";
import { ProviderUnavailableError } from "../provider.js";
import type { ModelConfig } from "../../config/types.js";
import type { TaskName } from "../index.js";
import { runReview } from "../../opencode/runner.js";
import { parseOpencodeOutput } from "../../opencode/jsonl-parser.js";

export function createOpencodeProvider(root?: string): AIProvider {
  return {
    name: "opencode-cli",
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      try {
        const result = await runReview(["."], { cwd: root });
        const lines = result.rawOutput.split("\n").filter((l) => l.trim());
        const parsed = parseOpencodeOutput(lines);
        return {
          content: JSON.stringify(parsed),
          model: req.model.model,
          provider: "opencode-cli",
          usage: { totalTokens: result.rawOutput.length },
        };
      } catch (err) {
        throw new ProviderUnavailableError(
          "opencode-cli",
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  };
}

export class OpencodeCliAdapter {
  private provider: AIProvider;

  constructor(root?: string) {
    this.provider = createOpencodeProvider(root);
  }

  modelForTask(_task: TaskName): ModelConfig {
    return { provider: "opencode-cli", model: "cli" };
  }

  async complete(
    _task: TaskName,
    messages: ChatMessage[],
    opts?: { temperature?: number; maxTokens?: number; responseFormat?: "json_object" },
  ): Promise<CompletionResult> {
    const model: ModelConfig = { provider: "opencode-cli", model: "cli" };
    return this.provider.complete({ model, messages, ...opts });
  }
}
