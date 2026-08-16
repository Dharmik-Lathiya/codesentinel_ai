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
/**
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts.
 */
export declare function retry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
