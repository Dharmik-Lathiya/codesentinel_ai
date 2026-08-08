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

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /** Max delay in ms for a single retry (cap on exponential backoff). Default: 32x baseDelayMs (baseDelayMs * 2^5). */
  maxDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
  /** Abort signal: aborts the pending retry sleep when fired. */
  signal?: AbortSignal;
}

const getErrorStatus = (err: unknown): number | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : undefined;
};

const getRetryAfterMs = (err: unknown): number | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const response = (err as Record<string, unknown>).response;
  if (typeof response !== "object" || response === null) return undefined;
  const headers = (response as Record<string, unknown>).headers;
  if (typeof headers !== "object" || headers === null) return undefined;
  const headerMap = headers as Record<string, unknown>;
  const header = headerMap["retry-after"] ?? headerMap["Retry-After"];
  if (typeof header === "number") return header * MILLISECONDS_PER_SECOND;
  if (typeof header !== "string") return undefined;
  const seconds = /^\s*(\d+)\s*$/.exec(header)?.[1];
  if (seconds !== undefined) return Number(seconds) * MILLISECONDS_PER_SECOND;
  const when = Date.parse(header);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, when - Date.now());
};

const abortError = (): Error => {
  const error = new Error("The retry was aborted");
  error.name = "AbortError";
  return error;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  const status = getErrorStatus(err);
  if (status !== undefined) {
    return RETRYABLE_STATUS_CODES.has(status);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("rate-limited") ||
      /\b(429|502|503)\b/.test(msg) ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("overloaded")
    );
  }
  return false;
};

/**
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts.
 *
 * `fn` should be idempotent: it is re-executed on each retry, so any side
 * effects performed before an earlier failure would be repeated.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const maxDelayMs = opts.maxDelayMs ?? baseDelayMs * Math.pow(2, 5);

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(maxDelayMs, backoff);
      const jittered = capped * (0.5 + Math.random() * 0.5);
      const retryAfterMs = getRetryAfterMs(err);
      const delay = retryAfterMs !== undefined ? Math.max(jittered, retryAfterMs) : jittered;
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(delay, opts.signal);
    }
  }
}
