import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

const DEFAULT_MAX_TOKENS = 4096;

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
    this.apiKey = secrets.opencode_api_key || "opencode";
    this.baseUrl = (
      secrets.opencode_base_url || "http://localhost:4096"
    ).replace(/\/v1$/, "").replace(/\/$/, "");
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    logger.info(`OpenCodeProvider.complete: POST ${url} model=${req.model.model}`);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`OpenCodeProvider.complete: NETWORK ERROR — ${msg}`);
      throw new ProviderUnavailableError("opencode", `cannot reach ${this.baseUrl} — ${msg}. Check OPENCODE_BASE_URL or switch provider via --provider.`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const snippet = body.slice(0, 200);
      logger.error(`OpenCodeProvider.complete: HTTP ${res.status} — ${snippet}`);
      throw new Error(`OpenCode API error ${res.status}: ${snippet}`);
    }

    const data = (await res.json()) as any;
    const msg = data?.choices?.[0]?.message;
    let content = msg?.content ?? "";
    if (!content && msg?.reasoning_content) {
      content = msg.reasoning_content;
    }
    if (!content) {
      logger.debug(`OpenCodeProvider: empty content — raw keys=${Object.keys(msg ?? {})} response_keys=${Object.keys(data)}`);
    }
    logger.info(`OpenCodeProvider.complete: SUCCESS — tokens_in=${data?.usage?.prompt_tokens} tokens_out=${data?.usage?.completion_tokens}`);
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
