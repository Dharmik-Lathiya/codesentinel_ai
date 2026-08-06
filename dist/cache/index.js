import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
/** Default TTL for cache entries (24 hours). */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** Maximum number of cache entries before LRU eviction kicks in. */
const DEFAULT_MAX_ENTRIES = 500;
/**
 * FileCache stores AI responses on disk keyed by a hash of the request so that
 * repeated analyses (e.g. re-running review on the same diff) are free. It is
 * intentionally simple and safe: a cache miss simply returns null. Entries
 * older than the TTL are treated as misses. LRU eviction removes oldest entries
 * when maxEntries is exceeded.
 */
export class FileCache {
    dir;
    ttlMs;
    maxEntries;
    constructor(dir, ttlMs, maxEntries) {
        this.dir = dir;
        this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
        this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
    }
    /** Compute a stable cache key from arbitrary inputs. */
    key(namespace, payload) {
        const hash = createHash("sha256")
            .update(JSON.stringify(payload))
            .digest("hex")
            .slice(0, 32);
        return `${namespace}-${hash}.json`;
    }
    /** Compute a fast content hash for a single string. */
    contentHash(content) {
        return createHash("sha256").update(content).digest("hex").slice(0, 16);
    }
    get(namespace, payload) {
        const path = join(this.dir, this.key(namespace, payload));
        if (!existsSync(path))
            return null;
        try {
            const stat = statSync(path);
            if (Date.now() - stat.mtimeMs > this.ttlMs)
                return null;
            // Touch file to update mtime for LRU
            const raw = readFileSync(path, "utf8");
            writeFileSync(path, raw, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    set(namespace, payload, value) {
        const path = join(this.dir, this.key(namespace, payload));
        try {
            writeFileSync(path, JSON.stringify(value), "utf8");
            this.evictIfNeeded();
        }
        catch {
            // Cache failures must never break the run.
        }
    }
    /** Remove oldest entries when cache exceeds maxEntries. */
    evictIfNeeded() {
        try {
            const files = readdirSync(this.dir)
                .filter((f) => f.endsWith(".json"))
                .map((f) => {
                const fp = join(this.dir, f);
                const stat = statSync(fp);
                return { path: fp, mtime: stat.mtimeMs };
            });
            if (files.length <= this.maxEntries)
                return;
            // Sort by mtime ascending (oldest first)
            files.sort((a, b) => a.mtime - b.mtime);
            // Remove oldest entries to get back to maxEntries
            const toRemove = files.slice(0, files.length - this.maxEntries);
            for (const f of toRemove) {
                try {
                    unlinkSync(f.path);
                }
                catch { /* ignore */ }
            }
        }
        catch {
            // Eviction failures are non-critical
        }
    }
}
//# sourceMappingURL=index.js.map