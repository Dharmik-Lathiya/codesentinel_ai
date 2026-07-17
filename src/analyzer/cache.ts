import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
export class AnalysisCache {
  private cacheDir: string;
  private config: AnalysisCacheConfig;
  private memoryCache: Map<string, AnalysisCacheEntry> = new Map();

  constructor(
    cacheDir: string,
    config?: Partial<AnalysisCacheConfig>,
  ) {
    this.cacheDir = cacheDir;
    this.config = {
      maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours
      maxEntries: 1000,
      enableCompression: false,
      ...config,
    };

    // Ensure cache directory exists
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // Load memory cache from disk
    this.loadMemoryCache();
  }

  /**
   * Generate a cache key for an analysis.
   */
  generateKey(
    filePath: string,
    content: string,
    configHash: string,
  ): string {
    const contentHash = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 16);
    
    return `${filePath}-${contentHash}-${configHash}`;
  }

  /**
   * Get cached analysis results.
   */
  get(
    filePath: string,
    content: string,
    configHash: string,
  ): AnalysisCacheEntry | null {
    const key = this.generateKey(filePath, content, configHash);
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValid(memoryEntry)) {
      return memoryEntry;
    }

    // Check disk cache
    const diskEntry = this.loadFromDisk(key);
    if (diskEntry && this.isValid(diskEntry)) {
      // Promote to memory cache
      this.memoryCache.set(key, diskEntry);
      return diskEntry;
    }

    return null;
  }

  /**
   * Store analysis results in cache.
   */
  set(
    filePath: string,
    content: string,
    configHash: string,
    findings: Finding[],
    metadata: {
      durationMs: number;
      rulesApplied: string[];
    },
  ): void {
    const key = this.generateKey(filePath, content, configHash);
    const contentHash = createHash("sha256")
      .update(content)
      .digest("hex");

    const entry: AnalysisCacheEntry = {
      key,
      timestamp: Date.now(),
      filePath,
      contentHash,
      findings,
      metadata: {
        ...metadata,
        configHash,
      },
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);

    // Store on disk
    this.saveToDisk(key, entry);

    // Evict old entries if needed
    this.evictOldEntries();
  }

  /**
   * Compare two analysis results.
   */
  compare(
    previousFindings: Finding[],
    currentFindings: Finding[],
  ): AnalysisComparison {
    const previousMap = new Map(previousFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));
    const currentMap = new Map(currentFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));

    const newFindings: Finding[] = [];
    const fixedFindings: Finding[] = [];
    const unchangedFindings: Finding[] = [];
    const modifiedFindings: AnalysisComparison["modifiedFindings"] = [];

    // Find new and unchanged findings
    for (const [key, current] of currentMap) {
      const previous = previousMap.get(key);
      if (!previous) {
        newFindings.push(current);
      } else {
        // Check for modifications
        const changes = this.detectChanges(previous, current);
        if (changes.length > 0) {
          modifiedFindings.push({ previous, current, changes });
        } else {
          unchangedFindings.push(current);
        }
      }
    }

    // Find fixed findings
    for (const [key, previous] of previousMap) {
      if (!currentMap.has(key)) {
        fixedFindings.push(previous);
      }
    }

    const previousTotal = previousFindings.length;
    const currentTotal = currentFindings.length;
    const netChange = currentTotal - previousTotal;
    const percentageChange = previousTotal > 0 
      ? ((netChange / previousTotal) * 100)
      : 0;

    return {
      newFindings,
      fixedFindings,
      unchangedFindings,
      modifiedFindings,
      summary: {
        previousTotal,
        currentTotal,
        netChange,
        percentageChange,
      },
    };
  }

  /**
   * Detect changes between two findings.
   */
  private detectChanges(
    previous: Finding,
    current: Finding,
  ): string[] {
    const changes: string[] = [];

    if (previous.severity !== current.severity) {
      changes.push(`severity: ${previous.severity} → ${current.severity}`);
    }

    if (previous.category !== current.category) {
      changes.push(`category: ${previous.category} → ${current.category}`);
    }

    if (previous.comment !== current.comment) {
      changes.push(`comment changed`);
    }

    if (previous.suggestion !== current.suggestion) {
      changes.push(`suggestion changed`);
    }

    return changes;
  }

  /**
   * Check if a cache entry is still valid.
   */
  private isValid(entry: AnalysisCacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age < this.config.maxAgeMs;
  }

  /**
   * Load entry from disk cache.
   */
  private loadFromDisk(key: string): AnalysisCacheEntry | null {
    try {
      const filePath = join(this.cacheDir, `${key}.json`);
      if (!existsSync(filePath)) return null;

      const content = readFileSync(filePath, "utf8");
      return JSON.parse(content) as AnalysisCacheEntry;
    } catch {
      return null;
    }
  }

  /**
   * Save entry to disk cache.
   */
  private saveToDisk(key: string, entry: AnalysisCacheEntry): void {
    try {
      const filePath = join(this.cacheDir, `${key}.json`);
      writeFileSync(filePath, JSON.stringify(entry), "utf8");
    } catch {
      // Cache failures must never break the run
    }
  }

  /**
   * Load memory cache from disk on startup.
   */
  private loadMemoryCache(): void {
    try {
      const files = require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        
        const filePath = join(this.cacheDir, file);
        const content = readFileSync(filePath, "utf8");
        const entry = JSON.parse(content) as AnalysisCacheEntry;
        
        if (this.isValid(entry)) {
          this.memoryCache.set(entry.key, entry);
        }
      }
    } catch {
      // Ignore errors during cache loading
    }
  }

  /**
   * Evict old entries when cache exceeds max size.
   */
  private evictOldEntries(): void {
    if (this.memoryCache.size <= this.config.maxEntries) return;

    // Sort entries by timestamp
    const entries = Array.from(this.memoryCache.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest entries
    const toRemove = entries.slice(0, entries.length - this.config.maxEntries);
    for (const entry of toRemove) {
      this.memoryCache.delete(entry.key);
      try {
        const filePath = join(this.cacheDir, `${entry.key}.json`);
        if (existsSync(filePath)) {
          require("node:fs").unlinkSync(filePath);
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.memoryCache.clear();
    try {
      const files = require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.cacheDir, file);
        require("node:fs").unlinkSync(filePath);
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    memoryEntries: number;
    diskEntries: number;
    totalSizeBytes: number;
  } {
    let diskEntries = 0;
    let totalSizeBytes = 0;

    try {
      const files = require("node:fs").readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        diskEntries++;
        const filePath = join(this.cacheDir, file);
        const stat = statSync(filePath);
        totalSizeBytes += stat.size;
      }
    } catch {
      // Ignore errors
    }

    return {
      memoryEntries: this.memoryCache.size,
      diskEntries,
      totalSizeBytes,
    };
  }
}

/**
 * Generate a configuration hash for cache key generation.
 */
export function generateConfigHash(config: Record<string, unknown>): string {
  const sortedConfig = Object.keys(config)
    .sort()
    .reduce((acc, key) => {
      acc[key] = config[key];
      return acc;
    }, {} as Record<string, unknown>);

  return createHash("sha256")
    .update(JSON.stringify(sortedConfig))
    .digest("hex")
    .slice(0, 16);
}