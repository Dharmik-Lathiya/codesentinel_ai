import { ProviderUnavailableError } from "./provider.js";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/**
 * Google Gemini provider. Uses generateContent with the combined prompt text.
 */
export class GeminiProvider {
    secrets;
    name = "gemini";
    client = null;
    model = null;
    initializing = null;
    constructor(secrets) {
        this.secrets = secrets;
        if (!secrets.gemini_api_key) {
            throw new ProviderUnavailableError("gemini", "missing GEMINI_API_KEY");
        }
    }
    async getModel(req) {
        if (this.model)
            return this.model;
        if (!this.initializing) {
            this.initializing = import("@google/generative-ai").then((mod) => {
                const { GoogleGenerativeAI } = mod;
                const genAI = new GoogleGenerativeAI(this.secrets.gemini_api_key);
                return genAI.getGenerativeModel({ model: req.model.model });
            });
        }
        try {
            this.model = await this.initializing;
        }
        catch (err) {
            this.initializing = null;
            throw new ProviderUnavailableError("gemini", `failed to initialize model: ${err.message}`);
        }
        return this.model;
    }
    async #generateContent(model, prompt, req) {
        try {
            return await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: req.temperature ?? 0.2,
                    maxOutputTokens: req.model.maxTokens ?? req.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
                },
            });
        }
        catch (err) {
            throw new Error(`Gemini generateContent failed: ${err.message}`);
        }
    }
    async complete(req) {
        let model;
        try {
            model = await this.getModel(req);
        }
        catch (err) {
            throw new ProviderUnavailableError("gemini", `failed to get model: ${err.message}`);
        }
        const prompt = req.messages
            .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
            .join("\n\n");
        const res = await this.#generateContent(model, prompt, req);
        const text = res.response?.text?.() ?? "";
        return { content: text, model: req.model.model, provider: this.name };
    }
}
export function geminiFactory(secrets) {
    try {
        return new GeminiProvider(secrets);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=gemini.js.map