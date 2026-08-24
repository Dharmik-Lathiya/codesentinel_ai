import type { Severity, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, CustomRule } from "../config/types.js";
import { type FileHistory } from "./enhanced.js";
import { type AnalysisComparison } from "./cache.js";
import { type ProgressiveAnalysisResult, type MultiFileAnalysisResult } from "./progressive.js";
/** A finding produced by either static or AI analysis. */
export interface Finding {
    severity: Severity;
    category: "bug" | "security" | "performance" | "smell" | "style" | "praise";
    file: string;
    line: number | null;
    comment: string;
    suggestion?: string;
    /** Source of the finding: local heuristic or the AI model. */
    source: "static" | "ai" | "linter" | "scanner";
    /** Confidence score for this finding (0-1). */
    confidence?: number;
}
/**
 * StaticAnalyzer runs cheap, deterministic, offline heuristic checks that do
 * not require an AI call. These act as a fast first pass and also power the
 * scoring breakdown even when AI is unavailable.
 */
export declare class StaticAnalyzer {
    private enhancedAnalyzer;
    private progressiveAnalyzer;
    private analysisCache;
    private analyzerConfig;
    private configHash;
    constructor(config?: Partial<AnalyzerConfig>, cacheDir?: string);
    analyze(path: string, content: string): Finding[];
    /**
     * Basic analysis without enhanced features (original logic).
     */
    private analyzeBasic;
    /**
     * Perform progressive analysis (quick scan → deep analysis).
     */
    analyzeProgressive(files: {
        path: string;
        content: string;
    }[]): Promise<ProgressiveAnalysisResult[]>;
    /**
     * Perform multi-file analysis with cross-file insights.
     */
    analyzeMultiFile(files: {
        path: string;
        content: string;
    }[]): Promise<MultiFileAnalysisResult>;
    /**
     * Compare analysis results between two runs.
     */
    compareAnalyses(previousFindings: Finding[], currentFindings: Finding[]): AnalysisComparison | null;
    /**
     * Update file histories for dynamic severity adjustment.
     */
    updateFileHistories(fileHistories: Map<string, FileHistory>): void;
    /**
     * Add a custom rule.
     */
    addCustomRule(rule: CustomRule): void;
    /**
     * Remove a custom rule.
     */
    removeCustomRule(ruleId: string): void;
    /**
     * Update confidence thresholds.
     */
    updateConfidenceThresholds(thresholds: Partial<ConfidenceThresholds>): void;
    /**
     * Update severity adjustment configuration.
     */
    updateSeverityConfig(config: Partial<SeverityAdjustmentConfig>): void;
    /**
     * Get analyzer configuration.
     */
    getConfig(): AnalyzerConfig;
    /**
     * Get cache statistics.
     */
    getCacheStats(): {
        memoryEntries: number;
        diskEntries: number;
        totalSizeBytes: number;
    } | null;
    /**
     * Clear analysis cache.
     */
    clearCache(): void;
    /** Detect deep nesting (more than 4 levels of indentation). */
    private detectDeepNesting;
    /** Detect magic numbers (numeric literals other than 0, 1, -1). */
    private detectMagicNumbers;
    /** Detect missing error handling (bare await without try/catch). */
    private detectMissingErrorHandling;
    /** Detect long functions (more than 50 lines). */
    private detectLongFunctions;
    /** Aggregate findings across many files. */
    analyzeMany(files: {
        path: string;
        content: string;
    }[]): Finding[];
}
/** Detect the language label for a path (re-export for convenience). */
export declare function langFor(path: string): string;
