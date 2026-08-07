import { createHash } from "node:crypto";
import { readFile, writeFile, rename, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

export interface Lesson {
  pattern: string;
  filePattern: string;
  lesson: string;
  severity: "critical" | "important" | "minor";
  createdAt: string;
  hitCount: number;
}

export interface CacheEntry {
  key: string;
  lessons: Lesson[];
  updatedAt: string;
}

export interface CacheBackend {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  list(): Promise<string[]>;
  remove(key: string): Promise<void>;
}

const KEY_HASH_LENGTH = 16;

export function buildCacheKey(filePath: string, pattern: string): string {
  return createHash("sha256")
    .update(filePath + "::" + pattern)
    .digest("hex")
    .slice(0, KEY_HASH_LENGTH);
}

class FileSystemBackend implements CacheBackend {
  constructor(private cacheDir: string) {}

  private async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true }).catch(() => {});
  }

  private filePath(key: string): string {
    if (!/^[0-9a-f]{16}$/.test(key)) {
      throw new Error(`Invalid cache key: ${key}`);
    }
    return join(this.cacheDir, `${key}.json`);
  }

  async get(key: string): Promise<CacheEntry | null> {
    try {
      const path = this.filePath(key);
      return JSON.parse(await readFile(path, "utf8")) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const target = this.filePath(key);
    const tmp = target + ".tmp." + process.pid;
    try {
      await this.ensureDir();
      await writeFile(tmp, JSON.stringify(entry), "utf8");
      await rename(tmp, target);
    } catch (err) {
      logger.warn(`Failed to write cache entry ${key}:`, err);
      try { await unlink(tmp); } catch { /* ignore */ }
    }
  }

  async list(): Promise<string[]> {
    try {
      await this.ensureDir();
      return (await readdir(this.cacheDir)).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch {
      // best-effort
    }
  }
}

export class LearningCache {
  private backend: CacheBackend;
  private locks = new Map<string, Promise<unknown>>();
  private static LOCK_TIMEOUT = 30000;

  constructor(backendOrDir?: CacheBackend | string) {
    if (!backendOrDir || typeof backendOrDir === "string") {
      this.backend = new FileSystemBackend(backendOrDir ?? ".codesentinel-cache/learnings/");
    } else {
      this.backend = backendOrDir;
    }
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let run: Promise<T> | undefined;
    const timedFn = () => {
      run = Promise.resolve().then(fn);
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Lock timeout for key: ${key}`)), LearningCache.LOCK_TIMEOUT);
      });
      return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
    };
    const next = prev.then(timedFn, timedFn);
    const settle = () => (run ? run.catch(() => undefined) : undefined);
    // Hold the lock until the tracked task settles (even past a caller-visible
    // timeout) so a timed-out task cannot write stale data behind the next holder.
    const lock = next.then(settle, settle);
    this.locks.set(key, lock);
    lock.finally(() => {
      if (this.locks.get(key) === lock) this.locks.delete(key);
    });
    return next;
  }

  async get(key: string): Promise<Lesson[]> {
    let entry;
    try {
      entry = await this.backend.get(key);
    } catch {
      entry = null;
    }
    if (!entry) return [];
    entry.lessons.forEach((l) => l.hitCount++);
    await this.backend.set(key, entry);
    return entry.lessons.map((l) => ({ ...l }));
  }

  async set(key: string, lesson: Lesson): Promise<void> {
    return this.withLock(key, async () => {
      const existing = await this.backend.get(key);
      if (existing) {
        const idx = existing.lessons.findIndex((l) => l.pattern === lesson.pattern);
        if (idx >= 0) {
          existing.lessons[idx] = lesson;
        } else {
          existing.lessons.push(lesson);
        }
        existing.updatedAt = new Date().toISOString();
        try { await this.backend.set(key, existing); } catch { /* ignore */ }
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: new Date().toISOString(),
        };
        try { await this.backend.set(key, entry); } catch { /* ignore */ }
      }
    });
  }

  private async readAll(): Promise<(CacheEntry | null)[]> {
    const files: string[] = await this.backend.list().catch(() => []);
    return Promise.all(
      files.map(async (file) => {
        const key = file.replace(/\.json$/, "");
        try {
          return await this.backend.get(key);
        } catch {
          return null;
        }
      })
    );
  }

  async getAll(): Promise<Lesson[]> {
    const entries = await this.readAll();
    const lessons: Lesson[] = [];
    for (const entry of entries) {
      if (entry) lessons.push(...entry.lessons.map((l) => ({ ...l })));
    }
    return lessons;
  }

  async clear(): Promise<void> {
    const files: string[] = await this.backend.list().catch(() => []);
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      await this.backend.remove(key);
    }
  }

  async getStats(): Promise<{ totalEntries: number; totalLessons: number }> {
    const entries = await this.readAll();
    let totalLessons = 0;
    for (const entry of entries) {
      if (entry) totalLessons += entry.lessons.length;
    }
    return { totalEntries: entries.length, totalLessons };
  }
}
