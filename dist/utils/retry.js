import { logger } from "./logger.js";
const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const HTTP_STATUS_RATE_LIMIT = 429;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const HTTP_STATUS_BAD_GATEWAY = 502;
const RETRYABLE_STATUS_CODES = new Set([
    HTTP_STATUS_RATE_LIMIT,
    HTTP_STATUS_SERVICE_UNAVAILABLE,
    HTTP_STATUS_BAD_GATEWAY,
]);
const getErrorStatus = (err) => {
    if (typeof err !== "object" || err === null)
        return undefined;
    const record = err;
    const direct = record.status ?? record.statusCode;
    if (typeof direct === "number")
        return direct;
    const response = record.response;
    if (typeof response === "object" &&
        response !== null &&
        typeof response.status === "number") {
        return response.status;
    }
    return undefined;
};
const DEFAULT_SHOULD_RETRY = (err) => {
    const status = getErrorStatus(err);
    if (status !== undefined) {
        return RETRYABLE_STATUS_CODES.has(status);
    }
    if (err instanceof Error) {
        const msg = err.message;
        return (/\brate[\s-]*limit(?:ed)?\b/i.test(msg) ||
            /\b(?:429|502|503)\b/.test(msg) ||
            /\btimeout\b/i.test(msg) ||
            /\beconnreset\b/i.test(msg) ||
            /\boverloaded\b/i.test(msg) ||
            /\bunexpected server error\b/i.test(msg) ||
            /\bserver error\b/i.test(msg));
    }
    return false;
};
function readRetryAfterHeader(headers) {
    if (headers === null || typeof headers !== "object")
        return undefined;
    const record = headers;
    const raw = record["retry-after"] ?? record.retryAfter;
    if (typeof raw === "string" || typeof raw === "number") {
        const seconds = Number(raw);
        if (Number.isFinite(seconds)) {
            return seconds * MILLISECONDS_PER_SECOND;
        }
    }
    return undefined;
}
function extractRetryAfterMs(err) {
    if (err === null || typeof err !== "object")
        return undefined;
    const record = err;
    const retryAfter = record.retryAfter ?? record["retry-after"];
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
        return retryAfter;
    }
    const retryAfterMs = readRetryAfterHeader(record.headers);
    if (retryAfterMs !== undefined)
        return retryAfterMs;
    const response = record.response;
    if (response !== null && typeof response === "object") {
        return readRetryAfterHeader(response.headers);
    }
    return undefined;
}
const createAbortError = () => {
    const error = new Error("retry aborted by signal");
    error.name = "AbortError";
    return error;
};
const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(createAbortError());
        return;
    }
    let timer;
    const onAbort = () => {
        clearTimeout(timer);
        reject(createAbortError());
    };
    timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
});
/**
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts.
 */
export async function retry(fn, opts = {}) {
    const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
    const maxDelayMs = opts.maxDelayMs ?? baseDelayMs * Math.pow(2, 5);
    const signal = opts.signal;
    for (let attempt = 1;; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            if (attempt >= maxAttempts || !shouldRetry(err)) {
                throw err;
            }
            const computedDelay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
            const delay = extractRetryAfterMs(err) ?? computedDelay;
            logger.warn(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
            await sleep(delay, signal);
        }
    }
}
//# sourceMappingURL=retry.js.map