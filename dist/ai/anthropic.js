import { ProviderUnavailableError } from "./provider.js";
const DEFAULT_MAX_TOKENS = 4096;
/**
 * Anthropic (Claude) provider. Maps our role-based messages to Anthropic's
 * `user`/`assistant` roles (system is a top-level field).
 */
export class AnthropicProvider {
    secrets;
    name = "anthropic";
    client = null;
    initializing = null;
    constructor(secrets) {
        this.secrets = secrets;
        if (!secrets.anthropic_api_key) {
            throw new ProviderUnavailableError("anthropic", "missing ANTHROPIC_API_KEY");
        }
    }
    async getClient() {
        if (this.client)
            return this.client;
        if (!this.initializing) {
            this.initializing = import("@anthropic-ai/sdk").then((mod) => {
                const Anthropic = mod.default ?? mod.Anthropic;
                return new Anthropic({ apiKey: this.secrets.anthropic_api_key });
            });
        }
        try {
            this.client = await this.initializing;
        }
        catch (err) {
            // Reset state so future calls can retry initialization
            this.initializing = null;
            this.client = null;
            throw new Error(`[anthropic] Failed to initialize client: ${err.message}`);
        }
        return this.client;
    }
    async complete(req) {
        let client;
        try {
            client = await this.getClient();
        }
        catch (err) {
            throw new Error(`[anthropic] Cannot get client: ${err.message}`);
        }
        const system = req.messages.find((m) => m.role === "system")?.content ?? "";
        const messages = req.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
        }));
        let res;
        try {
            res = await client.messages.create({
                model: req.model.model,
                system,
                messages,
                temperature: req.temperature ?? 0.2,
                max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            });
        }
        catch (err) {
            throw new Error(`[anthropic] API call failed: ${err.message}`);
        }
        const text = Array.isArray(res.content)
            ? res.content.map((b) => b.text ?? "").join("")
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
export function anthropicFactory(secrets) {
    try {
        return new AnthropicProvider(secrets);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=anthropic.js.map