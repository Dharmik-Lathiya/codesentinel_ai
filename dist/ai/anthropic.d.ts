import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/**
 * Anthropic (Claude) provider. Maps our role-based messages to Anthropic's
 * `user`/`assistant` roles (system is a top-level field).
 */
export declare class AnthropicProvider implements AIProvider {
    private readonly secrets;
    readonly name = "anthropic";
    private client;
    private initializing;
    constructor(secrets: RuntimeSecrets);
    private getClient;
    complete(req: CompletionRequest): Promise<CompletionResult>;
}
export declare function anthropicFactory(secrets: RuntimeSecrets): AIProvider | null;
