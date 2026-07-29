import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
export function buildCacheKey(filePath, pattern) {
    return createHash("sha256")
        .update(filePath + "::" + pattern)
        .digest("hex")
        .slice(0, 16);
}
class FileSystemBackend {
    cacheDir;
    constructor(cacheDir) {
        this.cacheDir = cacheDir;
    }
    ensureDir() {
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    filePath(key) {
        return join(this.cacheDir, `${key}.json`);
    }
    async get(key) {
        const path = this.filePath(key);
        if (!existsSync(path))
            return null;
        try {
            return JSON.parse(readFileSync(path, "utf8"));
        }
        catch {
            return null;
        }
    }
    async set(key, entry) {
        this.ensureDir();
        const target = this.filePath(key);
        const tmp = target + ".tmp." + process.pid;
        try {
            writeFileSync(tmp, JSON.stringify(entry), "utf8");
            renameSync(tmp, target);
        }
        catch (err) {
            logger.warn(`Failed to write cache entry ${key}:`, err);
            try {
                unlinkSync(tmp);
            }
            catch { /* ignore */ }
        }
    }
    async list() {
        this.ensureDir();
        try {
            return readdirSync(this.cacheDir).filter((f) => f.endsWith(".json"));
        }
        catch {
            return [];
        }
    }
    async remove(key) {
        try {
            unlinkSync(this.filePath(key));
        }
        catch {
            // best-effort
        }
    }
}
export class LearningCache {
    backend;
    locks = new Map();
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
        const next = prev.then(fn, fn);
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
        entry.lessons.forEach((l) => l.hitCount++);
        await this.backend.set(key, entry);
        return entry.lessons.map((l) => ({ ...l }));
    }
    async set(key, lesson) {
        return this.withLock(key, async () => {
            const existing = await this.backend.get(key);
            if (existing) {
                const idx = existing.lessons.findIndex((l) => l.pattern === lesson.pattern);
                if (idx >= 0) {
                    existing.lessons[idx] = lesson;
                }
                else {
                    existing.lessons.push(lesson);
                }
                existing.updatedAt = new Date().toISOString();
                await this.backend.set(key, existing);
            }
            else {
                const entry = {
                    key,
                    lessons: [lesson],
                    updatedAt: new Date().toISOString(),
                };
                await this.backend.set(key, entry);
            }
        });
    }
    async getAll() {
        const files = await this.backend.list();
        const lessons = [];
        for (const file of files) {
            const key = file.replace(/\.json$/, "");
            const entry = await this.backend.get(key);
            if (entry)
                lessons.push(...entry.lessons.map((l) => ({ ...l })));
        }
        return lessons;
    }
    async clear() {
        const files = await this.backend.list();
        for (const file of files) {
            const key = file.replace(/\.json$/, "");
            await this.backend.remove(key);
        }
    }
    async getStats() {
        const files = await this.backend.list();
        let totalLessons = 0;
        for (const file of files) {
            const key = file.replace(/\.json$/, "");
            const entry = await this.backend.get(key);
            if (entry)
                totalLessons += entry.lessons.length;
        }
        return { totalEntries: files.length, totalLessons };
    }
}
//# sourceMappingURL=cache.js.map