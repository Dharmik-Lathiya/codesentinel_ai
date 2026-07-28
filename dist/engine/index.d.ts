import { configFromInputs } from "../config/index.js";
import type { CodeSentinelConfig, RuntimeSecrets, Mode } from "../config/types.js";
import { AIHub } from "../ai/index.js";
import { type Finding } from "../analyzer/index.js";
import { type ScoreBreakdown } from "../scorer/index.js";
import { type GeneratedTest } from "../testgen/index.js";
import { DismissalManager } from "../dismiss/index.js";
import { DashboardServer } from "../dashboard/index.js";
/** A comment to post back to a PR (inline or summary). */
export interface ReviewComment {
    file: string;
    line: number | null;
    body: string;
    severity: string;
}
/** A single fix attempt made during fix-mode. */
export interface FixAttempt {
    iteration: number;
    file: string;
    fixed: boolean;
    explanation: string;
    /** Whether lint/test passed after applying the fix. */
    verified: boolean;
    /** New findings introduced by the fix (if any). */
    newIssuesIntroduced: Finding[];
}
/** A single hunk (line-based patch) returned by the AI. */
export interface Hunk {
    startLine: number;
    deleteCount: number;
    newLines: string[];
}
/** Apply hunks to file content (sorts bottom-to-top to preserve line numbers). */
export declare function applyHunks(content: string, hunks: Hunk[]): string;
/** The full machine-readable report produced by a run. */
export interface EngineReport {
    mode: Mode;
    summary: string;
    findings: Finding[];
    score: ScoreBreakdown | null;
    comments: ReviewComment[];
    generatedTests: GeneratedTest[];
    fixAttempts: FixAttempt[];
    /** Typed gate result — only set when mode is "gate". */
    gatePassed?: boolean;
    metrics: {
        filesAnalyzed: number;
        findingsBySeverity: Record<string, number>;
        durationMs: number;
        truncatedResponses?: number;
        repairedResponses?: number;
    };
}
/**
 * Engine is the central orchestrator. It loads config, collects files, runs
 * static + plugin analysis, calls the AI models with structured prompts,
 * parses their responses, and (depending on mode) applies fixes or produces
 * comments/tests. Fix-mode uses a loop bounded by `max_iterations`.
 */
export declare class Engine {
    #private;
    private secrets;
    private root;
    /** Optional AI override (used in tests to avoid network calls). */
    private readonly aiOverride?;
    readonly config: CodeSentinelConfig;
    private ai;
    private prompts;
    private analyzer;
    private scorer;
    private cache;
    private plugins;
    private dismissals;
    private dashboard;
    private readonly mcp;
    private readonly learning;
    private readonly eventBus;
    private aiAvailable;
    /** Count of AI responses that were truncated (unterminated JSON). */
    private truncatedCount;
    /** Count of truncated responses successfully repaired via extractJson. */
    private repairedCount;
    constructor(config: CodeSentinelConfig, secrets: RuntimeSecrets, root?: string, 
    /** Optional AI override (used in tests to avoid network calls). */
    aiOverride?: Pick<AIHub, "complete" | "modelForTask"> | undefined);
    /** Best-effort health check: log whether the AI provider is reachable. */
    private checkAIProvider;
    /** Convenience factory used by CLI / Action. */
    static fromInputs(opts: {
        configPath?: string;
        overrides?: Partial<CodeSentinelConfig>;
        secrets: RuntimeSecrets;
        root?: string;
    }): Engine;
    /** Load configured plugins before running. */
    init(): Promise<void>;
    run(): Promise<EngineReport>;
    private runGate;
    runDeadCode(files: {
        path: string;
        content: string;
    }[]): Promise<Finding[]>;
    buildSuggestions(findings: Finding[], fileContents: Map<string, string>): string;
    getDismissalManager(): DismissalManager;
    /** Dismiss by rule and record feedback in learning store. */
    dismissByRule(ruleId: string, reason: string): Promise<void>;
    /** Dismiss by file+line and record feedback in learning store. */
    dismissByFinding(file: string, line: number | null, ruleId: string, reason: string): Promise<void>;
    getDashboard(): DashboardServer | null;
    private recordDashboardRun;
    private collectedFiles;
    private analyzeFiles;
    private runReview;
    /**
     * Create a deep copy of the file list with secrets redacted from `content`
     * before sending to the AI provider. Never mutates files on disk.
     */
    private redactFilesForAI;
    /** Ask the AI model to review each changed file (cached per file). */
    private aiReview;
    /** Record recurring patterns and auto-create rules. */
    private recordPatterns;
    private runFix;
    /** Commit and push fixed files, returning the target branch name. */
    private pushFixes;
    /** Create a PR from the fix branch and optionally enable auto-merge. */
    private createFixPR;
    /** Generate and (optionally) write a fix for a single finding. */
    private applyFix;
    /** Apply fixes for ALL findings in a single file in ONE AI call. */
    private batchApplyFix;
    /** Apply fixes for a batch of findings without the full re-analysis loop. */
    private runFixLoopFor;
    /** Run lint + tests after a fix. Best-effort; returns true if both pass. */
    private runVerification;
    private runAudit;
    private runScoreMode;
    /** Combine the static baseline with an AI refinement of the sub-scores. */
    private computeScore;
    private runTestgen;
    private runChat;
    private runDescribe;
    /** Public helper used by the GitHub App / Action to answer `/ask`. */
    ask(question: string): Promise<string>;
    private runImprove;
    /** AI-powered utility function generation. */
    private runGenerateUtilities;
    /** AI-powered documentation generation. */
    private runGenerateDocs;
    private callAI;
    private callScoreAI;
    private buildSummary;
    private tallySeverity;
    private finalizeReport;
    private writeReportFile;
    /**
     * Perform progressive analysis (quick scan → deep analysis).
     */
    analyzeProgressive(): Promise<{
        results: import("../analyzer/progressive.js").ProgressiveAnalysisResult[];
        findings: Finding[];
    }>;
    /**
     * Perform multi-file analysis with cross-file insights.
     */
    analyzeMultiFile(): Promise<import("../analyzer/progressive.js").MultiFileAnalysisResult>;
    /**
     * Compare analysis results between two runs.
     */
    compareAnalyses(previousFindings: Finding[], currentFindings: Finding[]): import("../analyzer/cache.js").AnalysisComparison | null;
    /**
     * Add a custom analysis rule.
     */
    addCustomRule(rule: import("../config/types.js").CustomRule): void;
    /**
     * Remove a custom analysis rule.
     */
    removeCustomRule(ruleId: string): void;
    /**
     * Update confidence thresholds for analysis.
     */
    updateConfidenceThresholds(thresholds: Partial<import("../config/types.js").ConfidenceThresholds>): void;
    /**
     * Update severity adjustment configuration.
     */
    updateSeverityConfig(config: Partial<import("../config/types.js").SeverityAdjustmentConfig>): void;
    /**
     * Get analyzer configuration.
     */
    getAnalyzerConfig(): import("../config/types.js").AnalyzerConfig;
    /**
     * Get analysis cache statistics.
     */
    getAnalysisCacheStats(): {
        memoryEntries: number;
        diskEntries: number;
        totalSizeBytes: number;
    } | null;
    /**
     * Clear analysis cache.
     */
    clearAnalysisCache(): void;
}
/** Re-export the GitHub Action input helper for callers. */
export { configFromInputs };
