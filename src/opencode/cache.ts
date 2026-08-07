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
    for (const l of entry.lessons) {
      l.hitCount++;
    }
    await this.backend.set(key, entry);
    return entry.lessons.map((l) => ({ ...l }));
  }

  private upsertLesson(lessons: Lesson[], lesson: Lesson): void {
    const idx = lessons.findIndex((l) => l.pattern === lesson.pattern);
    if (idx >= 0) {
      lessons[idx] = lesson;
    } else {
      lessons.push(lesson);
    }
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  async set(key: string, lesson: Lesson): Promise<void> {
    return this.withLock(key, async () => {
      const existing = await this.backend.get(key);
      if (existing) {
        this.upsertLesson(existing.lessons, lesson);
        existing.updatedAt = this.nowIso();
        try { await this.backend.set(key, existing); } catch { /* ignore */ }
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: this.nowIso(),
        };
        try { await this.backend.set(key, entry); } catch { /* ignore */ }
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
    const files = await this.backend.list();
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
