import { logger } from "./logger.js";

const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_BASE_DELAY_MS = MILLISECONDS_PER_SECOND;
const DEFAULT_MAX_DELAY_MS = 30 * MILLISECONDS_PER_SECOND;
const HTTP_STATUS_RATE_LIMIT = "429";
const HTTP_STATUS_SERVICE_UNAVAILABLE = "503";
const HTTP_STATUS_BAD_GATEWAY = "502";
const HTTP_STATUS_TOO_MANY_REQUESTS_CODE = 429;
const HTTP_STATUS_SERVICE_UNAVAILABLE_CODE = 503;
const HTTP_STATUS_BAD_GATEWAY_CODE = 502;
const RETRYABLE_STATUS_CODES = new Set([
  HTTP_STATUS_TOO_MANY_REQUESTS_CODE,
  HTTP_STATUS_BAD_GATEWAY_CODE,
  HTTP_STATUS_SERVICE_UNAVAILABLE_CODE,
  String(HTTP_STATUS_TOO_MANY_REQUESTS_CODE),
  String(HTTP_STATUS_BAD_GATEWAY_CODE),
  String(HTTP_STATUS_SERVICE_UNAVAILABLE_CODE),
]);

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /**
   * Base delay in ms between retries. Exponential backoff is applied.
   * Default: 1000ms (`DEFAULT_BASE_DELAY_MS`).
   */
  baseDelayMs?: number;
  /** Max delay in ms for a single retry (cap on exponential backoff). Default: 30s (DEFAULT_MAX_DELAY_MS). */
  maxDelayMs?: number;
  /**
   * Optional predicate: return true to retry on this error.
   * Note: the default predicate only matches `Error` instances; non-Error
   * throws (strings, plain objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
}

const getErrorStatus = (err: unknown): number | string | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const status = (err as Record<string, unknown>).status ?? (err as Record<string, unknown>).statusCode;
  return typeof status === "number" || typeof status === "string" ? status : undefined;
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
  const baseDelayMs = Math.max(1, opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const shouldRetry = opts.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(maxDelayMs, backoff);
      const delay = capped * (0.5 + Math.random() * 0.5);
      logger.warn(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("retry loop exhausted unexpectedly (unreachable)");
}
