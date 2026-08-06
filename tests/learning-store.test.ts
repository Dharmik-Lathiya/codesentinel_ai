import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LearningStore } from "../src/learning/store.js";

describe("LearningStore", () => {
  let store: LearningStore;

  beforeEach(async () => {
    store = new LearningStore(":memory:");
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it("initializes and records a finding", async () => {
    const id = await store.recordFinding({
      file: "src/app.ts",
      line: 10,
      severity: "high",
      category: "security",
      message: "Hardcoded secret",
      suggestion: "Use env vars",
      source: "ai",
    });
    expect(id).toBeTruthy();
    expect(id).toMatch(/^cs_\d+_/);

    const findings = await store.getFindings();
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("src/app.ts");
    expect(findings[0].line).toBe(10);
    expect(findings[0].severity).toBe("high");
    expect(findings[0].message).toBe("Hardcoded secret");
  });

  it("returns empty findings when nothing recorded", async () => {
    const f = await store.getFindings();
    expect(f).toEqual([]);
  });

  it("respects limit in getFindings", async () => {
    for (let i = 0; i < 10; i++) {
      await store.recordFinding({ file: `${i}.ts`, severity: "low", category: "style", message: `issue ${i}` });
    }
    expect((await store.getFindings(3))).toHaveLength(3);
    expect((await store.getFindings(100))).toHaveLength(10);
  });

  it("records feedback for a finding", async () => {
    const id = await store.recordFinding({ file: "f.ts", severity: "low", category: "bug", message: "msg" });
    await store.recordFeedback(id, "false_positive", "Not a bug");
    const rate = await store.getFalsePositiveRate();
    expect(rate).toBeGreaterThan(0);
  });

  it("returns zero false positive rate when no feedback", async () => {
    expect(await store.getFalsePositiveRate()).toBe(0);
  });

  it("returns empty high-FP rules when no feedback", async () => {
    expect(await store.getHighFalsePositiveRules()).toEqual([]);
  });

  it("returns high-FP rules correctly", async () => {
    const id1 = await store.recordFinding({ file: "a.ts", severity: "high", category: "sec", message: "issue1" });
    const id2 = await store.recordFinding({ file: "b.ts", severity: "high", category: "sec", message: "issue2" });

    for (let i = 0; i < 3; i++) await store.recordFeedback(id1, "false_positive");
    await store.recordFeedback(id2, "accurate");

    const rules = await store.getHighFalsePositiveRules(3, 0.8);
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleId).toBe(id1);
    expect(rules[0].fpRate).toBe(1);
  });

  it("returns relevant lessons by file extension", async () => {
    await store.recordFinding({ file: "test.ts", severity: "high", category: "sec", message: "SQL injection" });
    await store.recordFinding({ file: "other.ts", severity: "info", category: "style", message: "Extra semicolon" });

    const tsLessons = await store.getRelevantLessons("ts");
    expect(tsLessons).toContain("SQL injection");
    expect(tsLessons).toContain("Extra semicolon");

    const pyLessons = await store.getRelevantLessons("py");
    expect(pyLessons).toEqual([]);
  });

  it("records and increments pattern frequency", async () => {
    await store.recordPattern("console.log", "debug");
    await store.recordPattern("console.log", "debug");
    await store.recordPattern("debugger", "debug");

    const above = await store.getPatternsAboveThreshold(2);
    expect(above).toHaveLength(1);
    expect(above[0].pattern_text).toBe("console.log");
    expect(above[0].frequency).toBe(2);
  });

  it("returns empty patterns above high threshold", async () => {
    await store.recordPattern("log", "style");
    expect(await store.getPatternsAboveThreshold(100)).toEqual([]);
  });

  it("manages custom rules lifecycle", async () => {
    const id = await store.autoCreateRule("p1", "no-console", "console.log", "low", "style", "Avoid console", "Use logger");
    expect(id).toBeTruthy();

    const pending = await store.getPendingRules();
    expect(pending).toHaveLength(1);
    expect(pending[0].name).toBe("no-console");

    await store.approveRule(id!);
    expect(await store.getPendingRules()).toHaveLength(0);

    const dup = await store.autoCreateRule("p1", "dup", "console.log", "low", "style");
    expect(dup).toBeNull();
  });

  it("decline rule changes status", async () => {
    const id = await store.autoCreateRule("p1", "test-rule", "pattern", "low", "style");
    await store.declineRule(id!);
    const pending = await store.getPendingRules();
    expect(pending).toHaveLength(0);
  });

  it("manages prompt overrides", async () => {
    await store.createPromptOverride("review", "Be strict", "Quality enforcement");
    await store.createPromptOverride("review", "Check tests", "Coverage");
    await store.createPromptOverride("fix", "Minimal changes");

    const reviewOverrides = await store.getActivePromptOverrides("review");
    expect(reviewOverrides).toEqual(["Be strict", "Check tests"]);

    const fixOverrides = await store.getActivePromptOverrides("fix");
    expect(fixOverrides).toEqual(["Minimal changes"]);

    const none = await store.getActivePromptOverrides("score");
    expect(none).toEqual([]);
  });

  it("autoCreateRule links pattern to rule and excludes it from threshold query", async () => {
    await store.recordPattern("bad-pattern", "security");

    const before = await store.getPatternsAboveThreshold(1);
    expect(before).toHaveLength(1);
    const patternId = before[0].id;

    const ruleId = await store.autoCreateRule(patternId, "rule-name", "bad-pattern", "high", "security");
    expect(ruleId).toBeTruthy();

    const after = await store.getPatternsAboveThreshold(1);
    expect(after.find((p) => p.id === patternId)).toBeUndefined();
  });

  it("close is idempotent", async () => {
    await store.close();
    await store.close();
  });
});
