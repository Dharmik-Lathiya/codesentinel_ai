import type { Severity } from "../config/types.js";
import type { Finding } from "../analyzer/index.js";

/** A 0-100 quality score with a weighted overall value. */
export interface ScoreBreakdown {
  readability: number;
  maintainability: number;
  security: number;
  test_coverage: number;
  /** Weighted overall score (0-100). */
  overall: number;
  rationale: string;
}

/** Weights used to combine the four dimensions into the overall score. */
export const WEIGHTS = {
  readability: 0.25,
  maintainability: 0.3,
  security: 0.25,
  test_coverage: 0.2,
} as const;

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Severity penalty weights applied to the security dimension. */
const SEVERITY_PENALTY: Record<Severity, number> = {
  info: 2,
  low: 4,
  medium: 8,
  high: 16,
  critical: 30,
};

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

    const security = clamp(100 - securityPenalty);
    const maintainability = clamp(100 - smellPenalty);

    // Readability proxy: average function length / comment presence.
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
  ): ScoreBreakdown {
    const readability = ai.readability ?? baseline.readability;
    const maintainability = ai.maintainability ?? baseline.maintainability;
    // Keep the more conservative (lower) security number: static analysis
    // is more reliable for security, so we take the stricter assessment.
    const security = Math.min(
      ai.security ?? 100,
      baseline.security,
    );
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
    return { readability, maintainability, security, test_coverage, overall, rationale: b.rationale };
  }

  /** Readability heuristic: penalize very long functions and reward comments. */
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
      const longLines = lines.filter((l) => l.length > 120).length;
      const score = 100 - longLines * 2 + commentRatio * 20;
      total += Math.max(20, score);
    }
    return fileCount ? total / fileCount : 100;
  }

  /** Coverage heuristic: fraction of source files that have a related test. */
  private coverageMetric(
    files: { path: string; content: string }[],
  ): number {
    const testPaths = new Set(
      files
        .map((f) => f.path)
        .filter((p) => /\.(test|spec)\./.test(p)),
    );
    const sourceFiles = files.filter((f) => !/\.(test|spec)\./.test(f.path));
    if (sourceFiles.length === 0) return 100;
    let covered = 0;
    for (const f of sourceFiles) {
      const base = f.path.replace(/\.[^.]+$/, "");
      if ([...testPaths].some((t) => t.startsWith(base))) covered++;
    }
    return (covered / sourceFiles.length) * 100;
  }
}
