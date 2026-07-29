import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync } from "node:fs";
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

  private ensureDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private filePath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  async get(key: string): Promise<CacheEntry | null> {
    const path = this.filePath(key);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
    } catch {
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.ensureDir();
    const target = this.filePath(key);
    const tmp = target + ".tmp." + process.pid;
    try {
      writeFileSync(tmp, JSON.stringify(entry), "utf8");
      renameSync(tmp, target);
    } catch (err) {
      logger.warn(`Failed to write cache entry ${key}:`, err);
      try { unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  async list(): Promise<string[]> {
    this.ensureDir();
    try {
      return readdirSync(this.cacheDir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
  }

  async remove(key: string): Promise<void> {
    try {
      unlinkSync(this.filePath(key));
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
    const entry = await this.backend.get(key);
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
        await this.backend.set(key, existing);
      } else {
        const entry: CacheEntry = {
          key,
          lessons: [lesson],
          updatedAt: new Date().toISOString(),
        };
        await this.backend.set(key, entry);
      }
    });
  }

  async getAll(): Promise<Lesson[]> {
    const files = await this.backend.list();
    const lessons: Lesson[] = [];
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      const entry = await this.backend.get(key);
      if (entry) lessons.push(...entry.lessons.map((l) => ({ ...l })));
    }
    return lessons;
  }

  async clear(): Promise<void> {
    const files = await this.backend.list();
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      await this.backend.remove(key);
    }
  }

  async getStats(): Promise<{ totalEntries: number; totalLessons: number }> {
    const files = await this.backend.list();
    let totalLessons = 0;
    for (const file of files) {
      const key = file.replace(/\.json$/, "");
      const entry = await this.backend.get(key);
      if (entry) totalLessons += entry.lessons.length;
    }
    return { totalEntries: files.length, totalLessons };
  }
}
