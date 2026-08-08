import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const HTTP_STATUS_RATE_LIMIT = "429";
const HTTP_STATUS_SERVICE_UNAVAILABLE = "503";
const HTTP_STATUS_BAD_GATEWAY = "502";
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503]);

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /**
   * Max delay in ms for a single retry (cap on exponential backoff).
   * Default: none; the backoff is only bounded by the number of attempts.
   */
  maxDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
  /** Optional signal that aborts pending retry delays and the overall cycle when fired. */
  signal?: AbortSignal;
}

const getErrorStatus = (err: unknown): number | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as Record<string, unknown>).status ?? (err as Record<string, unknown>).statusCode;
  return typeof status === "number" ? status : undefined;
};

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
      msg.includes(HTTP_STATUS_RATE_LIMIT) ||
      msg.includes(HTTP_STATUS_SERVICE_UNAVAILABLE) ||
      msg.includes(HTTP_STATUS_BAD_GATEWAY) ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("overloaded")
    );
  }
  return false;
};

/**
 * Sleep for `ms` milliseconds, abortable via `signal`. Also yields to the
 * microtask queue so an `aborted` signal is followed synchronously.
 */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });

/**
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts. An optional `signal` aborts pending
 * sleeps immediately; the abort reason is thrown once `fn` settles.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const maxDelayMs = opts.maxDelayMs ?? Infinity;
  const signal = opts.signal;

  if (maxAttempts < 1) {
    throw new Error("maxAttempts must be >= 1");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      if (!shouldRetry(err)) {
        throw err;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(maxDelayMs, backoff);
      const delay = capped * Math.random();
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(delay, signal);
    }
  }
  // Unreachable: the loop above returns on success and throws on failure.
  // Present only to keep the function's control-flow analysis well-typed.
  throw new Error("unreachable");
}
