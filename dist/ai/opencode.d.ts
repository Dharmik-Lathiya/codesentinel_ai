import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 */
export declare class OpenCodeProvider implements AIProvider {
    #private;
    readonly name = "opencode";
    private readonly baseUrl;
    private readonly apiKey;
    private readonly keyWasSet;
    private readonly useCli;
    private readonly cliBinary;
    /** Serialise CLI invocations so parallel batch calls don't clobber each other's DB. */
    private static cliLock;
    constructor(secrets: RuntimeSecrets);
    complete(req: CompletionRequest): Promise<CompletionResult>;
    private parseSuccess;
    /** Resolve the opencode binary, checking PATH, npm prefix, and via shell. */
    private resolveBinary;
    private completeViaCli;
}
export declare function opencodeFactory(secrets: RuntimeSecrets): AIProvider | null;
