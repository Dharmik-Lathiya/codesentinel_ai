import type { CompletionRequest, CompletionResult, AIProvider, ChatMessage } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
/** Default CLI timeout in minutes (mirrors opencode-ai-reviewer's runOpenCode default). */
export declare const DEFAULT_CLI_TIMEOUT_MINUTES = 20;
/**
 * Serialise ChatMessages into a single prompt string for `opencode run`.
 * The CLI takes the prompt as a positional argument (like opencode-ai-reviewer),
 * not as a JSON payload on stdin.
 */
export declare function messagesToPrompt(messages: ChatMessage[]): string;
/**
 * Free-model candidates tried in order when the requested model fails at the
 * account/model level ("No payment method", unsupported model, 401). Zen promo
 * windows rotate — a pinned "-free" model can start billing overnight — so the
 * provider moves down this list instead of failing every call.
 * Verified serving via CLI on 2026-08-25; keep ordered by context size (desc).
 */
export declare const OPENCODE_MODEL_FALLBACKS: string[];
/** True when an error indicates the MODEL/ACCOUNT can't serve the request at
 * all (as opposed to a transient server hiccup or a generic CLI failure). */
export declare function isModelLevelFailure(err: unknown): boolean;
/**
 * Build the `opencode run` argument list.
 * `--auto` auto-approves any permission that is not explicitly "deny" — the
 * documented CI mechanism (opencode-ai-reviewer uses the same flag).
 */
export declare function buildCliArgs(model: string, prompt: string): string[];
/** CLI timeout in ms — OPENCODE_CLI_TIMEOUT_MINUTES env override, default 20 minutes. */
export declare function cliTimeoutMs(): number;
/**
 * CI-safe opencode config injected via OPENCODE_CONFIG_CONTENT (highest-precedence
 * env var, overrides even a project-level opencode.json):
 * - "permission": "allow" — enables every tool without prompting
 * - autoupdate/share disabled, no MCP or plugins (nothing to download in CI)
 */
export declare function buildCIConfig(): string;
/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 * When the HTTP API is unavailable (or CLI mode is forced), falls back to the
 * `opencode run` CLI using the same invocation strategy as opencode-ai-reviewer:
 * --auto, generous configurable timeout, process-group SIGTERM -> SIGKILL.
 */
export declare class OpenCodeProvider implements AIProvider {
    #private;
    readonly name = "opencode";
    private readonly baseUrl;
    private readonly apiKey;
    private readonly keyWasSet;
    private readonly useCli;
    private readonly cliBinary;
    /** Working directory for CLI runs (repo root), so opencode can read files. */
    private readonly root;
    /** Serialise CLI invocations so parallel batch calls don't clobber each other's DB. */
    private static cliLock;
    constructor(secrets: RuntimeSecrets, root?: string);
    complete(req: CompletionRequest): Promise<CompletionResult>;
    private parseSuccess;
    /** Resolve the opencode binary, checking PATH, npm prefix, and via shell. */
    private resolveBinary;
    private completeViaCli;
    /** Build a sandboxed environment for the CLI subprocess (whitelist + CI config). */
    private cliEnv;
    /**
     * Execute the opencode CLI with a given prompt.
     * Spawns detached so the whole process group can be killed on timeout:
     * SIGTERM, then SIGKILL after a 5s grace period (same as opencode-ai-reviewer).
     */
    private runCli;
    /** Parse `opencode run --format json` JSONL output into text + token usage. */
    private static parseCliOutput;
}
export declare function opencodeFactory(secrets: RuntimeSecrets, root?: string): AIProvider | null;
