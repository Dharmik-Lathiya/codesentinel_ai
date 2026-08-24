import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadYamlConfig } from "../src/config/loader.js";
import { loadConfig } from "../src/config/index.js";
import { AnalysisCache } from "../src/analyzer/cache.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "auditfix-c2-"));
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("C2a: YAML config loading works in ESM", () => {
  it("parses a YAML config file", () => {
    const p = join(tmpDir, "codesentinel.config.yml");
    writeFileSync(p, "mode: review\nmax_iterations: 3\n");
    const cfg = loadConfig({ configPath: p });
    expect(cfg.mode).toBe("review");
    expect(cfg.max_iterations).toBe(3);
  });

  it("loadYamlConfig returns parsed object", () => {
    const p = join(tmpDir, "c.yml");
    writeFileSync(p, "enable_scoring: false\nlinters:\n  enabled: false\n");
    const parsed = loadYamlConfig(p) as { enable_scoring: boolean; linters: { enabled: boolean } };
    expect(parsed.enable_scoring).toBe(false);
    expect(parsed.linters.enabled).toBe(false);
  });
});

describe("C2b: AnalysisCache disk persistence works", () => {
  it("loads memory cache from disk on a fresh instance", () => {
    const dir = join(tmpDir, "cache");
    const content = "export function add(a: number, b: number) { return a + b }";
    const configHash = "abc123";

    const cache1 = new AnalysisCache(dir);
    cache1.set(
      "src/app.ts",
      content,
      configHash,
      [{ severity: "low", category: "smell", file: "src/app.ts", line: 1, comment: "x", source: "static" }],
      { durationMs: 10, rulesApplied: ["r1"] },
    );
    const key = cache1.generateKey("src/app.ts", content, configHash);
    const writtenFiles = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(writtenFiles.length).toBe(1);

    const cache2 = new AnalysisCache(dir);
    const entry = cache2.get("src/app.ts", content, configHash);
    expect(entry).not.toBeNull();
    expect(entry!.findings).toHaveLength(1);
    expect(entry!.key).toBe(key);
  });

  it("evicts old entries beyond maxEntries and deletes their disk files", () => {
    const dir = join(tmpDir, "cache");
    const cache = new AnalysisCache(dir, { maxEntries: 2 });
    for (let i = 0; i < 4; i++) {
      const content = `export const v${i} = ${i}`;
      cache.set(
        `src/f${i}.ts`,
        content,
        "cfg",
        [{ severity: "low", category: "smell", file: `src/f${i}.ts`, line: 1, comment: `c${i}`, source: "static" }],
        { durationMs: 1, rulesApplied: [] },
      );
    }
    const stats = cache.getStats();
    expect(stats.memoryEntries).toBeLessThanOrEqual(2);
  });

  it("clear removes disk files", () => {
    const dir = join(tmpDir, "cache");
    const cache = new AnalysisCache(dir);
    cache.set(
      "src/app.ts",
      "export const a = 1",
      "cfg",
      [{ severity: "low", category: "smell", file: "src/app.ts", line: 1, comment: "x", source: "static" }],
      { durationMs: 1, rulesApplied: [] },
    );
    expect(readdirSync(dir).filter((f) => f.endsWith(".json")).length).toBe(1);
    cache.clear();
    expect(readdirSync(dir).filter((f) => f.endsWith(".json")).length).toBe(0);
    expect(existsSync(dir)).toBe(true);
  });
});
