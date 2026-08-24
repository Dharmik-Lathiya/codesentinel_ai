import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LearningCache, buildCacheKey, type Lesson } from "../src/opencode/cache.js";

function tmpCache(): { cache: LearningCache; dir: string } {
  const dir = join(tmpdir(), `codesentinel-cache-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  const cache = new LearningCache(dir);
  return { cache, dir };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    pattern: "missing-error-handling",
    filePattern: "**/*.ts",
    lesson: "Always handle promise rejections",
    severity: "critical",
    createdAt: new Date().toISOString(),
    hitCount: 0,
    ...overrides,
  };
}

describe("buildCacheKey", () => {
  it("produces consistent hashes for same input", () => {
    const a = buildCacheKey("src/foo.ts", "missing-error-handling");
    const b = buildCacheKey("src/foo.ts", "missing-error-handling");
    expect(a).toBe(b);
  });

  it("produces different hashes for different file paths", () => {
    const a = buildCacheKey("src/foo.ts", "missing-error-handling");
    const b = buildCacheKey("src/bar.ts", "missing-error-handling");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different patterns", () => {
    const a = buildCacheKey("src/foo.ts", "missing-error-handling");
    const b = buildCacheKey("src/foo.ts", "insecure-crypto");
    expect(a).not.toBe(b);
  });

  it("returns a 16-character hex string", () => {
    const key = buildCacheKey("src/foo.ts", "missing-error-handling");
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("LearningCache", () => {
  let cache: LearningCache;
  let dir: string;

  beforeEach(() => {
    const ctx = tmpCache();
    cache = ctx.cache;
    dir = ctx.dir;
  });

  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("set then get returns the lesson", async () => {
    const key = buildCacheKey("src/app.ts", "missing-error-handling");
    const lesson = makeLesson();
    await cache.set(key, lesson);
    const result = await cache.get(key);
    expect(result).toHaveLength(1);
    expect(result[0].pattern).toBe("missing-error-handling");
    expect(result[0].lesson).toBe("Always handle promise rejections");
    expect(result[0].severity).toBe("critical");
  });

  it("get for non-existent key returns empty array", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toEqual([]);
  });

  it("multiple lessons under same key", async () => {
    const key = buildCacheKey("src/app.ts", "multiple");
    const lesson1 = makeLesson({ pattern: "missing-error-handling", lesson: "Handle errors" });
    const lesson2 = makeLesson({ pattern: "insecure-crypto", lesson: "Use safe crypto", severity: "important" });
    await cache.set(key, lesson1);
    await cache.set(key, lesson2);
    const result = await cache.get(key);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.pattern).sort()).toEqual(["insecure-crypto", "missing-error-handling"]);
  });

  it("getAll returns all lessons", async () => {
    const key1 = buildCacheKey("src/a.ts", "pattern-a");
    const key2 = buildCacheKey("src/b.ts", "pattern-b");
    await cache.set(key1, makeLesson({ pattern: "pattern-a", lesson: "Lesson A" }));
    await cache.set(key2, makeLesson({ pattern: "pattern-b", lesson: "Lesson B" }));
    const all = await cache.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((l) => l.pattern).sort()).toEqual(["pattern-a", "pattern-b"]);
  });

  it("getStats returns correct counts", async () => {
    const key1 = buildCacheKey("src/a.ts", "pattern-a");
    const key2 = buildCacheKey("src/b.ts", "pattern-b");
    await cache.set(key1, makeLesson({ pattern: "pattern-a" }));
    await cache.set(key2, makeLesson({ pattern: "pattern-b" }));
    await cache.set(key2, makeLesson({ pattern: "pattern-c" }));
    const stats = await cache.getStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalLessons).toBe(3);
  });

  it("concurrent set operations", async () => {
    const key = buildCacheKey("src/app.ts", "concurrent");
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cache.set(key, makeLesson({ pattern: `pattern-${i}`, lesson: `Lesson ${i}` })));
    }
    await Promise.all(promises);
    const result = await cache.get(key);
    expect(result).toHaveLength(10);
    const patterns = result.map((l) => l.pattern).sort();
    expect(patterns).toEqual(Array.from({ length: 10 }, (_, i) => `pattern-${i}`));
  });

  it("clear removes all data", async () => {
    const key = buildCacheKey("src/a.ts", "pattern-a");
    await cache.set(key, makeLesson());
    expect(await cache.get(key)).toHaveLength(1);
    await cache.clear();
    expect(await cache.get(key)).toEqual([]);
    expect(await cache.getStats()).toEqual({ totalEntries: 0, totalLessons: 0 });
  });

  it("hitCount increments on each get", async () => {
    const key = buildCacheKey("src/app.ts", "hitcount");
    const lesson = makeLesson({ pattern: "hitcount", hitCount: 0 });
    await cache.set(key, lesson);
    await cache.get(key);
    await cache.get(key);
    const result = await cache.get(key);
    expect(result[0].hitCount).toBe(3);
  });

  it("updates existing lesson with same pattern", async () => {
    const key = buildCacheKey("src/app.ts", "update");
    await cache.set(key, makeLesson({ pattern: "dup", lesson: "Original" }));
    await cache.set(key, makeLesson({ pattern: "dup", lesson: "Updated" }));
    const result = await cache.get(key);
    expect(result).toHaveLength(1);
    expect(result[0].lesson).toBe("Updated");
  });
});
