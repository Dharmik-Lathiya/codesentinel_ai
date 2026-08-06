import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../utils/logger.js";
/**
 * Analysis cache for incremental analysis and comparison.
 */
export class AnalysisCache {
    cacheDir;
    config;
    memoryCache = new Map();
    constructor(cacheDir, config) {
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
    generateKey(filePath, content, configHash) {
        const contentHash = createHash("sha256")
            .update(content)
            .digest("hex")
            .slice(0, 16);
        return `${filePath}-${contentHash}-${configHash}`;
    }
    /**
     * Get cached analysis results.
     */
    get(filePath, content, configHash) {
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
    set(filePath, content, configHash, findings, metadata) {
        const key = this.generateKey(filePath, content, configHash);
        const contentHash = createHash("sha256")
            .update(content)
            .digest("hex");
        const entry = {
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
    compare(previousFindings, currentFindings) {
        const previousMap = new Map(previousFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));
        const currentMap = new Map(currentFindings.map((f, i) => [`${f.file}:${f.line}:${f.comment}`, f]));
        const newFindings = [];
        const fixedFindings = [];
        const unchangedFindings = [];
        const modifiedFindings = [];
        // Find new and unchanged findings
        for (const [key, current] of currentMap) {
            const previous = previousMap.get(key);
            if (!previous) {
                newFindings.push(current);
            }
            else {
                // Check for modifications
                const changes = this.detectChanges(previous, current);
                if (changes.length > 0) {
                    modifiedFindings.push({ previous, current, changes });
                }
                else {
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
    detectChanges(previous, current) {
        const changes = [];
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
    isValid(entry) {
        const age = Date.now() - entry.timestamp;
        return age < this.config.maxAgeMs;
    }
    /**
     * Load entry from disk cache.
     */
    loadFromDisk(key) {
        try {
            const filePath = join(this.cacheDir, `${key}.json`);
            if (!existsSync(filePath))
                return null;
            const content = readFileSync(filePath, "utf8");
            return JSON.parse(content);
        }
        catch {
            logger.debug("Cache load failed");
            return null;
        }
    }
    /**
     * Save entry to disk cache.
     */
    saveToDisk(key, entry) {
        try {
            const filePath = join(this.cacheDir, `${key}.json`);
            writeFileSync(filePath, JSON.stringify(entry), "utf8");
        }
        catch {
            logger.debug("Cache save failed");
        }
    }
    /**
     * Load memory cache from disk on startup.
     */
    loadMemoryCache() {
        try {
            const files = require("node:fs").readdirSync(this.cacheDir);
            for (const file of files) {
                if (!file.endsWith(".json"))
                    continue;
                const filePath = join(this.cacheDir, file);
                const content = readFileSync(filePath, "utf8");
                const entry = JSON.parse(content);
                if (this.isValid(entry)) {
                    this.memoryCache.set(entry.key, entry);
                }
            }
        }
        catch {
            logger.debug("Memory cache load failed");
        }
    }
    /**
     * Evict old entries when cache exceeds max size.
     */
    evictOldEntries() {
        if (this.memoryCache.size <= this.config.maxEntries)
            return;
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
            }
            catch {
                logger.debug("Cache eviction cleanup failed");
            }
        }
    }
    /**
     * Clear all cache entries.
     */
    clear() {
        this.memoryCache.clear();
        try {
            const files = require("node:fs").readdirSync(this.cacheDir);
            for (const file of files) {
                if (!file.endsWith(".json"))
                    continue;
                const filePath = join(this.cacheDir, file);
                require("node:fs").unlinkSync(filePath);
            }
        }
        catch {
            logger.debug("Cache clear failed");
        }
    }
    /**
     * Get cache statistics.
     */
    getStats() {
        let diskEntries = 0;
        let totalSizeBytes = 0;
        try {
            const files = require("node:fs").readdirSync(this.cacheDir);
            for (const file of files) {
                if (!file.endsWith(".json"))
                    continue;
                diskEntries++;
                const filePath = join(this.cacheDir, file);
                const stat = statSync(filePath);
                totalSizeBytes += stat.size;
            }
        }
        catch {
            logger.debug("Cache stats failed");
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
export function generateConfigHash(config) {
    const sortedConfig = Object.keys(config)
        .sort()
        .reduce((acc, key) => {
        acc[key] = config[key];
        return acc;
    }, {});
    return createHash("sha256")
        .update(JSON.stringify(sortedConfig))
        .digest("hex")
        .slice(0, 16);
}
//# sourceMappingURL=cache.js.map