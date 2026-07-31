import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CompletionRequest, CompletionResult, AIProvider, ChatMessage } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";

/** Default CLI timeout in minutes (mirrors opencode-ai-reviewer's runOpenCode default). */
export const DEFAULT_CLI_TIMEOUT_MINUTES = 20;
/** Cap retained output to prevent memory exhaustion on verbose or stuck runs. */
const MAX_CAPTURED_BYTES = 50 * 1024;
/** Grace period between SIGTERM and SIGKILL when killing a hung CLI process. */
const FORCE_KILL_GRACE_MS = 5_000;

/**
 * Serialise ChatMessages into a single prompt string for `opencode run`.
 * The CLI takes the prompt as a positional argument (like opencode-ai-reviewer),
 * not as a JSON payload on stdin.
 */
export function messagesToPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => (m.role === "system" ? `[system]\n${m.content}` : `[user]\n${m.content}`))
    .join("\n\n");
}

/**
 * Build the `opencode run` argument list.
 * `--auto` auto-approves any permission that is not explicitly "deny" — the
 * documented CI mechanism (opencode-ai-reviewer uses the same flag).
 */
export function buildCliArgs(model: string, prompt: string): string[] {
  return ["run", "--auto", "--format", "json", "--model", model, prompt];
}

/** CLI timeout in ms — OPENCODE_CLI_TIMEOUT_MINUTES env override, default 20 minutes. */
export function cliTimeoutMs(): number {
  const minutes = Number(process.env.OPENCODE_CLI_TIMEOUT_MINUTES);
  const effective = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CLI_TIMEOUT_MINUTES;
  return effective * 60_000;
}

/**
 * CI-safe opencode config injected via OPENCODE_CONFIG_CONTENT (highest-precedence
 * env var, overrides even a project-level opencode.json):
 * - "permission": "allow" — enables every tool without prompting
 * - autoupdate/share disabled, no MCP or plugins (nothing to download in CI)
 */
export function buildCIConfig(): string {
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    permission: "allow",
    autoupdate: false,
    share: "disabled",
    mcp: {},
    plugin: [],
  });
}

/** Env keys forwarded to the CLI subprocess (sandboxed, mirrors the reference runner). */
const WHITELISTED_ENV_KEYS = [
  "PATH",
  "HOME",
  "CI",
  "GITHUB_ACTIONS",
  "GITHUB_ACTOR",
  "GITHUB_REPOSITORY",
  "GITHUB_REPOSITORY_OWNER",
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_BASE_REF",
  "GITHUB_HEAD_REF",
  "GITHUB_WORKSPACE",
  "GITHUB_ACTION",
  "GITHUB_EVENT_NAME",
  "GITHUB_EVENT_PATH",
  "GITHUB_OUTPUT",
  "GITHUB_STEP_SUMMARY",
  "GITHUB_ENV",
  "GITHUB_PATH",
  "RUNNER_OS",
  "RUNNER_ARCH",
  "RUNNER_TEMP",
  "RUNNER_TOOL_CACHE",
  "NODE_PATH",
  "DATABASE_URL",
  "GIT_ASKPASS",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "OPENCODE_CREDENTIAL_TOKEN",
  "OPENCODE_API_KEY",
  "OPENCODE_BASE_URL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
];

/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 * When the HTTP API is unavailable (or CLI mode is forced), falls back to the
 * `opencode run` CLI using the same invocation strategy as opencode-ai-reviewer:
 * --auto, generous configurable timeout, process-group SIGTERM -> SIGKILL.
 */
export class OpenCodeProvider implements AIProvider {
  readonly name = "opencode";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly keyWasSet: boolean;
  private readonly useCli: boolean;
  private readonly cliBinary: string;
  /** Working directory for CLI runs (repo root), so opencode can read files. */
  private readonly root: string;
  /** Serialise CLI invocations so parallel batch calls don't clobber each other's DB. */
  private static cliLock: Promise<void> = Promise.resolve();

