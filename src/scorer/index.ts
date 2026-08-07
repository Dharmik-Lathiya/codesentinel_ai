import type { Severity, SecurityBlendStrategy } from "../config/types.js";
import type { Finding } from "../analyzer/index.js";

/** A quality score from 0 to {@link MAX_SCORE} with a weighted overall value. */
export interface ScoreBreakdown {
  readability: number;
  maintainability: number;
  security: number;
  test_coverage: number;
  /** Weighted overall score (0 to {@link MAX_SCORE}). */
  overall: number;
  rationale: string;
}

/** Weights used to combine the four dimensions into the overall score. */
const READABILITY_WEIGHT = 0.25;
const MAINTAINABILITY_WEIGHT = 0.3;
const SECURITY_WEIGHT = 0.25;
const TEST_COVERAGE_WEIGHT = 0.2;

export const WEIGHTS = {
  readability: READABILITY_WEIGHT,
  maintainability: MAINTAINABILITY_WEIGHT,
  security: SECURITY_WEIGHT,
  test_coverage: TEST_COVERAGE_WEIGHT,
} as const;

const MAX_SCORE = 100;

/** Lines longer than this are penalized as unreadable. */
const MAX_LINE_LENGTH = 120;
/** Points deducted per over-length line. */
const LONG_LINE_PENALTY = 2;
/** Points added per full unit of comment-to-code ratio. */
const COMMENT_BONUS = 20;
/** Floor so readability never scores below this. */
const MIN_READABILITY = 20;

const clamp = (n: number): number => Math.max(0, Math.min(MAX_SCORE, Math.round(n)));


const HIGH_SEVERITY_PENALTY = 16;
const CRITICAL_SEVERITY_PENALTY = 30;
/** Severity penalty weights applied to the security dimension. */
const SEVERITY_PENALTY: Record<Severity, number> = {
  info: 2,
  low: 4,
  medium: 8,
  high: HIGH_SEVERITY_PENALTY,
  critical: CRITICAL_SEVERITY_PENALTY,
};

/** True if a path points to a test or spec file. */
const isTestPath = (p: string): boolean =>
  /\.(test|spec)\.[jt]sx?$/.test(p) || /__tests__\//.test(p);

/**
 * Scorer computes a deterministic baseline quality score from static findings
 * and code metrics, and can blend in AI-provided sub-scores.
 */
export class Scorer {
  /**
   * Build a baseline score from static findings + simple code metrics.
   * This works fully offline and is deterministic.
   */
  scoreStatic(
    files: { path: string; content: string }[],
    findings: Finding[],
  ): ScoreBreakdown {
    const securityPenalty = findings
      .filter((f) => f.category === "security")
      .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);

    const smellPenalty = findings
      .filter((f) => f.category === "smell" || f.category === "style")
      .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity] / 2, 0);

    const security = clamp(MAX_SCORE - securityPenalty);
    const maintainability = clamp(MAX_SCORE - smellPenalty);

    // Readability proxy: long-line density and comment presence.
    const readability = clamp(this.readabilityMetric(files));

    // Test coverage proxy: ratio of source files that have a sibling test.
    const testCoverage = clamp(this.coverageMetric(files));

    return this.finalize({
      readability,
      maintainability,
      security,
      test_coverage: testCoverage,
      rationale:
        "Baseline score derived from static heuristics (security findings, " +
        "code smells, comment density, and test file presence).",
    });
  }

  /**
   * Blend an AI-provided sub-score breakdown with the static baseline. The AI
   * result is trusted more for subjective dimensions (readability), while
   * static analysis dominates security (it is more reliable there).
   */
  blendWithAI(
    baseline: ScoreBreakdown,
    ai: Partial<
      Pick<
        ScoreBreakdown,
        "readability" | "maintainability" | "security" | "test_coverage"
      >
    >,
    rationale: string,
    strategy: SecurityBlendStrategy = "min",
  ): ScoreBreakdown {
    const readability = ai.readability ?? baseline.readability;
    const maintainability = ai.maintainability ?? baseline.maintainability;
    let security: number;
    switch (strategy) {
      case "avg":
        security = Math.round(((ai.security ?? baseline.security) + baseline.security) / 2);
        break;
      case "static-only":
        security = baseline.security;
        break;
      case "min":
      default:
        // Keep the more conservative (lower) security number: static analysis
        // is more reliable for security, so we take the stricter assessment.
        security = Math.min(ai.security ?? MAX_SCORE, baseline.security);
        break;
    }
    const test_coverage = ai.test_coverage ?? baseline.test_coverage;
    return this.finalize({
      readability,
      maintainability,
      security,
      test_coverage,
      rationale,
    });
  }

  /** Compute the weighted overall and attach it to the breakdown. */
  finalize(b: Omit<ScoreBreakdown, "overall">): ScoreBreakdown {
    const readability = clamp(b.readability);
    const maintainability = clamp(b.maintainability);
    const security = clamp(b.security);
    const test_coverage = clamp(b.test_coverage);
    const overall = clamp(
      readability * WEIGHTS.readability +
        maintainability * WEIGHTS.maintainability +
        security * WEIGHTS.security +
        test_coverage * WEIGHTS.test_coverage,
    );
    return {
      readability,
      maintainability,
      security,
      test_coverage,
      overall,
      rationale: b.rationale,
    };
  }

  /** Readability heuristic: penalize very long lines and reward comments. */
  private readabilityMetric(
    files: { path: string; content: string }[],
  ): number {
    let total = 0;
    let fileCount = 0;
    for (const { content } of files) {
      fileCount++;
      const lines = content.split("\n");
      const commentLines = lines.filter(
        (l) => /^\s*(\/\/|#|\/\*|\*)/.test(l),
      ).length;
      const commentRatio = lines.length ? commentLines / lines.length : 0;
      const longLines = lines.filter((l) => l.length > MAX_LINE_LENGTH).length;
      const score =
        MAX_SCORE - longLines * LONG_LINE_PENALTY + commentRatio * COMMENT_BONUS;
      total += Math.max(MIN_READABILITY, score);
    }
    return fileCount ? total / fileCount : 100;
  }

  /** Coverage heuristic: fraction of source files that have a related test. */
  private coverageMetric(
    files: { path: string; content: string }[],
  ): number {
    const sourceFiles = files.filter((f) => !isTestPath(f.path));
    if (sourceFiles.length === 0) return MAX_SCORE;
    const testBases = new Set(
      files
        .filter((f) => isTestPath(f.path))
        .map((f) => f.path.replace(/\.(test|spec)\.[jt]sx?$/, "")),
    );
    let covered = 0;
    for (const f of sourceFiles) {
      const base = f.path.replace(/\.[^.]_+$/, "");
      if (
        testBases.has(base) ||
        [...testBases].some((tb) => tb.startsWith(base + "/"))
      ) {
        covered++;
      }
    }
    return (covered / sourceFiles.length) * MAX_SCORE;
  }
}
