import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const DEFAULT_MAX_DELAY_MS = 30 * MILLISECONDS_PER_SECOND;
const HTTP_STATUS_429 = "429";
const HTTP_STATUS_503 = "503";
const HTTP_STATUS_502 = "502";

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /**
   * Maximum delay in ms between retries (capped exponential backoff).
   * Default: 30000ms (`DEFAULT_MAX_DELAY_MS`).
   */
  maxDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
  /** Optional AbortSignal to cancel a retry chain between attempts. */
  signal?: AbortSignal;
}

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("rate-limited") ||
      msg.includes(HTTP_STATUS_429) ||
      msg.includes(HTTP_STATUS_503) ||
      msg.includes(HTTP_STATUS_502) ||
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
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const signal = opts.signal;

  let attempt = 1;
  while (true) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Retry aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = base * 0.5 + base * Math.random() * 0.5;
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
    attempt++;
  }
}
