import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 */
export declare class OpenCodeProvider implements AIProvider {
    readonly name = "opencode";
    private readonly baseUrl;
    private readonly apiKey;
    private readonly keyWasSet;
    constructor(secrets: RuntimeSecrets);
    complete(req: CompletionRequest): Promise<CompletionResult>;
    private completeViaCli;
}
export declare function opencodeFactory(secrets: RuntimeSecrets): AIProvider | null;
