import type { ModelConfig, RuntimeSecrets } from "../config/types.js";
/** A single chat message sent to a provider. */
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
/** Normalized request options shared across providers. */
export interface CompletionRequest {
    model: ModelConfig;
    messages: ChatMessage[];
    /** Lower temperature for deterministic analysis tasks. */
    temperature?: number;
    maxTokens?: number;
}
/** Normalized completion result. */
export interface CompletionResult {
    content: string;
    model: string;
    provider: string;
    /** Token usage if reported by the provider. */
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
    };
}
/**
 * AIProvider is the common interface every model backend implements. The engine
 * depends only on this abstraction, so adding a new provider is a matter of
 * implementing `complete` and registering it in the factory.
 */
export interface AIProvider {
    readonly name: string;
    complete(req: CompletionRequest): Promise<CompletionResult>;
}
/** Thrown when a provider cannot be initialized (missing key, etc.). */
export declare class ProviderUnavailableError extends Error {
    constructor(provider: string, reason: string);
}
export declare function extractJson<T = unknown>(text: string): T | null;
export type ProviderFactory = (secrets: RuntimeSecrets) => AIProvider | null;
