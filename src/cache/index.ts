import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Default TTL for cache entries (24 hours). */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * FileCache stores AI responses on disk keyed by a hash of the request so that
 * repeated analyses (e.g. re-running review on the same diff) are free. It is
 * intentionally simple and safe: a cache miss simply returns null. Entries
 * older than the TTL are treated as misses.
 */
export class FileCache {
  private ttlMs: number;

  constructor(private dir: string, ttlMs?: number) {
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** Compute a stable cache key from arbitrary inputs. */
  private key(namespace: string, payload: unknown): string {
    const hash = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")
      .slice(0, 32);
    return `${namespace}-${hash}.json`;
  }

  get<T>(namespace: string, payload: unknown): T | null {
    const path = join(this.dir, this.key(namespace, payload));
    if (!existsSync(path)) return null;
    try {
      const stat = statSync(path);
      if (Date.now() - stat.mtimeMs > this.ttlMs) return null;
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return null;
    }
  }

  set<T>(namespace: string, payload: unknown, value: T): void {
    const path = join(this.dir, this.key(namespace, payload));
    try {
      writeFileSync(path, JSON.stringify(value), "utf8");
    } catch {
      // Cache failures must never break the run.
    }
  }
}
