import { ProviderUnavailableError } from "./provider.js";
/**
 * Google Gemini provider. Uses generateContent with the combined prompt text.
 */
export class GeminiProvider {
    secrets;
    name = "gemini";
    client = null;
    models = new Map();
    initializing = null;
    constructor(secrets) {
        this.secrets = secrets;
        if (!secrets.gemini_api_key) {
            throw new ProviderUnavailableError("gemini", "missing GEMINI_API_KEY");
        }
    }
    async getModel(req) {
        const modelName = req.model.model;
        const existing = this.models.get(modelName);
        if (existing)
            return existing;
        if (!this.initializing) {
            this.initializing = (async () => {
                const mod = await import("@google/generative-ai");
                const { GoogleGenerativeAI } = mod;
                const genAI = new GoogleGenerativeAI(this.secrets.gemini_api_key);
                return genAI.getGenerativeModel({ model: modelName });
            })();
        }
        try {
            const model = await this.initializing;
            this.models.set(modelName, model);
            return model;
        }
        catch (err) {
            this.initializing = null;
            throw new ProviderUnavailableError("gemini", `failed to initialize model: ${err.message}`);
        }
    }
    async #generateContent(model, prompt, req) {
        try {
            const tokens = req.model.maxTokens ?? req.maxTokens;
            const generationConfig = {
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
export function geminiFactory(secrets) {
    try {
        return new GeminiProvider(secrets);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=gemini.js.map