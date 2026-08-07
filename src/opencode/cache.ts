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
    .slice(0, 16);
}

class FileSystemBackend implements CacheBackend {
  constructor(private cacheDir: string) {}

  private async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true }).catch(() => {});
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
  private static FLUSH_DELAY = 1000;
  private hitBuffer = new Map<string, number>();
  private flushTimer?: ReturnType<typeof setTimeout>;

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
    });
    return next;
  }

  async get(key: string): Promise<Lesson[]> {
    const entry = await this.backend.get(key);
    if (!entry) return [];
    const lessons = entry.lessons.map((l) => ({ ...l }));
    for (const l of lessons) {
      const composite = key + "::" + l.pattern;
      const prior = this.hitBuffer.get(composite) ?? 0;
      this.hitBuffer.set(composite, prior + 1);
      l.hitCount += prior + 1;
      this.scheduleFlush();
    }
    return lessons;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flushPendingHits();
    }, LearningCache.FLUSH_DELAY);
  }

  private async flushPendingHits(): Promise<void> {
    this.flushTimer = undefined;
    const pending = new Map(this.hitBuffer);
    this.hitBuffer.clear();
    const byKey = new Map<string, Map<string, number>>();
    for (const [composite, count] of pending) {
      const sep = composite.indexOf("::");
      const key = composite.slice(0, sep);
      const pattern = composite.slice(sep + 2);
      let patterns = byKey.get(key);
      if (!patterns) {
        patterns = new Map<string, number>();
        byKey.set(key, patterns);
      }
      patterns.set(pattern, (patterns.get(pattern) ?? 0) + count);
    }
    for (const [key, patterns] of byKey) {
      await this.withLock(key, async () => {
        const entry = await this.backend.get(key);
        if (!entry) return;
        for (const [pattern, count] of patterns) {
          const lesson = entry.lessons.find((l) => l.pattern === pattern);
          if (lesson) lesson.hitCount += count;
        }
        try {
          await this.backend.set(key, entry);
        } catch (err) {
          logger.warn(`Failed to flush hit counts for ${key}:`, err);
        }
      });
    }
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
        try { await this.backend.set(key, existing); } catch (err) { logger.warn(`Failed to update lessons for ${key}:`, err); }
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: new Date().toISOString(),
        };
        try { await this.backend.set(key, entry); } catch (err) { logger.warn(`Failed to write lessons for ${key}:`, err); }
      }
    });
  }

  async getAll(): Promise<Lesson[]> {
    const files: string[] = await this.backend.list().catch(() => []);
    const entries = await Promise.all(
      files.map(async (file) => {
        const key = file.replace(/\.json$/, "");
        try {
          return await this.backend.get(key);
        } catch {
          return null;
        }
      })
    );
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
    const files = await this.backend.list().catch(() => []);
    const entries = await Promise.all(
      files.map(async (file) => {
        const key = file.replace(/\.json$/, "");
        try {
          return await this.backend.get(key);
        } catch {
          return null;
        }
      })
    );
    let totalLessons = 0;
    for (const entry of entries) {
      if (entry) totalLessons += entry.lessons.length;
    }
    return { totalEntries: files.length, totalLessons };
  }
}