  constructor(secrets: RuntimeSecrets, root?: string) {
    this.root = root ?? process.cwd();
    this.keyWasSet = !!secrets.opencode_api_key;
    this.apiKey = secrets.opencode_api_key || "opencode";
    this.useCli = secrets.use_opencode_cli === "true";
    this.baseUrl = (
      secrets.opencode_base_url || "http://localhost:4096"
    ).replace(/\/v1$/, "").replace(/\/$/, "");
    // Resolve CLI binary path once at startup (avoid race conditions from parallel installs)
    this.cliBinary = this.useCli ? this.resolveBinary() : "";
    if (this.useCli) {
      if (this.cliBinary) {
        logger.info(`OpenCodeProvider: using CLI binary at ${this.cliBinary}`);
      } else {
        logger.info(`OpenCodeProvider: CLI binary not found — auto-installing via npm...`);
        try {
          execSync("npm install -g opencode-ai", { encoding: "utf8", timeout: 120_000 });
          this.cliBinary = this.resolveBinary();
        } catch { /* ignore install failure, will fall back */ }
        if (this.cliBinary) {
          logger.info(`OpenCodeProvider: installed CLI binary at ${this.cliBinary}`);
        } else {
          logger.info(`OpenCodeProvider: CLI binary not available — will try npx`);
        }
      }
    } else if (!this.keyWasSet) {
      logger.info(`OpenCodeProvider: no API key set — trying free tier first, CLI fallback if that fails`);
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (this.useCli) return this.completeViaCli(req);
    const url = `${this.baseUrl}/v1/chat/completions`;
    logger.info(`OpenCodeProvider.complete: POST ${url} model=${req.model.model}`);
    const tokens = req.model.maxTokens ?? req.maxTokens;
    const body = JSON.stringify({
      model: req.model.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      ...(tokens ? { max_tokens: tokens } : {}),
      ...(req.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
    });

    const doFetch = (auth?: string): Promise<Response> => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth) headers.Authorization = auth;
      return fetch(url, { method: "POST", headers, body });
    };

    // 1. Try without auth (free tier)
    let res: Response;
    try {
      res = await doFetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`OpenCodeProvider.complete: NETWORK ERROR — ${msg}`);
      throw new ProviderUnavailableError("opencode", `cannot reach ${this.baseUrl} — ${msg}. Check OPENCODE_BASE_URL or switch provider via --provider.`);
    }

    if (res.ok) return this.parseSuccess(res, req);

