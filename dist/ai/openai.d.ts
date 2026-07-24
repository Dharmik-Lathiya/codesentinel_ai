import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/**
 * OpenAI-backed provider. Uses the chat completions API. The SDK is loaded
 * lazily (on first call) so the package works without the optional dependency
 * installed and without blocking startup.
 */
export declare class OpenAIProvider implements AIProvider {
    private readonly secrets;
    readonly name = "openai";
    private client;
    private initializing;
    constructor(secrets: RuntimeSecrets);
    /** Lazily import and construct the optional SDK exactly once. */
    private getClient;
    complete(req: CompletionRequest): Promise<CompletionResult>;
}
export declare function openaiFactory(secrets: RuntimeSecrets): AIProvider | null;
