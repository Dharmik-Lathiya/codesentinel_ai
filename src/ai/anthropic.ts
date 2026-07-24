import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Anthropic (Claude) provider. Maps our role-based messages to Anthropic's
 * `user`/`assistant` roles (system is a top-level field).
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: any = null;
  private initializing: Promise<any> | null = null;

  constructor(private readonly secrets: RuntimeSecrets) {
    if (!secrets.anthropic_api_key) {
      throw new ProviderUnavailableError("anthropic", "missing ANTHROPIC_API_KEY");
    }
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    if (!this.initializing) {
      this.initializing = import("@anthropic-ai/sdk").then((mod: any) => {
        const Anthropic = mod.default ?? mod.Anthropic;
        return new Anthropic({ apiKey: this.secrets.anthropic_api_key });
      });
    }
    try {
      this.client = await this.initializing;
    } catch (err) {
      this.initializing = null;
      this.client = null;
      throw err;
    }
    return this.client;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let client: any;
    try {
      client = await this.getClient();
    } catch (err) {
      throw new Error(`Failed to initialize Anthropic client: ${err}`);
    }

    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    let res: any;
    try {
      res = await client.messages.create({
        model: req.model.model,
        system,
        messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      });
    } catch (err) {
      throw new Error(`Anthropic API call failed: ${err}`);
    }

    const text = Array.isArray(res.content)
      ? res.content.map((b: any) => b.text ?? "").join("")
      : String(res.content);
    return {
      content: text,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: res.usage?.input_tokens,
        completionTokens: res.usage?.output_tokens,
      },
    };
  }
}

export function anthropicFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new AnthropicProvider(secrets);
  } catch {
    return null;
  }
}
