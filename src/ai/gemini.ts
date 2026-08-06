import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";

/**
 * Google Gemini provider. Uses generateContent with the combined prompt text.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: any = null;
  private models = new Map<string, any>();
  private initializing: Promise<any> | null = null;

  constructor(private readonly secrets: RuntimeSecrets) {
    if (!secrets.gemini_api_key) {
      throw new ProviderUnavailableError("gemini", "missing GEMINI_API_KEY");
    }
  }

  private async getModel(req: CompletionRequest): Promise<any> {
    const modelName = req.model.model;
    const existing = this.models.get(modelName);
    if (existing) return existing;
    if (!this.initializing) {
      this.initializing = (async () => {
        const mod: any = await import("@google/generative-ai");
        const { GoogleGenerativeAI } = mod;
        const genAI = new GoogleGenerativeAI(this.secrets.gemini_api_key!);
        return genAI.getGenerativeModel({ model: modelName });
      })();
    }
    try {
      const model = await this.initializing;
      this.models.set(modelName, model);
      return model;
    } catch (err) {
      this.initializing = null;
      throw new ProviderUnavailableError(
        "gemini",
        `failed to initialize model: ${(err as Error).message}`
      );
    }
  }

  async #generateContent(model: any, prompt: string, req: CompletionRequest): Promise<any> {
    try {
      const tokens = req.model.maxTokens ?? req.maxTokens;
      const generationConfig: Record<string, unknown> = {
        temperature: req.temperature ?? 0.2,
        ...(tokens ? { maxOutputTokens: tokens } : {}),
      };
      if (req.responseFormat === "json_object") {
        generationConfig.responseMimeType = "application/json";
      }
      return await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      });
    } catch (err) {
      throw new Error(
        `Gemini generateContent failed: ${(err as Error).message}`
      );
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let model: any;
    try {
      model = await this.getModel(req);
    } catch (err) {
      throw new ProviderUnavailableError(
        "gemini",
        `failed to get model: ${(err as Error).message}`
      );
    }

    const prompt = req.messages
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join("\n\n");
    const res = await this.#generateContent(model, prompt, req);
    const text = res.response?.text?.() ?? "";
    const usage = res.response?.usageMetadata;
    return {
      content: text,
      model: req.model.model,
      provider: this.name,
      usage: usage ? {
        promptTokens: usage.promptTokenCount,
        completionTokens: usage.candidatesTokenCount,
        totalTokens: usage.totalTokenCount,
      } : undefined,
    };
  }
}

export function geminiFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new GeminiProvider(secrets);
  } catch {
    return null;
  }
}
