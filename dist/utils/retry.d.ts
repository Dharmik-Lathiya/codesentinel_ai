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
/**
 * Retry an async operation with exponential backoff. Only retries on transient
 * errors (rate limits, 5xx, timeouts). Throws the original error on permanent
 * failures or after exhausting attempts.
 */
export declare function retry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
