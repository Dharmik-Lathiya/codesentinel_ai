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
  /**
   * Optional AbortSignal. The sleep between retries races against this signal;
   * when it aborts, `retry` rejects with an `AbortError` so callers can
   * distinguish cancellation from failure.
   */
  signal?: AbortSignal;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorStatus = (err: unknown): number | undefined => {
  if (!isRecord(err)) return undefined;
  const direct = err.status ?? err.statusCode;
  if (typeof direct === "number" && direct > 0) return direct;
  const response = err.response;
  if (isRecord(response) && typeof response.status === "number") {
    return response.status;
  }
  return undefined;
};

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  const status = getErrorStatus(err);
  if (status !== undefined) {
    return RETRYABLE_STATUS_CODES.has(status);
  }
  if (err instanceof Error) {
    const msg = err.message;
    return (
      /\brate[\s-]*limit(?:ed)?\b/i.test(msg) ||
      /\b(?:429|502|503)\b/.test(msg) ||
      /\btimeout\b/i.test(msg) ||
      /\beconnreset\b/i.test(msg) ||
      /\boverloaded\b/i.test(msg)
    );
  }
  return false;
};

const createAbortError = (): Error => {
  const error = new Error("retry aborted by signal");
  error.name = "AbortError";
  return error;
};

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = (): void => {
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
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const maxDelayMs = opts.maxDelayMs ?? baseDelayMs * Math.pow(2, 5);
  const signal = opts.signal;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      let retryable: boolean;
      try {
        retryable = shouldRetry(err);
      } catch {
        retryable = false;
      }
      if (attempt >= maxAttempts || !retryable) {
        throw err;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(maxDelayMs, backoff);
      const delay = capped * (0.5 + Math.random() * 0.5);
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(delay, signal);
    }
  }
}
