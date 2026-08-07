import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, utimesSync, statSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/** Default TTL for cache entries (24 hours). */
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const HASH_KEY_LENGTH = 32;
const HASH_CONTENT_LENGTH = 16;

const DEFAULT_TTL_MS = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

/** Maximum number of cache entries before LRU eviction kicks in. */
const DEFAULT_MAX_ENTRIES = 500;

/**
 * FileCache stores AI responses on disk keyed by a hash of the request so that
 * repeated analyses (e.g. re-running review on the same diff) are free. It is
 * intentionally simple and safe: a cache miss simply returns null. Entries
 * older than the TTL are treated as misses. LRU eviction removes oldest entries
 * when maxEntries is exceeded. Assumes single-process, single-threaded access;
 * under concurrent writers LRU ordering/atomicity is not guaranteed.
 */
export class FileCache {
  private ttlMs: number;
  private maxEntries: number;

  constructor(private dir: string, ttlMs?: number, maxEntries?: number) {
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** Compute a stable cache key from arbitrary inputs. */
  private key(namespace: string, payload: unknown): string {
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, HASH_KEY_LENGTH);
    return `${namespace}-${hash}.json`;
  }

  /** Compute a fast content hash for a single string (public API helper). */
  contentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, HASH_CONTENT_LENGTH);
  }

  get<T>(namespace: string, payload: unknown): T | null {
    const path = join(this.dir, this.key(namespace, payload));
    if (!existsSync(path)) return null;
    try {
      const stat = statSync(path);
      if (Date.now() - stat.mtimeMs > this.ttlMs) return null;
      // Touch file to update mtime for LRU
      const raw = readFileSync(path, "utf8");
      utimesSync(path, new Date(), new Date());
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      return parsed as T;
    } catch {
      return null;
    }
  }

  set<T>(namespace: string, payload: unknown, value: T): void {
    const path = join(this.dir, this.key(namespace, payload));
    try {
      writeFileSync(path, JSON.stringify(value), "utf8");
      this.evictIfNeeded();
    } catch {
      // Cache failures must never break the run.
    }
  }

  /** Remove oldest entries when cache exceeds maxEntries. */
  private evictIfNeeded(): void {
    try {
      const names = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      if (names.length <= this.maxEntries) return;
      const files = names.map((f) => {
        const fp = join(this.dir, f);
        const stat = statSync(fp);
        return { path: fp, mtime: stat.mtimeMs };
      });

      // Sort by mtime ascending (oldest first)
      files.sort((a, b) => a.mtime - b.mtime);

      // Remove oldest entries to get back to maxEntries
      const toRemove = files.slice(0, files.length - this.maxEntries);
      for (const f of toRemove) {
        try { unlinkSync(f.path); } catch { /* ignore */ }
      }
    } catch {
      // Eviction failures are non-critical
    }
  }
}
