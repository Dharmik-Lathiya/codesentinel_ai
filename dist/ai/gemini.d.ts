import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/**
 * Google Gemini provider. Uses generateContent with the combined prompt text.
 */
export declare class GeminiProvider implements AIProvider {
    #private;
    private readonly secrets;
    readonly name = "gemini";
    private client;
    private models;
    private initializing;
    constructor(secrets: RuntimeSecrets);
    private getModel;
    complete(req: CompletionRequest): Promise<CompletionResult>;
}
export declare function geminiFactory(secrets: RuntimeSecrets): AIProvider | null;
