import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { Engine } from "../src/engine/index.js";
import { loadConfig } from "../src/config/index.js";
import { mergeConfig, DEFAULT_CONFIG } from "../src/config/defaults.js";
import type { CodeSentinelConfig } from "../src/config/types.js";

/** Minimal fake AI that returns valid JSON shapes per task. */
function fakeAI() {
  return {
    modelForTask: () => ({ provider: "opencode", model: "x" }),
    complete: async (task: string) => {
      if (task === "score") {
        return {
          content: JSON.stringify({
            readability: 70,
            maintainability: 65,
            security: 90,
            test_coverage: 55,
            rationale: "ai",
          }),
          model: "x",
          provider: "opencode",
        };
      }
      if (task === "review") {
        return {
          content: JSON.stringify({
            findings: [
              {
                severity: "medium",
                category: "bug",
                file: "src/app.ts",
                line: 3,
                comment: "Possible null deref.",
                suggestion: "Add a guard.",
              },
            ],
          }),
          model: "x",
          provider: "opencode",
        };
      }
      if (task === "audit") {
        return {
          content: JSON.stringify({
            summary: "Audit ok",
            findings: [
              {
                severity: "low",
                category: "architecture",
                title: "God module",
                file: "src/app.ts",
                description: "Too much in one file.",
                recommendation: "Split modules.",
              },
            ],
          }),
          model: "x",
          provider: "opencode",
        };
      }
      return { content: "{}", model: "x", provider: "opencode" };
    },
  };
}

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "codesentinel-"));
  mkdirSync(join(root, "src"), { recursive: true });

  // Initialize a git repo with a `main` base commit and a `feature` branch
  // that diverges, so review/fix can collect a real diff.
  execSync("git init -q && git checkout -q -b main", { cwd: root });
  execSync('git config user.email "test@test.local" && git config user.name "test"', {
    cwd: root,
  });
  writeFileSync(
    join(root, "src", "app.ts"),
    "export function add(a: number, b: number) {\n  return a + b\n}\n",
  );
  writeFileSync(
    join(root, "src", "app.test.ts"),
    "import { add } from './app'\ntest('add', () => { expect(add(1,2)).toBe(3) })\n",
  );
  execSync("git add -A && git commit -q -m base", { cwd: root });

  // Diverge on feature and modify the file so a diff exists.
  execSync("git checkout -q -b feature", { cwd: root });
  writeFileSync(
    join(root, "src", "app.ts"),
    "export function add(a: number, b: number) {\n  return a + b // changed\n}\n",
  );
  execSync("git add -A && git commit -q -m change", { cwd: root });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("config loading", () => {
  it("merges overrides onto defaults", () => {
    const merged: CodeSentinelConfig = mergeConfig(DEFAULT_CONFIG, {
      mode: "audit",
      max_iterations: 3,
    });
    expect(merged.mode).toBe("audit");
    expect(merged.max_iterations).toBe(3);
    expect(merged.enable_scoring).toBe(DEFAULT_CONFIG.enable_scoring);
  });

  it("parses a JSON config file", () => {
    const cfgPath = join(root, "cfg.json");
    writeFileSync(cfgPath, JSON.stringify({ mode: "score" }));
    const cfg = loadConfig({ configPath: cfgPath });
    expect(cfg.mode).toBe("score");
  });
});

describe("Engine flow", () => {
  it("score mode returns a 0-100 score with breakdown", async () => {
    const engine = new Engine(
      loadConfig({ overrides: { mode: "score", enable_cache: false } }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("score");
    expect(report.score).not.toBeNull();
    expect(report.score!.overall).toBeGreaterThanOrEqual(0);
    expect(report.score!.overall).toBeLessThanOrEqual(100);
  });

  it("review mode merges static and AI findings", async () => {
    const engine = new Engine(
      loadConfig({ overrides: { mode: "review", enable_cache: false } }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("review");
    // at least one AI finding (medium bug)
    expect(report.findings.some((f) => f.category === "bug")).toBe(true);
    expect(report.comments.length).toBeGreaterThan(0);
  });

  it("audit mode produces categories and summary", async () => {
    const engine = new Engine(
      loadConfig({ overrides: { mode: "audit", enable_cache: false } }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("audit");
    expect(report.summary).toContain("Audit");
    expect(report.findings.some((f) => f.category === "architecture")).toBe(true);
  });

  it("respects max_iterations in fix mode loop", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "fix",
          enable_cache: false,
          enable_auto_fix: false,
          max_iterations: 2,
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("fix");
    expect(report.fixAttempts.length).toBeLessThanOrEqual(2);
  });
});
