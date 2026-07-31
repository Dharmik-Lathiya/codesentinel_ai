import { openaiFactory } from "./openai.js";
import { anthropicFactory } from "./anthropic.js";
import { geminiFactory } from "./gemini.js";
import { opencodeFactory } from "./opencode.js";
import { ProviderUnavailableError } from "./provider.js";
import { retry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
/**
 * AIHub wires together provider factories and resolves the correct model for a
 * given task. It caches provider instances and exposes a single `complete`
 * entry point used by the engine. Transient API errors (rate limits, 5xx) are
 * retried automatically with exponential backoff.
 */
export class AIHub {
    config;
    secrets;
    root;
    providers = new Map();
    factories = {
        openai: openaiFactory,
        anthropic: anthropicFactory,
        gemini: geminiFactory,
        opencode: opencodeFactory,
    };
    constructor(config, secrets, 
    /** Repository root — used as the CLI working directory (e.g. opencode run). */
    root) {
        this.config = config;
        this.secrets = secrets;
        this.root = root;
    }
    /** Resolve the model configuration for a task, falling back to default. */
    modelForTask(task) {
        return this.config.models[task] ?? this.config.default_model;
    }
    /** Get (or lazily build) the provider for a given model. */
    providerFor(model) {
        const existing = this.providers.get(model.provider);
        if (existing)
            return existing;
        const factory = this.factories[model.provider];
        if (!factory) {
            throw new Error(`Unknown provider: "${model.provider}". Supported providers: openai, anthropic, gemini, opencode.`);
        }
        const provider = factory(this.secrets, this.root);
        if (!provider) {
            const keyEnvMap = {
                openai: "OPENAI_API_KEY",
                anthropic: "ANTHROPIC_API_KEY",
                gemini: "GEMINI_API_KEY",
                opencode: "OPENCODE_API_KEY",
            };
            const keyName = keyEnvMap[model.provider] ?? `${model.provider.toUpperCase()}_API_KEY`;
            throw new ProviderUnavailableError(model.provider, `Could not initialize. Ensure ${keyName} is set. See README for configuration.`);
        }
        this.providers.set(model.provider, provider);
        return provider;
    }
    /** Run a completion for a task with the resolved model. Retries on transient errors. */
    async complete(task, messages, opts = {}) {
        const model = this.modelForTask(task);
        const provider = this.providerFor(model);
        const maxTokens = opts.maxTokens ?? model.maxTokens;
        logger.info(`AIHub.complete: task=${task} provider=${provider.name} model=${model.model} maxTokens=${maxTokens}`);
        return retry(() => provider.complete({
            model,
            messages,
            temperature: opts.temperature,
            maxTokens,
            responseFormat: opts.responseFormat,
        }));
    }
}
//# sourceMappingURL=index.js.map