import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/**
 * Google Gemini provider. Uses generateContent with the combined prompt text.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: any = null;
  private model: any = null;
  private initializing: Promise<any> | null = null;

  constructor(private readonly secrets: RuntimeSecrets) {
    if (!secrets.gemini_api_key) {
      throw new ProviderUnavailableError("gemini", "missing GEMINI_API_KEY");
    }
  }

  private async getModel(req: CompletionRequest): Promise<any> {
    if (this.model) return this.model;
    if (!this.initializing) {
      this.initializing = import("@google/generative-ai").then((mod: any) => {
        const { GoogleGenerativeAI } = mod;
        const genAI = new GoogleGenerativeAI(this.secrets.gemini_api_key!);
        return genAI.getGenerativeModel({ model: req.model.model });
      });
    }
    try {
      this.model = await this.initializing;
    } catch (err) {
      this.initializing = null;
      throw new ProviderUnavailableError(
        "gemini",
        `failed to initialize model: ${(err as Error).message}`
      );
    }
    return this.model;
  }

  private async #generateContent(model: any, prompt: string, req: CompletionRequest): Promise<any> {
    try {
      return await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        },
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
    return { content: text, model: req.model.model, provider: this.name };
  }
}

export function geminiFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new GeminiProvider(secrets);
  } catch {
    return null;
  }
}
