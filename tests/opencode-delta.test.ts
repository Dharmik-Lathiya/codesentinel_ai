import { describe, it, expect } from "vitest";
import { buildDeltaContext, mergeDeltas, type FixIteration } from "../src/opencode/delta.js";

describe("buildDeltaContext", () => {
  it("returns empty string for empty history", () => {
    expect(buildDeltaContext([])).toBe("");
  });

  it("formats a single iteration correctly", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/test.ts", fixed: false, explanation: "Could not parse response", verified: false },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("<previous_attempts>");
    expect(result).toContain("</previous_attempts>");
    expect(result).toContain("Attempt 1 on src/test.ts:");
    expect(result).toContain("Previous fix: no diff");
    expect(result).toContain("Result: Could not parse response");
    expect(result).toContain("Verification: failed");
    expect(result).toContain("Do NOT repeat the same fixes");
  });

  it("formats multiple iterations with separator", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/a.ts", fixed: false, explanation: "Syntax error", verified: false },
      { iteration: 2, file: "src/a.ts", fixed: true, explanation: "Fixed syntax", verified: true, diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-foo\n+bar" },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("Attempt 1 on src/a.ts:");
    expect(result).toContain("Attempt 2 on src/a.ts:");
    expect(result).toContain("---");
    expect(result).toContain("Previous fix: --- a/src/a.ts");
    expect(result).toContain("Verification: passed");
  });

  it("handles diff field", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/test.ts", fixed: true, explanation: "Fixed", verified: true, diff: "diff --git a/src/test.ts b/src/test.ts\nindex abc..def 100644\n--- a/src/test.ts\n+++ b/src/test.ts\n@@ -1 +1 @@\n-old\n+new" },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("diff --git a/src/test.ts");
  });

  it("handles previousResult field", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/test.ts", fixed: false, explanation: "Fallback explanation", verified: false, previousResult: "AI returned invalid JSON" },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("Result: AI returned invalid JSON");
    expect(result).not.toContain("Fallback explanation");
  });

  it("handles missing optional fields gracefully", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/test.ts", fixed: true, explanation: "Fixed", verified: true },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("Previous fix: no diff");
    expect(result).toContain("INSTRUCTIONS:");
  });

  it("handles verified=true shows passed", () => {
    const history: FixIteration[] = [
      { iteration: 1, file: "src/test.ts", fixed: true, explanation: "Fixed", verified: true, diff: "patch content" },
    ];
    const result = buildDeltaContext(history);
    expect(result).toContain("Verification: passed");
  });
});

describe("mergeDeltas", () => {
  it("returns newDelta when existing is empty", () => {
    expect(mergeDeltas("", "new delta")).toBe("new delta");
  });

  it("returns existing when newDelta is empty", () => {
    expect(mergeDeltas("existing delta", "")).toBe("existing delta");
  });

  it("concatenates with separator", () => {
    const result = mergeDeltas("first delta", "second delta");
    expect(result).toBe("first delta\n---\nsecond delta");
  });

  it("handles both strings empty", () => {
    expect(mergeDeltas("", "")).toBe("");
  });
});
