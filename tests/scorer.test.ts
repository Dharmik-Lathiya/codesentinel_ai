import { describe, it, expect } from "vitest";
import { Scorer, WEIGHTS } from "../src/scorer/index.js";

describe("Scorer", () => {
  it("produces a 0-100 overall score", () => {
    const scorer = new Scorer();
    const breakdown = scorer.scoreStatic(
      [{ path: "a.ts", content: "function a(){ return 1 }\n" }],
      [],
    );
    expect(breakdown.overall).toBeGreaterThanOrEqual(0);
    expect(breakdown.overall).toBeLessThanOrEqual(100);
  });

  it("penalizes security findings", () => {
    const scorer = new Scorer();
    const clean = scorer.scoreStatic(
      [{ path: "a.ts", content: "const x = 1" }],
      [],
    );
    const insecure = scorer.scoreStatic(
      [{ path: "a.ts", content: "eval(x)" }],
      [
        {
          severity: "critical",
          category: "security",
          file: "a.ts",
          line: 1,
          comment: "eval!",
          source: "static",
        },
      ],
    );
    expect(insecure.security).toBeLessThan(clean.security);
  });

  it("weights combine to the overall score", () => {
    const scorer = new Scorer();
    const b = scorer.finalize({
      readability: 80,
      maintainability: 60,
      security: 100,
      test_coverage: 40,
      rationale: "x",
    });
    const expected =
      80 * WEIGHTS.readability +
      60 * WEIGHTS.maintainability +
      100 * WEIGHTS.security +
      40 * WEIGHTS.test_coverage;
    expect(b.overall).toBe(Math.round(expected));
  });

  it("blendWithAI keeps the safer security score", () => {
    const scorer = new Scorer();
    const baseline = scorer.scoreStatic(
      [{ path: "a.ts", content: "eval(x)" }],
      [
        {
          severity: "critical",
          category: "security",
          file: "a.ts",
          line: 1,
          comment: "eval",
          source: "static",
        },
      ],
    );
    const blended = scorer.blendWithAI(
      baseline,
      { security: 95, readability: 70, maintainability: 70, test_coverage: 50 },
      "ai",
    );
    // Static says security is low; AI says high. We keep the more conservative.
    expect(blended.security).toBe(baseline.security);
  });

  it("clamps scores into range", () => {
    const scorer = new Scorer();
    const b = scorer.finalize({
      readability: 999,
      maintainability: -50,
      security: 50,
      test_coverage: 50,
      rationale: "x",
    });
    expect(b.readability).toBe(100);
    expect(b.maintainability).toBe(0);
  });
});
