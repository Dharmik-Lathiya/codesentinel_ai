import type { Finding } from "../analyzer/index.js";
/**
 * Analysis cache entry with metadata for incremental analysis.
 */
export interface AnalysisCacheEntry {
    /** Unique cache key based on file content and configuration. */
    key: string;
    /** Timestamp when the entry was created. */
    timestamp: number;
    /** File path this analysis belongs to. */
    filePath: string;
    /** Hash of the file content at analysis time. */
    contentHash: string;
    /** Analysis results. */
    findings: Finding[];
    /** Metadata about the analysis. */
    metadata: {
        /** Duration of the analysis in milliseconds. */
        durationMs: number;
        /** Rules applied during analysis. */
        rulesApplied: string[];
        /** Configuration hash used for this analysis. */
        configHash: string;
    };
}
/**
 * Comparison result between two analysis runs.
 */
export interface AnalysisComparison {
    /** Findings that are new in the current analysis. */
    newFindings: Finding[];
    /** Findings that were fixed (removed) since the previous analysis. */
    fixedFindings: Finding[];
    /** Findings that remain unchanged. */
    unchangedFindings: Finding[];
    /** Findings that changed severity or other properties. */
    modifiedFindings: {
        previous: Finding;
        current: Finding;
        changes: string[];
    }[];
    /** Summary statistics. */
    summary: {
        /** Total findings in previous analysis. */
        previousTotal: number;
        /** Total findings in current analysis. */
        currentTotal: number;
        /** Net change in findings. */
        netChange: number;
        /** Percentage change. */
        percentageChange: number;
    };
}
/**
 * Cache configuration options.
 */
export interface AnalysisCacheConfig {
    /** Maximum age of cache entries in milliseconds. Default: 24 hours. */
    maxAgeMs: number;
    /** Maximum number of cache entries. Default: 1000. */
    maxEntries: number;
    /** Whether to enable compression for cache entries. */
    enableCompression: boolean;
}
/**
 * Analysis cache for incremental analysis and comparison.
 */
export declare class AnalysisCache {
    private cacheDir;
    private config;
    private memoryCache;
    constructor(cacheDir: string, config?: Partial<AnalysisCacheConfig>);
    /**
     * Generate a cache key for an analysis.
     */
    generateKey(filePath: string, content: string, configHash: string): string;
    /**
     * Get cached analysis results.
     */
    get(filePath: string, content: string, configHash: string): AnalysisCacheEntry | null;
    /**
     * Store analysis results in cache.
     */
    set(filePath: string, content: string, configHash: string, findings: Finding[], metadata: {
        durationMs: number;
        rulesApplied: string[];
    }): void;
    /**
     * Compare two analysis results.
     */
    compare(previousFindings: Finding[], currentFindings: Finding[]): AnalysisComparison;
    /**
     * Detect changes between two findings.
     */
    private detectChanges;
    /**
     * Check if a cache entry is still valid.
     */
    private isValid;
    /**
     * Load entry from disk cache.
     */
    /** Cache key → filesystem-safe filename (keys embed file paths with `/`). */
    private diskPath;
    private loadFromDisk;
    /**
     * Save entry to disk cache.
     */
    private saveToDisk;
    /**
     * Load memory cache from disk on startup.
     */
    private loadMemoryCache;
    /**
     * Evict old entries when cache exceeds max size.
     */
    private evictOldEntries;
    /**
     * Clear all cache entries.
     */
    clear(): void;
    /**
     * Get cache statistics.
     */
    getStats(): {
        memoryEntries: number;
        diskEntries: number;
        totalSizeBytes: number;
    };
}
/**
 * Generate a configuration hash for cache key generation.
 */
export declare function generateConfigHash(config: Record<string, unknown>): string;
