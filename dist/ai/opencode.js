import { spawn } from "node:child_process";
import { ProviderUnavailableError } from "./provider.js";
import { logger } from "../utils/logger.js";
const DEFAULT_MAX_TOKENS = 4096;
/**
 * OpenCode provider. OpenCode exposes an OpenAI-compatible HTTP API, so we call
 * it directly with `fetch` (no extra SDK dependency). The base URL defaults to
 * the local OpenCode gateway and can be overridden via OPENCODE_BASE_URL.
 */
export class OpenCodeProvider {
    name = "opencode";
    baseUrl;
    apiKey;
    keyWasSet;
    constructor(secrets) {
        this.keyWasSet = !!secrets.opencode_api_key;
        this.apiKey = secrets.opencode_api_key || "opencode";
        this.baseUrl = (secrets.opencode_base_url || "http://localhost:4096").replace(/\/v1$/, "").replace(/\/$/, "");
        if (!this.keyWasSet) {
            logger.info(`OpenCodeProvider: no API key set — free tier will be used for model requests`);
        }
    }
    async complete(req) {
        const url = `${this.baseUrl}/v1/chat/completions`;
        logger.info(`OpenCodeProvider.complete: POST ${url} model=${req.model.model}`);
        let res;
        const headers = {
            "Content-Type": "application/json",
        };
        if (this.keyWasSet) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }
        try {
            res = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: req.model.model,
                    messages: req.messages,
                    temperature: req.temperature ?? 0.2,
                    max_tokens: req.model.maxTokens ?? req.maxTokens ?? DEFAULT_MAX_TOKENS,
                    ...(req.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
                }),
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`OpenCodeProvider.complete: NETWORK ERROR — ${msg}`);
            throw new ProviderUnavailableError("opencode", `cannot reach ${this.baseUrl} — ${msg}. Check OPENCODE_BASE_URL or switch provider via --provider.`);
        }
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const snippet = body.slice(0, 200);
            logger.error(`OpenCodeProvider.complete: HTTP ${res.status} — ${snippet}`);
            if (res.status === 401 && !this.keyWasSet) {
                logger.warn(`OpenCodeProvider: 401 with no API key, falling back to CLI`);
                return this.completeViaCli(req);
            }
            if (res.status === 401) {
                const isLocal = this.baseUrl === "http://localhost:4096";
                let hint;
                if (!this.keyWasSet) {
                    hint = "OPENCODE_API_KEY is not set. " + (isLocal
                        ? "For local opencode server no key is needed. Make sure the server is running on localhost:4096, or set OPENCODE_API_KEY for remote API."
                        : "Export OPENCODE_API_KEY=sk-... in your environment, or switch providers via --provider.");
                }
                else {
                    hint = "OPENCODE_API_KEY was sent but rejected. Check that it is valid, not expired, and has no extra whitespace.";
                }
                const hintMsg = `${hint} (baseUrl=${this.baseUrl})`;
                logger.error(`OpenCodeProvider.complete: 401 — ${hintMsg}`);
                throw new Error(`OpenCode API error 401: ${snippet} — ${hintMsg}`);
            }
            throw new Error(`OpenCode API error ${res.status}: ${snippet}`);
        }
        const data = (await res.json());
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
    async completeViaCli(req) {
        logger.info(`OpenCodeProvider.completeViaCli: model=${req.model.model}`);
        const cliModel = req.model.model.includes("/") ? req.model.model : `opencode/${req.model.model}`;
        const input = JSON.stringify({
            messages: req.messages,
            ...(req.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
        });
        return new Promise((resolve, reject) => {
            const child = spawn("opencode", [
                "run", "--model", cliModel, "--format", "json", "--pure",
            ], {
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 120_000,
            });
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                child.kill();
                reject(new Error(`OpenCode CLI timed out after 120s for model ${cliModel}`));
            }, 120_000);
            child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
            child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
            child.on("error", (err) => {
                clearTimeout(timer);
                if (timedOut)
                    return;
                const msg = err.message;
                if (msg.includes("ENOENT")) {
                    reject(new ProviderUnavailableError("opencode", "opencode CLI not found in PATH. Install it from https://opencode.ai or use --provider openai."));
                }
                else {
                    reject(new ProviderUnavailableError("opencode", `opencode CLI error: ${msg}`));
                }
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                if (timedOut)
                    return;
                if (code !== 0) {
                    const errMsg = stderr.trim() || stdout.slice(0, 200);
                    reject(new Error(`opencode CLI exited with code ${code}: ${errMsg}`));
                    return;
                }
                let content = "";
                let promptTokens;
                let completionTokens;
                for (const line of stdout.split("\n")) {
                    if (!line.trim())
                        continue;
                    try {
                        const event = JSON.parse(line);
                        if (event.type === "text" && event.part?.text) {
                            content += event.part.text;
                        }
                        if (event.type === "step_finish" && event.part?.tokens) {
                            promptTokens = event.part.tokens.input ?? event.part.tokens.total;
                            completionTokens = event.part.tokens.output;
                        }
                    }
                    catch {
                        // skip unparseable lines
                    }
                }
                if (!content) {
                    logger.debug(`OpenCodeProvider.completeViaCli: no text found in output — stdout=${stdout.slice(0, 300)} stderr=${stderr.slice(0, 300)}`);
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
    }
}
export function opencodeFactory(secrets) {
    try {
        return new OpenCodeProvider(secrets);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=opencode.js.map