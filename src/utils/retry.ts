import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const DEFAULT_MAX_DELAY_MS = 30 * MILLISECONDS_PER_SECOND;
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_STATUS_PATTERN = new RegExp(
  `\\b(${[...TRANSIENT_STATUS_CODES].join("|")})\\b`,
);

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /**
   * Maximum delay in ms between retries (jitter cap). Default: 30000ms
   * (`DEFAULT_MAX_DELAY_MS`).
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
    const withStatus = err as Error & { status?: number; statusCode?: number };
    const status = withStatus.status ?? withStatus.statusCode;
    if (status !== undefined && TRANSIENT_STATUS_CODES.has(status)) {
      return true;
    }
    const msg = err.message.toLowerCase();
    if (TRANSIENT_STATUS_PATTERN.test(msg)) {
      return true;
    }
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
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let attempt = 1;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5),
        maxDelayMs,
      );
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
