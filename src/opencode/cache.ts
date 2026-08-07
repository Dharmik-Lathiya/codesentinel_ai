import { createHash } from "node:crypto";
import { readFile, writeFile, rename, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../utils/logger.js";

const HASH_KEY_LENGTH = 16;
const LOCK_TIMEOUT_MS = 30000;

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
    .slice(0, HASH_KEY_LENGTH);
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
    private static LOCK_TIMEOUT = LOCK_TIMEOUT_MS;

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
    let entry: CacheEntry | null = null;
    try {
      entry = await this.backend.get(key);
    } catch {
      return [];
    }
    if (!entry) return [];
    entry.lessons.forEach((l) => l.hitCount++);
    await this.backend.set(key, entry);
    return entry.lessons.map((l) => ({ ...l }));
  }

  async set(key: string, lesson: Lesson): Promise<void> {
    return this.withLock(key, async () => {
      const entry: CacheEntry = (await this.backend.get(key)) ?? {
        key,
        lessons: [],
        updatedAt: new Date().toISOString(),
      };
      const idx = entry.lessons.findIndex((l) => l.pattern === lesson.pattern);
      if (idx >= 0) {
        entry.lessons[idx] = lesson;
      } else {
        entry.lessons.push(lesson);
      }
      entry.updatedAt = new Date().toISOString();
      try { await this.backend.set(key, entry); } catch { /* ignore */ }
    });
  }

  async getAll(): Promise<Lesson[]> {
    const files: string[] = await this.backend.list().catch(() => []);
    const entries = await Promise.all(files.map((file) => this.loadEntry(file)));
    const lessons: Lesson[] = [];
    for (const entry of entries) {
      if (entry) lessons.push(...entry.lessons.map((l) => ({ ...l })));
    }
    return lessons;
  }

  private async loadEntry(file: string): Promise<CacheEntry | null> {
    try {
      return await this.backend.get(file.replace(/\.json$/, ""));
    } catch {
      return null;
    }
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
    const entries = await Promise.all(files.map((file) => this.loadEntry(file)));
    let totalLessons = 0;
    for (const entry of entries) {
      if (entry) totalLessons += entry.lessons.length;
    }
    return { totalEntries: files.length, totalLessons };
  }
}
