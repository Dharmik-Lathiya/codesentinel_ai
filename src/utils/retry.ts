import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const DEFAULT_MAX_DELAY_MS = 30_000;

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /**
   * Upper bound in ms on the delay between retries. Default: 30000ms.
   */
  maxDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
}

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  if (err instanceof Error) {
    const status =
      (err as { status?: number }).status ??
      (err as { statusCode?: number }).statusCode;
    if (
      status === 429 ||
      status === 408 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return true;
    }
    const msg = err.message.toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("rate-limited") ||
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
  const maxAttempts = opts.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive integer");
  }
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const rawDelay = baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
      const delay = Math.min(rawDelay, maxDelayMs);
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
