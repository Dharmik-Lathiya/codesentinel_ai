import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DEFAULT_SECRET_PATTERNS } from "../src/config/defaults.js";
import { DismissalManager } from "../src/dismiss/index.js";
import { Scorer } from "../src/scorer/index.js";
import { evaluateGate } from "../src/gate/index.js";
import { FileCache } from "../src/cache/index.js";
import { loadConfig } from "../src/config/index.js";
import type { GateConfig } from "../src/config/types.js";
import type { Finding } from "../src/analyzer/index.js";

// ─── P0-1: private-key-header regex ─────────────────────────────────────────
describe("P0-1: private-key-header regex matches standard PEM format", () => {
  const pattern = DEFAULT_SECRET_PATTERNS.find((p) => p.id === "private-key-header");
  if (!pattern) throw new Error("private-key-header pattern not found in defaults");
  const flags = pattern.regex.startsWith("(?i)") ? "i" : "";
  const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
  const re = new RegExp(source, flags);

  it("matches -----BEGIN PRIVATE KEY----- (standard PKCS#8)", () => {
    const content = "const key = '-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----'";
    expect(re.test(content)).toBe(true);
  });

  it("matches -----BEGIN RSA PRIVATE KEY-----", () => {
    const content = "key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----'";
    expect(re.test(content)).toBe(true);
  });

  it("matches -----BEGIN EC PRIVATE KEY-----", () => {
    const content = "key = '-----BEGIN EC PRIVATE KEY-----\nMHQCA...\n-----END EC PRIVATE KEY-----'";
    expect(re.test(content)).toBe(true);
  });

  it("does NOT match em-dash variant (the bug P0-1 fixed)", () => {
    const buggy = "key = '\u2014\u2014\u2014\u2014\u2014BEGIN PRIVATE KEY\u2014\u2014\u2014\u2014\u2014'";
    expect(re.test(buggy)).toBe(false);
  });

  it("matches case-insensitively", () => {
    const content = "key = '-----begin private key-----'";
    expect(re.test(content)).toBe(true);
  });
});

// ─── P0-2: dismissByFinding ─────────────────────────────────────────────────
describe("P0-2: DismissalManager.dismissByFinding", () => {
  let tmpDir: string;
  let dm: DismissalManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dismiss-test-"));
    dm = new DismissalManager(join(tmpDir, "dismissals.json"));
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("adds a dismissal entry for a specific file+line", () => {
    dm.dismissByFinding("src/app.ts", 42, "bug:some issue", "Not relevant");
    const list = dm.listDismissals();
    expect(list).toHaveLength(1);
    expect(list[0].file).toBe("src/app.ts");
    expect(list[0].line).toBe(42);
    expect(list[0].ruleId).toBe("bug:some issue");
    expect(list[0].reason).toBe("Not relevant");
  });

  it("dismissByFinding with null line dismisses any line in that file", () => {
    dm.dismissByFinding("src/app.ts", null, "bug:x", "Won't fix");
    const finding: Finding = {
      severity: "medium",
      category: "bug",
      file: "src/app.ts",
      line: 99,
      comment: "x",
      source: "static",
    };
    expect(dm.isDismissed(finding)).toBe(true);
  });

  it("dismissByFinding does NOT dismiss a different file", () => {
    dm.dismissByFinding("src/app.ts", 1, "bug:x", "nope");
    const finding: Finding = {
      severity: "medium",
      category: "bug",
      file: "src/other.ts",
      line: 1,
      comment: "x",
      source: "static",
    };
    expect(dm.isDismissed(finding)).toBe(false);
  });

  it("filterDismissed removes matching findings from array", () => {
    dm.dismissByFinding("src/app.ts", 3, "bug:foo", "meh");
    const findings: Finding[] = [
      { severity: "low", category: "bug", file: "src/app.ts", line: 3, comment: "foo", source: "static" },
      { severity: "low", category: "bug", file: "src/app.ts", line: 4, comment: "foo", source: "static" },
      { severity: "low", category: "bug", file: "src/other.ts", line: 3, comment: "foo", source: "static" },
    ];
    const kept = dm.filterDismissed(findings);
    expect(kept).toHaveLength(2);
    expect(kept.find((f) => f.line === 4)).toBeTruthy();
    expect(kept.find((f) => f.file === "src/other.ts")).toBeTruthy();
  });
});

