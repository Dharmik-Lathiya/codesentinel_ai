/**
 * FileCache stores AI responses on disk keyed by a hash of the request so that
 * repeated analyses (e.g. re-running review on the same diff) are free. It is
 * intentionally simple and safe: a cache miss simply returns null. Entries
 * older than the TTL are treated as misses. LRU eviction removes oldest entries
 * when maxEntries is exceeded.
 */
export declare class FileCache {
    private dir;
    private ttlMs;
    private maxEntries;
    constructor(dir: string, ttlMs?: number, maxEntries?: number);
    /** Compute a stable cache key from arbitrary inputs. */
    private key;
    /** Compute a fast content hash for a single string. */
    contentHash(content: string): string;
    get<T>(namespace: string, payload: unknown): T | null;
    set<T>(namespace: string, payload: unknown, value: T): void;
    /** Remove oldest entries when cache exceeds maxEntries. */
    private evictIfNeeded;
}
