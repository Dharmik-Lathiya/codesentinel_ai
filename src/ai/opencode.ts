import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CompletionRequest, CompletionResult, AIProvider } from "./provider.js";
import { ProviderUnavailableError } from "./provider.js";
import type { RuntimeSecrets } from "../config/types.js";
import { logger } from "../utils/logger.js";



/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 */
export class OpenCodeProvider implements AIProvider {
  readonly name = "opencode";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly keyWasSet: boolean;
  private readonly useCli: boolean;

  constructor(secrets: RuntimeSecrets) {
    this.keyWasSet = !!secrets.opencode_api_key;
    this.apiKey = secrets.opencode_api_key || "opencode";
    this.useCli = secrets.use_opencode_cli === "true";
    this.baseUrl = (
      secrets.opencode_base_url || "http://localhost:4096"
    ).replace(/\/v1$/, "").replace(/\/$/, "");
    if (this.useCli) {
      logger.info(`OpenCodeProvider: using CLI binary — no API key or server needed`);
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

  /** Resolve the opencode binary, checking PATH then npm global prefix. */
  private resolveBinary(): string {
    // Already in PATH
    const inPath = process.env.PATH?.split(":").find((dir) => existsSync(join(dir, "opencode")));
    if (inPath) return "opencode";
    // Check npm global prefix
    const npmPrefix = process.env.npm_config_prefix;
    if (npmPrefix) {
      const candidate = join(npmPrefix, "bin", "opencode");
      if (existsSync(candidate)) return candidate;
    }
    // Check common locations
    const home = process.env.HOME || "/home/runner";
    const candidates = [
      join(home, ".npm-global", "bin", "opencode"),
      join(home, ".local", "share", "fnm", "node-versions", "current", "installation", "lib", "node_modules", "opencode-ai", "bin", "opencode.exe"),
      "/usr/local/share/npm-global/bin/opencode",
      "/usr/local/bin/opencode",
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return ""; // not found
  }

  private async completeViaCli(req: CompletionRequest): Promise<CompletionResult> {
    const rawModel = req.model.model === "default" ? "deepseek-v4-flash-free" : req.model.model;
    logger.info(`OpenCodeProvider.completeViaCli: model=${rawModel}`);
    const cliModel = rawModel.includes("/") ? rawModel : `opencode/${rawModel}`;
    const input = JSON.stringify({
      messages: req.messages,
      ...(req.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
    });

    const runChild = (cmd: string, args: string[], timeout = 120_000): Promise<CompletionResult> =>
      new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout,
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
          reject(new Error(`OpenCode CLI timed out after ${timeout}ms for model ${cliModel}`));
        }, timeout);

        child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

        child.on("error", (err) => {
          clearTimeout(timer);
          if (timedOut) return;
          reject(err);
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (code !== 0) {
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
          resolve({
            content,
            model: req.model.model,
            provider: `${this.name}-cli`,
            usage: { promptTokens, completionTokens },
          });
        });

        child.stdin.write(input);
        child.stdin.end();
      });

    // Try resolved binary path first, then npx fallback
    const binaryPath = this.resolveBinary();
    if (binaryPath) {
      return runChild(binaryPath, ["run", "--model", cliModel, "--format", "json", "--pure"]);
    }

    logger.info("opencode not in PATH, trying npx opencode-ai...");
    return runChild("npx", [
      "--package", "opencode-ai", "opencode",
      "run", "--model", cliModel, "--format", "json", "--pure",
    ], 180_000);
  }
}

export function opencodeFactory(secrets: RuntimeSecrets): AIProvider | null {
  try {
    return new OpenCodeProvider(secrets);
  } catch {
    return null;
  }
}
