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
const RETRYABLE_ERROR_CODES = new Set([
  "econnreset",
  "etimedout",
  "eagain",
  "econnaborted",
  "enetreset",
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
   * Note: the default predicate retries errors that expose a retryable numeric
   * status (status/statusCode/response.status) or an `Error` whose message
   * matches a transient pattern; other non-Error throws (strings, bare
   * objects) are never retried.
   */
  shouldRetry?: (err: unknown) => boolean;
  /**
   * Optional AbortSignal. The sleep between retries races against this signal;
   * when it aborts, `retry` rejects with an `AbortError` so callers can
   * distinguish cancellation from failure.
   */
  signal?: AbortSignal;
}

const getErrorStatus = (err: unknown): number | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as Record<string, unknown>;
  const direct = record.status ?? record.statusCode;
  if (typeof direct === "number") return direct;
  const response = record.response;
  if (
    typeof response === "object" &&
    response !== null &&
    typeof (response as Record<string, unknown>).status === "number"
  ) {
    return (response as Record<string, unknown>).status as number;
  }
  return undefined;
};

const getErrorCode = (err: unknown): string | undefined => {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as Record<string, unknown>).code;
  return typeof code === "string" ? code : undefined;
};

const DEFAULT_SHOULD_RETRY = (err: unknown): boolean => {
  const status = getErrorStatus(err);
  if (status !== undefined) {
    return RETRYABLE_STATUS_CODES.has(status);
  }
  const code = getErrorCode(err);
  if (code !== undefined) {
    return RETRYABLE_ERROR_CODES.has(code.toLowerCase());
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
      if (attempt >= maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const backoff = baseDelayMs * Math.pow(2, attempt - 1);
      const capped = Math.min(maxDelayMs, backoff);
      const delay = capped * (0.5 + Math.random() * 0.5);
      logger.info(
        `Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(delay, signal);
    }
  }
}
