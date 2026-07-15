import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";

/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 */
export class OpenCodeProvider implements AIProvider {
  readonly name = "opencode";
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(secrets: RuntimeSecrets) {
    if (!secrets.opencode_api_key) {
      throw new ProviderUnavailableError("opencode", "missing OPENCODE_API_KEY");
    }
    this.apiKey = secrets.opencode_api_key;
    this.baseUrl = (
      secrets.opencode_base_url || "http://localhost:4096"
    ).replace(/\/$/, "");
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenCode API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content ?? "";
    return {
      content,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
      },
    };
  }
}

export function opencodeFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new OpenCodeProvider(secrets);
  } catch {
    return null;
  }
}
