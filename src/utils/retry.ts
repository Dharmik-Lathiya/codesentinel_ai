import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const HTTP_STATUS_429 = "429";
const HTTP_STATUS_RATE_LIMIT = HTTP_STATUS_429;
const HTTP_STATUS_503 = "503";
const HTTP_STATUS_SERVICE_UNAVAILABLE = HTTP_STATUS_503;
const HTTP_STATUS_502 = "502";
const HTTP_STATUS_BAD_GATEWAY = HTTP_STATUS_502;

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
}

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  const status =
    typeof err === "object" && err !== null
      ? (err as { status?: number }).status ??
        (err as { statusCode?: number }).statusCode
      : undefined;
  if (status === 429 || status === 502 || status === 503) {
    return true;
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
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts.
 *
 * Contract: the default predicate only retries `Error` instances plus objects
 * exposing a numeric 429/502/503 `status` or `statusCode` field. Non-Error
 * throws (strings, plain objects) are otherwise never retried — wrap such
 * values at call sites or pass a custom `shouldRetry` if retries are desired.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1) * Math.random();
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
