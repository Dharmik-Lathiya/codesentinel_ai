import type { Severity } from "../config/types.js";
import type { Finding } from "./index.js";
/**
 * Analysis depth levels for progressive analysis.
 */
export type AnalysisDepth = "quick" | "standard" | "deep";
/**
 * Analysis mode for multi-file analysis.
 */
export type AnalysisMode = "single" | "batch" | "project";
/**
 * Configuration for progressive analysis.
 */
export interface ProgressiveAnalysisConfig {
    /** Quick scan: only critical and high severity rules. */
    quickScanRules: string[];
    /** Standard scan: all rules except experimental. */
    standardScanRules: string[];
    /** Deep scan: all rules including experimental. */
    deepScanRules: string[];
    /** Whether to automatically escalate if quick scan finds issues. */
    autoEscalate: boolean;
    /** Threshold for auto-escalation (number of findings). */
    escalationThreshold: number;
}
/**
 * Configuration for multi-file analysis.
 */
export interface MultiFileAnalysisConfig {
    /** Maximum number of files to analyze concurrently. */
    maxConcurrentFiles: number;
    /** Whether to analyze cross-file dependencies. */
    analyzeDependencies: boolean;
    /** Whether to analyze import/export relationships. */
    analyzeImports: boolean;
    /** Whether to analyze code patterns across files. */
    analyzePatterns: boolean;
    /** File patterns to group for analysis. */
    fileGroupPatterns: string[];
}
/**
 * Analysis result with progressive metadata.
 */
export interface ProgressiveAnalysisResult {
    /** Analysis depth used. */
    depth: AnalysisDepth;
    /** Findings from this depth level. */
    findings: Finding[];
    /** Whether escalation occurred. */
    escalated: boolean;
    /** Time taken for this depth level. */
    durationMs: number;
    /** Rules applied at this depth. */
    rulesApplied: string[];
    /** Total findings across all depths. */
    totalFindings: number;
}
/**
 * Multi-file analysis result with cross-file insights.
 */
export interface MultiFileAnalysisResult {
    /** Individual file results. */
    fileResults: Map<string, Finding[]>;
    /** Cross-file findings. */
    crossFileFindings: Finding[];
    /** Dependency analysis results. */
    dependencyAnalysis?: DependencyAnalysis;
    /** Import/export analysis results. */
    importExportAnalysis?: ImportExportAnalysis;
    /** Pattern analysis results. */
    patternAnalysis?: PatternAnalysis;
    /** Summary statistics. */
    summary: {
        totalFiles: number;
        totalFindings: number;
        averageFindingsPerFile: number;
        mostProblematicFile: string;
        mostProblematicFileFindings: number;
    };
}
/**
 * Dependency analysis result.
 */
export interface DependencyAnalysis {
    /** Dependency graph. */
    graph: Map<string, Set<string>>;
    /** Files with circular dependencies. */
    circularDependencies: string[][];
    /** Files with too many dependencies. */
    highFanOut: string[];
    /** Files depended on by too many others. */
    highFanIn: string[];
}
/**
 * Import/export analysis result.
 */
export interface ImportExportAnalysis {
    /** Unused imports by file. */
    unusedImports: Map<string, string[]>;
    /** Missing exports by file. */
    missingExports: Map<string, string[]>;
    /** Import/export statistics. */
    stats: {
        totalImports: number;
        totalExports: number;
        averageImportsPerFile: number;
    };
}
/**
 * Pattern analysis result.
 */
export interface PatternAnalysis {
    /** Code patterns detected across files. */
    patterns: CodePattern[];
    /** Duplicate code blocks. */
    duplicateCode: DuplicateCodeBlock[];
    /** Pattern statistics. */
    stats: {
        totalPatterns: number;
        totalDuplicates: number;
        averagePatternSize: number;
    };
}
/**
 * Detected code pattern.
 */
export interface CodePattern {
    /** Pattern identifier. */
    id: string;
    /** Pattern description. */
    description: string;
    /** Files containing this pattern. */
    files: string[];
    /** Pattern frequency. */
    frequency: number;
    /** Pattern severity. */
    severity: Severity;
}
/**
 * Duplicate code block.
 */
export interface DuplicateCodeBlock {
    /** Files containing the duplicate. */
    files: string[];
    /** Line ranges in each file. */
    ranges: {
        file: string;
        start: number;
        end: number;
    }[];
    /** Code content (for display). */
    content: string;
    /** Similarity score (0-1). */
    similarity: number;
}
/**
 * Progressive analyzer that performs analysis in stages.
 */
export declare class ProgressiveAnalyzer {
    private config;
    private multiFileConfig;
    constructor(config?: Partial<ProgressiveAnalysisConfig>, multiFileConfig?: Partial<MultiFileAnalysisConfig>);
    /**
     * Perform progressive analysis starting with quick scan.
     */
    analyzeProgressive(files: {
        path: string;
        content: string;
    }[], analyzer: (path: string, content: string, rules?: string[]) => Finding[]): Promise<ProgressiveAnalysisResult[]>;
    /**
     * Perform analysis at a specific depth.
     */
    private performAnalysis;
    /**
     * Perform multi-file analysis with cross-file insights.
     */
    analyzeMultiFile(files: {
        path: string;
        content: string;
    }[], analyzer: (path: string, content: string) => Finding[]): Promise<MultiFileAnalysisResult>;
    /**
     * Analyze dependencies between files.
     */
    private analyzeDependencies;
    /**
     * Resolve a dependency path relative to a file.
     */
    private resolveDependency;
    /**
     * Detect circular dependencies in the graph.
     */
    private detectCircularDependencies;
    /**
     * Analyze imports and exports across files.
     */
    private analyzeImportsExports;
    /**
     * Extract imports from file content.
     */
    private extractImports;
    /**
     * Extract the imported identifiers from an import statement.
     */
    private extractImportedNames;
    /**
     * Extract exports from file content.
     */
    private extractExports;
    /**
     * Analyze code patterns across files.
     */
    private analyzePatterns;
    /**
     * Detect error handling patterns.
     */
    private detectErrorHandlingPattern;
    /**
     * Detect async/await patterns.
     */
    private detectAsyncPattern;
    /**
     * Detect duplicate code blocks.
     */
    private detectDuplicateCode;
    /**
     * Generate findings from dependency analysis.
     */
    private generateDependencyFindings;
    /**
     * Generate findings from import/export analysis.
     */
    private generateImportExportFindings;
    /**
     * Generate findings from pattern analysis.
     */
    private generatePatternFindings;
}