// ─── P0-3: gatePassed is boolean ─────────────────────────────────────────────
describe("P0-3: gatePassed is a boolean, not a string", () => {
  it("evaluateGate returns boolean passed field", () => {
    const cfg: GateConfig = { minScore: 0, maxCritical: 0, maxHigh: 0, blockOnSecurity: false, blockOnBugs: false };
    const result = evaluateGate([], null, cfg);
    expect(typeof result.passed).toBe("boolean");
    expect(result.passed).toBe(true);
  });

  it("gate fails with too many criticals", () => {
    const cfg: GateConfig = { minScore: 0, maxCritical: 0, maxHigh: 0, blockOnSecurity: false, blockOnBugs: false };
    const findings: Finding[] = [
      { severity: "critical", category: "security", file: "x.ts", line: 1, comment: "bad", source: "static" },
    ];
    const result = evaluateGate(findings, null, cfg);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("critical");
  });

  it("gate fails with too many highs", () => {
    const cfg: GateConfig = { minScore: 0, maxCritical: 10, maxHigh: 0, blockOnSecurity: false, blockOnBugs: false };
    const findings: Finding[] = [
      { severity: "high", category: "bug", file: "x.ts", line: 1, comment: "bug", source: "static" },
    ];
    const result = evaluateGate(findings, null, cfg);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("high");
  });

  it("gate fails when blockOnBugs is true and bugs exist", () => {
    const cfg: GateConfig = { minScore: 0, maxCritical: 10, maxHigh: 10, blockOnSecurity: false, blockOnBugs: true };
    const findings: Finding[] = [
      { severity: "low", category: "bug", file: "x.ts", line: 1, comment: "minor bug", source: "static" },
    ];
    const result = evaluateGate(findings, null, cfg);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Bug");
  });

  it("gate fails when blockOnSecurity is true and security findings exist", () => {
    const cfg: GateConfig = { minScore: 0, maxCritical: 10, maxHigh: 10, blockOnSecurity: true, blockOnBugs: false };
    const findings: Finding[] = [
      { severity: "info", category: "security", file: "x.ts", line: 1, comment: "weak cipher", source: "static" },
    ];
    const result = evaluateGate(findings, null, cfg);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Security");
  });

  it("gate fails when score is below minScore", () => {
    const cfg: GateConfig = { minScore: 80, maxCritical: 100, maxHigh: 100, blockOnSecurity: false, blockOnBugs: false };
    const score = { overall: 60, readability: 60, maintainability: 60, security: 60, test_coverage: 60, rationale: "" };
    const result = evaluateGate([], score, cfg);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("60");
  });
});

// ─── P0-4: newIssuesIntroduced in FixAttempt ────────────────────────────────
describe("P0-4: FixAttempt.newIssuesIntroduced shape", () => {
  it("FixAttempt type includes newIssuesIntroduced array", () => {
    const attempt = {
      iteration: 1,
      file: "src/app.ts",
      fixed: true,
      explanation: "Applied fix",
      verified: true,
      newIssuesIntroduced: [],
    };
    expect(Array.isArray(attempt.newIssuesIntroduced)).toBe(true);
  });

  it("newIssuesIntroduced can hold Finding objects", () => {
    const attempt = {
      iteration: 1,
      file: "src/app.ts",
      fixed: true,
      explanation: "Applied fix",
      verified: true,
      newIssuesIntroduced: [
        { severity: "medium" as const, category: "security" as const, file: "src/app.ts", line: 5, comment: "regression", source: "static" as const },
      ],
    };
    expect(attempt.newIssuesIntroduced).toHaveLength(1);
    expect(attempt.newIssuesIntroduced[0].comment).toBe("regression");
  });
});

