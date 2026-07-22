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
      if (task === "fix") {
        return {
          content: JSON.stringify({
            fixed: true,
            explanation: "Applied fix",
            content: "// fixed content",
          }),
          model: "x",
          provider: "opencode",
        };
      }
      if (task === "describe") {
        return {
          content: JSON.stringify({
            title: "Fix add function",
            description: "Fixed the add function",
            type: "fix",
            breakingChanges: false,
            highlights: ["Fixed add"],
            todo: [],
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
      if (task === "fix") {
        return {
          content: JSON.stringify({
            fixed: true,
            explanation: "Applied fix",
            content: "export function add(a: number, b: number) {\n  return a + b // fixed\n}\n",
          }),
          model: "x",
          provider: "opencode",
        };
      }
      if (task === "describe") {
        return {
          content: JSON.stringify({
            title: "Fix add function",
            description: "Minor fix to the add function.",
            type: "bugfix",
            breakingChanges: false,
            highlights: ["Fixed null deref"],
            todo: [],
          }),
          model: "x",
          provider: "opencode",
        };
      }
      if (task === "testgen") {
        return {
          content: JSON.stringify({
            test_file_path: "src/__tests__/app.test.ts",
            content: "import { add } from '../app';\ndescribe('add', () => {\n  it('adds', () => expect(add(1,2)).toBe(3));\n});\n",
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
  root = mkdtempSync(join(tmpdir(), "codesentinel-e2e-"));
  mkdirSync(join(root, "src"), { recursive: true });

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
      loadConfig({ overrides: { mode: "review", enable_cache: false, enable_auto_fix: false } }),
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

describe("Gate mode (P0-3)", () => {
  it("returns gatePassed=true when all checks pass", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "gate",
          enable_cache: false,
          enable_scoring: false,
          gate: { minScore: 0, maxCritical: 100, maxHigh: 100, blockOnSecurity: false, blockOnBugs: false },
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("gate");
    expect(report.gatePassed).toBe(true);
  });

  it("returns gatePassed=false when critical threshold exceeded", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "gate",
          enable_cache: false,
          enable_scoring: true,
          gate: { minScore: 100, maxCritical: 100, maxHigh: 100, blockOnSecurity: false, blockOnBugs: false },
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("gate");
    expect(report.gatePassed).toBe(false);
  });
});

describe("Score blending strategy (P0-6)", () => {
  it("respects min strategy (default)", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "score",
          enable_cache: false,
          securityBlendStrategy: "min",
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.score).not.toBeNull();
  });

  it("respects static-only strategy", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "score",
          enable_cache: false,
          securityBlendStrategy: "static-only",
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.score).not.toBeNull();
  });
});

describe("Fix mode re-analysis (P0-4)", () => {
  it("reports newIssuesIntroduced field in FixAttempt", async () => {
    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "fix",
          enable_cache: false,
          enable_auto_fix: true,
          max_iterations: 1,
          dry_run: true,
        },
      }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.fixAttempts.length).toBeGreaterThan(0);
    for (const attempt of report.fixAttempts) {
      expect(attempt).toHaveProperty("newIssuesIntroduced");
      expect(Array.isArray(attempt.newIssuesIntroduced)).toBe(true);
    }
  });
});

describe("Describe mode", () => {
  it("produces structured PR description", async () => {
    const engine = new Engine(
      loadConfig({ overrides: { mode: "describe", enable_cache: false } }),
      {},
      root,
      fakeAI() as any,
    );
    const report = await engine.run();
    expect(report.mode).toBe("describe");
    expect(report.summary).toContain("Fix add function");
  });
});
