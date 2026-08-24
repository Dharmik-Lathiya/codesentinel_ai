import { createHash } from "node:crypto";
import { readFile, writeFile, rename, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
export function buildCacheKey(filePath, pattern) {
    return createHash("sha256")
        .update(filePath + "::" + pattern)
        .digest("hex")
        .slice(0, 16);
}
function utcTimestamp() {
    return new Date(Date.now()).toISOString();
}
function upsertLesson(entry, lesson) {
    const idx = entry.lessons.findIndex((l) => l.pattern === lesson.pattern);
    if (idx >= 0) {
        entry.lessons[idx] = lesson;
    }
    else {
        entry.lessons.push(lesson);
    }
}
class FileSystemBackend {
    cacheDir;
    constructor(cacheDir) {
        this.cacheDir = cacheDir;
    }
    async ensureDir() {
        await mkdir(this.cacheDir, { recursive: true }).catch(() => { });
    }
    filePath(key) {
        return join(this.cacheDir, `${key}.json`);
    }
    async get(key) {
        const path = this.filePath(key);
        try {
            return JSON.parse(await readFile(path, "utf8"));
        }
        catch {
            return null;
        }
    }
    async set(key, entry) {
        await this.ensureDir();
        const target = this.filePath(key);
        const tmp = target + ".tmp." + process.pid;
        try {
            await writeFile(tmp, JSON.stringify(entry), "utf8");
            await rename(tmp, target);
        }
        catch (err) {
            logger.warn(`Failed to write cache entry ${key}:`, err);
            try {
                await unlink(tmp);
            }
            catch { /* ignore */ }
        }
    }
    async list() {
        await this.ensureDir();
        try {
            return (await readdir(this.cacheDir)).filter((f) => f.endsWith(".json"));
        }
        catch {
            return [];
        }
    }
    async remove(key) {
        try {
            await unlink(this.filePath(key));
        }
        catch {
            // best-effort
        }
    }
}
export class LearningCache {
    backend;
    locks = new Map();
    static LOCK_TIMEOUT = 30000;
    constructor(backendOrDir) {
        if (!backendOrDir || typeof backendOrDir === "string") {
            this.backend = new FileSystemBackend(backendOrDir ?? ".codesentinel-cache/learnings/");
        }
        else {
            this.backend = backendOrDir;
        }
    }
    withLock(key, fn) {
        const prev = this.locks.get(key) ?? Promise.resolve();
        const timedFn = () => {
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Lock timeout for key: ${key}`)), LearningCache.LOCK_TIMEOUT);
            });
            return Promise.race([fn(), timeout]).finally(() => clearTimeout(timer));
        };
        const next = prev.then(timedFn, timedFn);
        this.locks.set(key, next);
        next.finally(() => {
            if (this.locks.get(key) === next)
                this.locks.delete(key);
        });
        return next;
    }
    async get(key) {
        const entry = await this.backend.get(key);
        if (!entry)
            return [];
        for (const l of entry.lessons) {
            l.hitCount++;
        }
        await this.backend.set(key, entry);
        return entry.lessons.map((l) => ({ ...l }));
    }
    async set(key, lesson) {
        return this.withLock(key, async () => {
            const existing = await this.backend.get(key);
            if (!existing) {
                const entry = {
                    key,
                    lessons: [lesson],
                    updatedAt: utcTimestamp(),
                };
                try {
                    await this.backend.set(key, entry);
                }
                catch { /* ignore */ }
                return;
            }
            upsertLesson(existing, lesson);
            existing.updatedAt = utcTimestamp();
            try {
                await this.backend.set(key, existing);
            }
            catch { /* ignore */ }
        });
    }
    async getAll() {
        const files = await this.backend.list().catch(() => []);
        const entries = await Promise.all(files.map(async (file) => {
            const key = file.replace(/\.json$/, "");
            try {
                return await this.backend.get(key);
            }
            catch {
                return null;
            }
        }));
        const lessons = [];
        for (const entry of entries) {
            if (entry)
                lessons.push(...entry.lessons.map((l) => ({ ...l })));
        }
        return lessons;
    }
    async clear() {
        const files = await this.backend.list().catch(() => []);
        for (const file of files) {
            const key = file.replace(/\.json$/, "");
            await this.backend.remove(key);
        }
    }
    async getStats() {
        const files = await this.backend.list();
        const entries = await Promise.all(files.map(async (file) => {
            const key = file.replace(/\.json$/, "");
            try {
                return await this.backend.get(key);
            }
            catch {
                return null;
            }
        }));
        let totalLessons = 0;
        for (const entry of entries) {
            if (entry)
                totalLessons += entry.lessons.length;
        }
        return { totalEntries: files.length, totalLessons };
    }
}
//# sourceMappingURL=cache.js.map