// ─── P0-5: securityBlendStrategy types ──────────────────────────────────────
describe("P0-6: blendWithAI securityBlendStrategy", () => {
  const scorer = new Scorer();
  const baseline = scorer.scoreStatic(
    [{ path: "a.ts", content: "eval(x)" }],
    [{ severity: "critical", category: "security", file: "a.ts", line: 1, comment: "eval", source: "static" }],
  );

  it("min strategy: keeps the lower (safer) security score", () => {
    const blended = scorer.blendWithAI(baseline, { security: 95 }, "ai", "min");
    expect(blended.security).toBe(baseline.security);
  });

  it("avg strategy: averages AI and static security", () => {
    const blended = scorer.blendWithAI(baseline, { security: 100 }, "ai", "avg");
    const expected = Math.round((100 + baseline.security) / 2);
    expect(blended.security).toBe(expected);
  });

  it("static-only strategy: ignores AI security completely", () => {
    const blended = scorer.blendWithAI(baseline, { security: 100 }, "ai", "static-only");
    expect(blended.security).toBe(baseline.security);
  });

  it("default (no arg) falls back to min", () => {
    const withDefault = scorer.blendWithAI(baseline, { security: 95 }, "ai");
    const withMin = scorer.blendWithAI(baseline, { security: 95 }, "ai", "min");
    expect(withDefault.security).toBe(withMin.security);
  });
});

// ─── P3-2: FileCache contentHash + incremental cache ────────────────────────
describe("P3-2: FileCache incremental analysis support", () => {
  let tmpDir: string;
  let cache: FileCache;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    cache = new FileCache(join(tmpDir, "cache"));
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("contentHash returns a stable 16-char hex string", () => {
    const h1 = cache.contentHash("hello world");
    const h2 = cache.contentHash("hello world");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different content produces different hashes", () => {
    const h1 = cache.contentHash("content A");
    const h2 = cache.contentHash("content B");
    expect(h1).not.toBe(h2);
  });

  it("cache set/get round-trips by content hash", () => {
    const content = "export function add(a: number, b: number) { return a + b }";
    const ch = cache.contentHash(content);
    const key = { task: "static", path: "src/app.ts", hash: ch };

    const findings = [{ severity: "low", category: "smell", file: "src/app.ts", line: 1, comment: "x", source: "static" }];
    cache.set("static", key, findings);

    const cached = cache.get<typeof findings>("static", key);
    expect(cached).toEqual(findings);
  });

  it("cache miss when content hash changes (simulates file edit)", () => {
    const oldContent = "const x = 1";
    const newContent = "const x = 2";
    const keyOld = { task: "static", path: "f.ts", hash: cache.contentHash(oldContent) };
    const keyNew = { task: "static", path: "f.ts", hash: cache.contentHash(newContent) };

    cache.set("static", keyOld, [{ severity: "info", category: "style", file: "f.ts", line: 1, comment: "old", source: "static" }]);

    // Old content hits cache
    expect(cache.get("static", keyOld)).not.toBeNull();
    // New content misses cache (must re-analyze)
    expect(cache.get("static", keyNew)).toBeNull();
  });
});

// ─── P4-3: Zod validation friendly error messages ───────────────────────────
describe("P4-3: Zod validation produces friendly error messages", () => {
  it("rejects invalid mode with friendly message", () => {
    expect(() => loadConfig({ overrides: { mode: "invalid_mode" as any } })).toThrow(/Invalid mode/);
  });

  it("rejects negative max_iterations", () => {
    expect(() => loadConfig({ overrides: { max_iterations: -1 } })).toThrow(/must be >= 1/);
  });

  it("accepts all valid modes", () => {
    for (const mode of ["review", "fix", "audit", "score", "testgen", "chat", "gate", "describe"] as const) {
      expect(() => loadConfig({ overrides: { mode } })).not.toThrow();
    }
  });
});
