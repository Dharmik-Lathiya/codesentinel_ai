import type { Severity } from "../config/types.js";
import type { Finding } from "./index.js";
/**
 * Configuration for dynamic severity adjustment.
 */
export interface SeverityAdjustmentConfig {
    /** File patterns that should have increased severity (e.g., production code). */
    highRiskPatterns: string[];
    /** File patterns that should have decreased severity (e.g., test files). */
    lowRiskPatterns: string[];
    /** Adjustments based on file history (frequency of changes). */
    historyBasedAdjustment: boolean;
    /** Multiplier for files with high change frequency. */
    changeFrequencyMultiplier: number;
}
/**
 * Configuration for confidence thresholds per analysis type.
 */
export interface ConfidenceThresholds {
    /** Minimum confidence threshold for security findings. */
    security: number;
    /** Minimum confidence threshold for bug findings. */
    bug: number;
    /** Minimum confidence threshold for performance findings. */
    performance: number;
    /** Minimum confidence threshold for smell findings. */
    smell: number;
    /** Minimum confidence threshold for style findings. */
    style: number;
}
/**
 * Custom rule definition for user-defined patterns.
 */
export interface CustomRule {
    /** Unique rule identifier. */
    id: string;
    /** Human-readable rule name. */
    name: string;
    /** Regular expression pattern to match. */
    pattern: string;
    /** Severity of findings from this rule. */
    severity: Severity;
    /** Category of findings from this rule. */
    category: Finding["category"];
    /** Human-readable comment for findings. */
    comment: string;
    /** Optional suggestion for fixing the issue. */
    suggestion?: string;
    /** File patterns where this rule applies. */
    filePatterns?: string[];
    /** Confidence threshold for this rule (0-1). */
    confidence?: number;
}
/**
 * Analysis context for tracking file history and change patterns.
 */
export interface AnalysisContext {
    /** Map of file paths to their change history. */
    fileHistory: Map<string, FileHistory>;
    /** Analysis session start time. */
    sessionStart: number;
    /** Previous analysis results for comparison. */
    previousFindings?: Map<string, Finding[]>;
}
/**
 * File history information for dynamic severity adjustment.
 */
export interface FileHistory {
    /** Number of times the file has been modified. */
    changeCount: number;
    /** Last modification timestamp. */
    lastModified: number;
    /** Files that frequently change together. */
    correlatedFiles: Set<string>;
    /** Historical finding density (findings per line). */
    findingDensity: number;
}
/**
 * Analysis result with metadata for comparison and caching.
 */
export interface AnalysisResult {
    /** Findings from the analysis. */
    findings: Finding[];
    /** Metadata about the analysis. */
    metadata: {
        /** Timestamp of the analysis. */
        timestamp: number;
        /** Duration of the analysis in milliseconds. */
        durationMs: number;
        /** Files analyzed. */
        filesAnalyzed: number;
        /** Rules applied. */
        rulesApplied: string[];
        /** Confidence thresholds used. */
        confidenceThresholds: ConfidenceThresholds;
    };
}
/**
 * Enhanced static analyzer with dynamic severity adjustment, confidence
 * thresholds, custom rules, and analysis context tracking.
 */
export declare class EnhancedAnalyzer {
    private severityConfig;
    private confidenceThresholds;
    private customRules;
    private analysisContext;
    constructor(severityConfig?: Partial<SeverityAdjustmentConfig>, confidenceThresholds?: Partial<ConfidenceThresholds>, customRules?: CustomRule[]);
    /**
     * Analyze a file with enhanced features.
     */
    analyze(path: string, content: string, options?: {
        fileHistory?: FileHistory;
        previousFindings?: Finding[];
    }): Finding[];
    /**
     * Analyze with dynamic severity adjustment based on file context.
     */
    private analyzeWithDynamicSeverity;
    /**
     * Calculate severity multiplier based on file risk level.
     */
    private calculateSeverityMultiplier;
    /**
     * Adjust severity based on multiplier.
     */
    private adjustSeverity;
    /**
     * Create a finding with confidence metadata.
     */
    private createFinding;
    /**
     * Apply custom rules to the file content.
     */
    private applyCustomRules;
    /**
     * Filter findings by confidence thresholds.
     */
    private filterByConfidence;
    /**
     * Detect deep nesting with severity adjustment.
     */
    private detectDeepNesting;
    /**
     * Detect magic numbers with severity adjustment.
     */
    private detectMagicNumbers;
    /**
     * Detect missing error handling with severity adjustment.
     */
    private detectMissingErrorHandling;
    /**
     * Detect long functions with severity adjustment.
     */
    private detectLongFunctions;
    /**
     * Analyze multiple files with enhanced features.
     */
    analyzeMany(files: {
        path: string;
        content: string;
    }[], options?: {
        fileHistories?: Map<string, FileHistory>;
        previousFindings?: Map<string, Finding[]>;
    }): Finding[];
    /**
     * Update analysis context with new file history.
     */
    updateContext(fileHistory: Map<string, FileHistory>): void;
    /**
     * Get analysis context for comparison.
     */
    getContext(): AnalysisContext;
    /**
     * Add a custom rule.
     */
    addCustomRule(rule: CustomRule): void;
    /**
     * Remove a custom rule by ID.
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
}