    // 2. Handle errors
    if (res.status === 401 && this.keyWasSet) {
      logger.warn(`OpenCodeProvider: 401 on free tier, retrying with API key`);
      try {
        res = await doFetch(`Bearer ${this.apiKey}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`OpenCodeProvider.complete: NETWORK ERROR (retry) — ${msg}`);
        throw new ProviderUnavailableError("opencode", `cannot reach ${this.baseUrl} — ${msg}.`);
      }
      if (res.ok) return this.parseSuccess(res, req);
      const body = await res.text().catch(() => "");
      const snippet = body.slice(0, 200);
      logger.error(`OpenCodeProvider.complete: HTTP ${res.status} (with key) — ${snippet}`);
      throw new Error(`OpenCode API error ${res.status}: ${snippet} — OPENCODE_API_KEY was sent but rejected. Check that it is valid, not expired, and has no extra whitespace. (baseUrl=${this.baseUrl})`);
    }

    if (res.status === 401) {
      logger.warn(`OpenCodeProvider: 401 with no API key, falling back to CLI`);
      return this.completeViaCli(req);
    }

    const snippet = await res.text().catch(() => "").then((b: string) => b.slice(0, 200));
    logger.error(`OpenCodeProvider.complete: HTTP ${res.status} — ${snippet}`);
    throw new Error(`OpenCode API error ${res.status}: ${snippet}`);
  }

  private async parseSuccess(res: Response, req: CompletionRequest): Promise<CompletionResult> {
    const data = (await res.json()) as any;
    const msg = data?.choices?.[0]?.message;
    let content = msg?.content ?? "";
    if (!content && msg?.reasoning_content) {
      content = msg.reasoning_content;
    }
    if (!content) {
      logger.debug(`OpenCodeProvider: empty content — raw keys=${Object.keys(msg ?? {})} response_keys=${Object.keys(data)}`);
    }
    logger.info(`OpenCodeProvider.complete: SUCCESS — tokens_in=${data?.usage?.prompt_tokens} tokens_out=${data?.usage?.completion_tokens}`);
    return {
      content,
      model: req.model.model,
      provider: this.name,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
      },
    };
  }

  /** Resolve the opencode binary, checking PATH, npm prefix, and via shell. */
  private resolveBinary(): string {
    // Check process PATH directly
    const dirInPath = process.env.PATH?.split(":").find((d) => existsSync(join(d, "opencode")));
    if (dirInPath) return join(dirInPath, "opencode");
    // Resolve via shell (handles GITHUB_PATH updates from earlier workflow steps)
    try {
      const resolved = execSync("which opencode 2>/dev/null || command -v opencode 2>/dev/null", {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      if (resolved && existsSync(resolved)) return resolved;
    } catch { /* not found via shell */ }
    // Check npm global prefix
    const npmPrefix = process.env.npm_config_prefix;
    if (npmPrefix) {
      const candidate = join(npmPrefix, "bin", "opencode");
      if (existsSync(candidate)) return candidate;
    }
    // Check common CI install locations
    const home = process.env.HOME || "/home/runner";
    const candidates = [
      join(home, ".npm-global", "bin", "opencode"),
      "/usr/local/share/npm-global/bin/opencode",
      "/usr/local/bin/opencode",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return ""; // not found
  }

  private async completeViaCli(req: CompletionRequest): Promise<CompletionResult> {
    // Serialise on a static lock so parallel batch calls don't corrupt opencode's DB
    return new Promise<CompletionResult>((outerResolve, outerReject) => {
      OpenCodeProvider.cliLock = OpenCodeProvider.cliLock.then(async () => {
        try {
          const result = await this.#doCompleteViaCli(req);
          outerResolve(result);
        } catch (e) {
          outerReject(e);
        }
      });
    });
  }

  async #doCompleteViaCli(req: CompletionRequest): Promise<CompletionResult> {
    const rawModel = req.model.model === "default" ? "deepseek-v4-flash-free" : req.model.model;
    logger.info(`OpenCodeProvider.completeViaCli: model=${rawModel}`);
    const cliModel = rawModel.includes("/") ? rawModel : `opencode/${rawModel}`;
    const prompt = messagesToPrompt(req.messages);
    const timeoutMs = cliTimeoutMs();
    const args = buildCliArgs(cliModel, prompt);

    if (this.cliBinary) {
      return await this.runCli(this.cliBinary, args, timeoutMs, cliModel, req.model.model);
    }

    // Last resort: npx (auto-installs and runs)
    logger.info("trying npx opencode-ai...");
    return await this.runCli(
      "npx",
      ["--yes", "--package", "opencode-ai", "opencode", ...args],
      timeoutMs,
      cliModel,
      req.model.model,
    );
  }

  /** Build a sandboxed environment for the CLI subprocess (whitelist + CI config). */
  private cliEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of WHITELISTED_ENV_KEYS) {
      const val = process.env[key];
      if (val !== undefined) env[key] = val;
    }
    env.OPENCODE_CONFIG_CONTENT = buildCIConfig();
    env.OPENCODE_DISABLE_AUTOUPDATE = "true";
    return env;
  }

  /**
   * Execute the opencode CLI with a given prompt.
   * Spawns detached so the whole process group can be killed on timeout:
   * SIGTERM, then SIGKILL after a 5s grace period (same as opencode-ai-reviewer).
   */
  private runCli(
    cmd: string,
    args: string[],
    timeoutMs: number,
    cliModel: string,
    modelName: string,
  ): Promise<CompletionResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.root,
        stdio: ["ignore", "pipe", "pipe"],
        env: this.cliEnv(),
        detached: true,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let childExited = false;
      let forceKillHandle: ReturnType<typeof setTimeout> | undefined;

      const appendCaptured = (text: string, isErr: boolean): void => {
        const target = isErr ? "stderr" : "stdout";
        if (target === "stderr") {
          stderr += text;
          if (stderr.length > MAX_CAPTURED_BYTES) stderr = stderr.slice(-MAX_CAPTURED_BYTES);
        } else {
          stdout += text;
          if (stdout.length > MAX_CAPTURED_BYTES) stdout = stdout.slice(-MAX_CAPTURED_BYTES);
        }
      };

      const killProcessGroup = (signal: NodeJS.Signals): void => {
        if (!child.pid) return;
        try {
          if (process.platform === "win32") {
            execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
          } else {
            process.kill(-child.pid, signal);
          }
        } catch {
          /* process group already gone */
        }
      };

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        logger.warn(`OpenCode CLI timed out after ${timeoutMs}ms for model ${cliModel} — sending SIGTERM`);
        killProcessGroup("SIGTERM");
        forceKillHandle = setTimeout(() => {
          if (!childExited) {
            logger.warn("OpenCode CLI did not exit after SIGTERM — sending SIGKILL.");
            killProcessGroup("SIGKILL");
          }
        }, FORCE_KILL_GRACE_MS);
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => appendCaptured(chunk.toString(), false));
      child.stderr.on("data", (chunk: Buffer) => appendCaptured(chunk.toString(), true));

      child.on("error", (err) => {
        clearTimeout(timeoutHandle);
        if (forceKillHandle !== undefined) clearTimeout(forceKillHandle);
        if (settled) return;
        settled = true;
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timeoutHandle);
        if (forceKillHandle !== undefined) clearTimeout(forceKillHandle);
        childExited = true;
        if (settled) return;
        if (timedOut) {
          settled = true;
          reject(new Error(`OpenCode CLI timed out after ${timeoutMs}ms for model ${cliModel}`));
          return;
        }
        if (code !== 0) {
          settled = true;
          const errMsg = stderr.trim() || stdout.slice(0, 200);
          reject(new Error(`opencode CLI exited with code ${code}: ${errMsg}`));
          return;
        }

        let content = "";
        let promptTokens: number | undefined;
        let completionTokens: number | undefined;

        for (const line of stdout.split("\n")) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "text" && event.part?.text) {
              content += event.part.text;
            }
            if (event.type === "step_finish" && event.part?.tokens) {
              promptTokens = event.part.tokens.input ?? event.part.tokens.total;
              completionTokens = event.part.tokens.output;
            }
          } catch { /* skip unparseable lines */ }
        }

        if (!content) {
          logger.debug(`OpenCodeProvider.completeViaCli: no text found — stdout=${stdout.slice(0, 300)} stderr=${stderr.slice(0, 300)}`);
        }
        settled = true;
        resolve({
          content,
          model: modelName,
          provider: `${this.name}-cli`,
          usage: { promptTokens, completionTokens },
        });
      });
    });
  }
}

export function opencodeFactory(secrets: RuntimeSecrets, root?: string): AIProvider | null {
  try {
    return new OpenCodeProvider(secrets, root);
  } catch {
    return null;
  }
}
