import type { SecurityBlendStrategy } from "../config/types.js";
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
export declare const WEIGHTS: {
    readonly readability: 0.25;
    readonly maintainability: 0.3;
    readonly security: 0.25;
    readonly test_coverage: 0.2;
};
/**
 * Scorer computes a deterministic baseline quality score from static findings
 * and code metrics, and can blend in AI-provided sub-scores.
 */
export declare class Scorer {
    /**
     * Build a baseline score from static findings + simple code metrics.
     * This works fully offline and is deterministic.
     */
    scoreStatic(files: {
        path: string;
        content: string;
    }[], findings: Finding[]): ScoreBreakdown;
    /**
     * Blend an AI-provided sub-score breakdown with the static baseline. The AI
     * result is trusted more for subjective dimensions (readability), while
     * static analysis dominates security (it is more reliable there).
     */
    blendWithAI(baseline: ScoreBreakdown, ai: Partial<Pick<ScoreBreakdown, "readability" | "maintainability" | "security" | "test_coverage">>, rationale: string, strategy?: SecurityBlendStrategy): ScoreBreakdown;
    /** Compute the weighted overall and attach it to the breakdown. */
    finalize(b: Omit<ScoreBreakdown, "overall">): ScoreBreakdown;
    /** Readability heuristic: penalize very long functions and reward comments. */
    private readabilityMetric;
    /** Coverage heuristic: fraction of source files that have a related test. */
    private coverageMetric;
}
