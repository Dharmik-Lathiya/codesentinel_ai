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

export function buildCacheKey(filePath: string, pattern: string): string {
  return createHash("sha256")
    .update(filePath + "::" + pattern)
    .digest("hex")
    // Truncated to 64 bits (16 hex chars); collision risk acceptable at current cache scale.
    .slice(0, 16);
}

class FileSystemBackend implements CacheBackend {
  constructor(private cacheDir: string) {}

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (err) {
      logger.warn(`Failed to create cache directory ${this.cacheDir}:`, err);
    }
  }

  private filePath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  async get(key: string): Promise<CacheEntry | null> {
    const path = this.filePath(key);
    try {
      return JSON.parse(await readFile(path, "utf8")) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    await this.ensureDir();
    const target = this.filePath(key);
    const tmp = target + ".tmp." + process.pid;
    try {
      await writeFile(tmp, JSON.stringify(entry), "utf8");
      await rename(tmp, target);
    } catch (err) {
      logger.warn(`Failed to write cache entry ${key}:`, err);
      try { await unlink(tmp); } catch { /* ignore */ }
    }
  }

  async list(): Promise<string[]> {
    await this.ensureDir();
    try {
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
  private static TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(backendOrDir?: CacheBackend | string) {
    if (!backendOrDir || typeof backendOrDir === "string") {
      this.backend = new FileSystemBackend(backendOrDir ?? ".codesentinel-cache/learnings/");
    } else {
      this.backend = backendOrDir;
    }
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const timedFn = () => {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Lock timeout for key: ${key}`)), LearningCache.LOCK_TIMEOUT);
      });
      return Promise.race([fn(), timeout]).finally(() => clearTimeout(timer));
    };
    const next = prev.then(timedFn, timedFn);
    this.locks.set(key, next);
    next.finally(() => {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }).catch(() => {});
    return next;
  }

  async get(key: string): Promise<Lesson[]> {
    return this.withLock(key, async () => {
      const entry = await this.backend.get(key);
      if (!entry) return [];
      for (const l of entry.lessons) {
        l.hitCount++;
      }
      await this.backend.set(key, entry);
      return entry.lessons.map((l) => ({ ...l }));
    });
  }

  async set(key: string, lesson: Lesson): Promise<void> {
    return this.withLock(key, async () => {
      const existing = await this.backend.get(key);
      if (existing) {
        this.mergeLesson(existing, lesson);
        try { await this.backend.set(key, existing); } catch { /* ignore */ }
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: new Date(Date.now()).toISOString(),
        };
        try { await this.backend.set(key, entry); } catch { /* ignore */ }
      }
    });
  }

  private mergeLesson(entry: CacheEntry, lesson: Lesson): void {
    const idx = entry.lessons.findIndex((l) => l.pattern === lesson.pattern);
    if (idx >= 0) {
      const prev = entry.lessons[idx];
      entry.lessons[idx] = { ...lesson, hitCount: prev.hitCount + (lesson.hitCount ?? 0) };
    } else {
      entry.lessons.push(lesson);
    }
    entry.updatedAt = new Date(Date.now()).toISOString();
  }

  private async readAllEntries(): Promise<{ key: string; entry: CacheEntry }[]> {
    const files: string[] = await this.backend.list().catch(() => []);
    const results = await Promise.all(
      files.map(async (file) => {
        const key = file.replace(/\.json$/, "");
        try {
          const entry = await this.backend.get(key);
          return entry ? { key, entry } : null;
        } catch {
          return null;
        }
      })
    );
    return results.filter((r): r is { key: string; entry: CacheEntry } => r !== null);
  }

  async getAll(): Promise<Lesson[]> {
    const now = Date.now();
    const lessons: Lesson[] = [];
    for (const { key, entry } of await this.readAllEntries()) {
      if (now - Date.parse(entry.updatedAt) > LearningCache.TTL_MS) {
        await this.backend.remove(key).catch(() => {});
        continue;
      }
      lessons.push(...entry.lessons.map((l) => ({ ...l })));
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
    const now = Date.now();
    const rows = await this.readAllEntries();
    let totalLessons = 0;
    let expired = 0;
    for (const { key, entry } of rows) {
      if (now - Date.parse(entry.updatedAt) > LearningCache.TTL_MS) {
        await this.backend.remove(key).catch(() => {});
        expired++;
        continue;
      }
      totalLessons += entry.lessons.length;
    }
    return { totalEntries: rows.length - expired, totalLessons };
  }
}
