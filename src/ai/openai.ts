import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";

/**
 * OpenAI-backed provider. Uses the chat completions API. The SDK is loaded
 * lazily (on first call) so the package works without the optional dependency
 * installed and without blocking startup.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: any = null;
  private initializing: Promise<any> | null = null;

  constructor(private readonly secrets: RuntimeSecrets) {
    if (!secrets.openai_api_key) {
      throw new ProviderUnavailableError("openai", "missing OPENAI_API_KEY");
    }
  }

  /** Lazily import and construct the optional SDK exactly once. */
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.initializing) {
      this.initializing = import("openai").then((mod: any) => {
        const OpenAI = mod.default ?? mod.OpenAI;
        return new OpenAI({ apiKey: this.secrets.openai_api_key });
      });
    }
    this.client = await this.initializing;
    return this.client;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const client = await this.getClient();
    const res = await client.chat.completions.create({
      model: req.model.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
    });
    const message = res.choices?.[0]?.message?.content ?? "";
    return {
      content: message,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: res.usage?.prompt_tokens,
        completionTokens: res.usage?.completion_tokens,
      },
    };
  }
}

export function openaiFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new OpenAIProvider(secrets);
  } catch {
    return null;
  }
}
