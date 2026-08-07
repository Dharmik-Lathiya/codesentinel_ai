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
      try {
        await rename(tmp, target);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === "EEXIST" || code === "ENOTEMPTY" || code === "EPERM") {
          await unlink(target).catch(() => {});
          await rename(tmp, target);
        } else {
          throw err;
        }
      }
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
  private static MAX_ENTRIES = 500;
  private static TTL_MS = 24 * 60 * 60 * 1000;
  private opQueue: Promise<unknown> = Promise.resolve();

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

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opQueue.then(fn, fn);
    this.opQueue = run.catch(() => {});
    return run;
  }

  async get(key: string): Promise<Lesson[]> {
    const entry = await this.backend.get(key).catch(() => null);
    if (!entry) return [];
    entry.lessons.forEach((l) => l.hitCount++);
    await this.backend.set(key, entry).catch((err: unknown) => {
      logger.warn(`Failed to refresh hit counts for ${key}:`, err);
    });
    return entry.lessons.map((l) => ({ ...l }));
  }

  async set(key: string, lesson: Lesson): Promise<void> {
    return this.withLock(key, () =>
      this.runSerialized(async () => {
        const existing = await this.backend.get(key);
        await this.backend.set(key, this.mergeLesson(key, existing, lesson));
        await this.enforceLimits();
      })
    );
  }

  private mergeLesson(key: string, existing: CacheEntry | null, lesson: Lesson): CacheEntry {
    const lessons = existing ? [...existing.lessons] : [];
    const idx = lessons.findIndex((l) => l.pattern === lesson.pattern);
    if (idx >= 0) {
      lessons[idx] = lesson;
    } else {
      lessons.push(lesson);
    }
    return { key, lessons, updatedAt: new Date().toISOString() };
  }

  async getAll(): Promise<Lesson[]> {
    const entries = await this.loadAllEntries();
    const lessons: Lesson[] = [];
    for (const entry of entries) {
      if (entry) lessons.push(...entry.lessons.map((l) => ({ ...l })));
    }
    return lessons;
  }

  private async loadAllEntries(): Promise<(CacheEntry | null)[]> {
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
    return entries;
  }

  async clear(): Promise<void> {
    return this.runSerialized(async () => {
      const files: string[] = await this.backend.list().catch(() => []);
      for (const file of files) {
        const key = file.replace(/\.json$/, "");
        await this.backend.remove(key).catch(() => {});
      }
    });
  }

  private async enforceLimits(): Promise<void> {
    const entries = await this.loadAllEntries();
    const now = Date.now();
    for (const entry of entries) {
      if (entry && now - Date.parse(entry.updatedAt) > LearningCache.TTL_MS) {
        await this.backend.remove(entry.key).catch(() => {});
      }
    }
    const live = entries.filter((e): e is CacheEntry => !!e && now - Date.parse(e.updatedAt) <= LearningCache.TTL_MS);
    if (live.length > LearningCache.MAX_ENTRIES) {
      const sorted = [...live].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
      for (const entry of sorted.slice(0, live.length - LearningCache.MAX_ENTRIES)) {
        await this.backend.remove(entry.key).catch(() => {});
      }
    }
  }

  async getStats(): Promise<{ totalEntries: number; totalLessons: number }> {
    const entries = await this.loadAllEntries();
    let totalLessons = 0;
    for (const entry of entries) {
      if (entry) totalLessons += entry.lessons.length;
    }
    return { totalEntries: entries.length, totalLessons };
  }
}
