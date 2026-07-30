import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
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
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch {
      // ignore - directory may already exist
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

  constructor(backendOrDir?: CacheBackend | string) {
    if (!backendOrDir || typeof backendOrDir === "string") {
      this.backend = new FileSystemBackend(backendOrDir ?? ".codesentinel-cache/learnings/");
    } else {
      this.backend = backendOrDir;
    }
  }

  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next);
    next.finally(() => {
      if (this.locks.get(key) === next) this.locks.delete(key);
    });
    return next;
  }

  async get(key: string): Promise<Lesson[]> {
    return this.withLock(key, async () => {
      const entry = await this.backend.get(key);
      if (!entry) return [];
      entry.lessons.forEach((l) => l.hitCount++);
      await this.backend.set(key, entry);
      return entry.lessons.map((l) => ({ ...l }));
    });
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
        try {
          await this.backend.set(key, existing);
        } catch (err) {
          logger.warn(`Failed to persist updated cache entry ${key}:`, err);
        }
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: new Date().toISOString(),
        };
        try {
          await this.backend.set(key, entry);
        } catch (err) {
          logger.warn(`Failed to persist new cache entry ${key}:`, err);
        }
      }
    });
  }

  async getAll(): Promise<Lesson[]> {
    let files: string[];
    try {
      files = await this.backend.list();
    } catch {
      return [];
    }
    const lessons: Lesson[] = [];
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      try {
        const entry = await this.backend.get(key);
        if (entry) lessons.push(...entry.lessons.map((l) => ({ ...l })));
      } catch {
        // skip
      }
    }
    return lessons;
  }

  async clear(): Promise<void> {
    let files: string[];
    try {
      files = await this.backend.list();
    } catch {
      return;
    }
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      try {
        await this.backend.remove(key);
      } catch {
        // best-effort
      }
    }
  }

  async getStats(): Promise<{ totalEntries: number; totalLessons: number }> {
    let files: string[];
    try {
      files = await this.backend.list();
    } catch {
      return { totalEntries: 0, totalLessons: 0 };
    }
    let totalLessons = 0;
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      try {
        const entry = await this.backend.get(key);
        if (entry) totalLessons += entry.lessons.length;
      } catch {
        // skip entry on error
      }
    }
    return { totalEntries: files.length, totalLessons };
  }
}
