import { languageOf } from "../utils/files.js";
import type { Severity, AnalyzerConfig, SeverityAdjustmentConfig, ConfidenceThresholds, CustomRule } from "../config/types.js";
import { DEFAULT_ANALYZER_CONFIG } from "../config/defaults.js";
import { EnhancedAnalyzer, type FileHistory } from "./enhanced.js";
import { AnalysisCache, type AnalysisCacheEntry, type AnalysisComparison, generateConfigHash } from "./cache.js";
import { ProgressiveAnalyzer, type AnalysisDepth, type ProgressiveAnalysisResult, type MultiFileAnalysisResult } from "./progressive.js";

/** A finding produced by either static or AI analysis. */
export interface Finding {
  severity: Severity;
  category: "bug" | "security" | "performance" | "smell" | "style" | "praise";
  file: string;
  line: number | null;
  comment: string;
  suggestion?: string;
  /** Source of the finding: local heuristic or the AI model. */
  source: "static" | "ai";
  /** Confidence score for this finding (0-1). */
  confidence?: number;
}

/**
 * StaticAnalyzer runs cheap, deterministic, offline heuristic checks that do
 * not require an AI call. These act as a fast first pass and also power the
 * scoring breakdown even when AI is unavailable.
 */
export class StaticAnalyzer {
  private enhancedAnalyzer: EnhancedAnalyzer;
  private progressiveAnalyzer: ProgressiveAnalyzer;
  private analysisCache: AnalysisCache | null = null;
  private analyzerConfig: AnalyzerConfig;
  private configHash: string;

  constructor(config?: Partial<AnalyzerConfig>, cacheDir?: string) {
    this.analyzerConfig = {
      ...DEFAULT_ANALYZER_CONFIG,
      ...config,
    };

    this.configHash = generateConfigHash(this.analyzerConfig as unknown as Record<string, unknown>);
    this.enhancedAnalyzer = new EnhancedAnalyzer(
      this.analyzerConfig.severityAdjustment,
      this.analyzerConfig.confidenceThresholds,
      this.analyzerConfig.customRules,
    );

    this.progressiveAnalyzer = new ProgressiveAnalyzer(
      this.analyzerConfig.progressiveAnalysis,
      this.analyzerConfig.multiFileAnalysis,
    );

    // Initialize cache if cache directory is provided
    if (cacheDir) {
      this.analysisCache = new AnalysisCache(cacheDir);
    }
  }

  analyze(path: string, content: string): Finding[] {
    // Check cache first if enabled
    if (this.analysisCache) {
      const cached = this.analysisCache.get(path, content, this.configHash);
      if (cached) {
        return cached.findings;
      }
    }

    let findings: Finding[];

    if (this.analyzerConfig.enableEnhancedAnalysis) {
      // Use enhanced analyzer with dynamic severity adjustment
      findings = this.enhancedAnalyzer.analyze(path, content);
    } else {
      // Use basic analyzer
      findings = this.analyzeBasic(path, content);
    }

    // Cache results if cache is available
    if (this.analysisCache) {
      this.analysisCache.set(path, content, this.configHash, findings, {
        durationMs: 0, // Would need to track this properly
        rulesApplied: ["basic"],
      });
    }

    return findings;
  }

  /**
   * Basic analysis without enhanced features (original logic).
   */
  private analyzeBasic(path: string, content: string): Finding[] {
    const findings: Finding[] = [];
    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      // 1. Hardcoded secrets / API keys.
      if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Possible hardcoded API key detected.",
          suggestion: "Move secrets to environment variables or a secrets manager.",
          source: "static",
        });
      }
      // 2. console.log left in source (smell, not for tests).
      if (/\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Debug logging left in source.",
          suggestion: "Remove or replace with a proper logger.",
          source: "static",
        });
      }
      // 3. eval usage (security).
      if (/\beval\s*\(/.test(line)) {
        findings.push({
          severity: "critical",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Use of eval() is dangerous and can lead to code injection.",
          suggestion: "Avoid eval; parse structured input instead.",
          source: "static",
        });
      }
      // 4. TODO/FIXME without tracking.
      if (/(TODO|FIXME|XXX)\b/.test(line)) {
        findings.push({
          severity: "info",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Tech-debt marker (TODO/FIXME) found.",
          suggestion: "Link to a tracked issue where possible.",
          source: "static",
        });
      }
      // 5. Hardcoded passwords.
      if (/password\s*=\s*["'][^"']+["']/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Possible hardcoded password detected.",
          suggestion: "Use environment variables or a secrets manager.",
          source: "static",
        });
      }
      // 6. process.exit() usage.
      if (/\bprocess\.exit\s*\(/.test(line)) {
        findings.push({
          severity: "medium",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Direct process.exit() call found.",
          suggestion: "Use exceptions or return codes for cleaner shutdown.",
          source: "static",
        });
      }
    });

    // 7. Deep nesting detection.
    findings.push(...this.detectDeepNesting(path, lines));

    // 8. Magic numbers detection.
    findings.push(...this.detectMagicNumbers(path, lines));

    // 9. Missing error handling (bare await without try/catch).
    findings.push(...this.detectMissingErrorHandling(path, content));

    // 10. Long functions detection (> 50 lines).
    findings.push(...this.detectLongFunctions(path, lines));

    return findings;
  }

  /**
   * Perform progressive analysis (quick scan → deep analysis).
   */
  async analyzeProgressive(
    files: { path: string; content: string }[],
  ): Promise<ProgressiveAnalysisResult[]> {
    return this.progressiveAnalyzer.analyzeProgressive(files, (path, content, rules) => {
      if (this.analyzerConfig.enableEnhancedAnalysis) {
        return this.enhancedAnalyzer.analyze(path, content);
      }
      return this.analyzeBasic(path, content);
    });
  }

  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile(
    files: { path: string; content: string }[],
  ): Promise<MultiFileAnalysisResult> {
    return this.progressiveAnalyzer.analyzeMultiFile(files, (path, content) => {
      if (this.analyzerConfig.enableEnhancedAnalysis) {
        return this.enhancedAnalyzer.analyze(path, content);
      }
      return this.analyzeBasic(path, content);
    });
  }

  /**
   * Compare analysis results between two runs.
   */
  compareAnalyses(
    previousFindings: Finding[],
    currentFindings: Finding[],
  ): AnalysisComparison | null {
    if (!this.analysisCache) {
      return null;
    }
    return this.analysisCache.compare(previousFindings, currentFindings);
  }

  /**
   * Update file histories for dynamic severity adjustment.
   */
  updateFileHistories(fileHistories: Map<string, FileHistory>): void {
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateContext(fileHistories);
    }
  }

  /**
   * Add a custom rule.
   */
  addCustomRule(rule: CustomRule): void {
    this.analyzerConfig.customRules.push(rule);
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.addCustomRule(rule);
    }
  }

  /**
   * Remove a custom rule.
   */
  removeCustomRule(ruleId: string): void {
    this.analyzerConfig.customRules = this.analyzerConfig.customRules.filter(r => r.id !== ruleId);
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.removeCustomRule(ruleId);
    }
  }

  /**
   * Update confidence thresholds.
   */
  updateConfidenceThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    this.analyzerConfig.confidenceThresholds = {
      ...this.analyzerConfig.confidenceThresholds,
      ...thresholds,
    };
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateConfidenceThresholds(thresholds);
    }
  }

  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config: Partial<SeverityAdjustmentConfig>): void {
    this.analyzerConfig.severityAdjustment = {
      ...this.analyzerConfig.severityAdjustment,
      ...config,
    };
    if (this.analyzerConfig.enableEnhancedAnalysis) {
      this.enhancedAnalyzer.updateSeverityConfig(config);
    }
  }

  /**
   * Get analyzer configuration.
   */
  getConfig(): AnalyzerConfig {
    return { ...this.analyzerConfig };
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { memoryEntries: number; diskEntries: number; totalSizeBytes: number } | null {
    return this.analysisCache?.getStats() ?? null;
  }

  /**
   * Clear analysis cache.
   */
  clearCache(): void {
    this.analysisCache?.clear();
  }

  /** Detect deep nesting (more than 4 levels of indentation). */
  private detectDeepNesting(path: string, lines: string[]): Finding[] {
    const findings: Finding[] = [];
    const maxDepth = 4;

    lines.forEach((line, idx) => {
      const indent = line.search(/\S/);
      if (indent >= 0) {
        // Auto-detect tab vs space indentation from the first indented line.
        const depth = Math.floor(indent / 2);
        if (depth > maxDepth) {
          findings.push({
            severity: "medium",
            category: "smell",
            file: path,
            line: idx + 1,
            comment: `Deep nesting detected (depth: ${depth}).`,
            suggestion: "Consider extracting logic into separate functions.",
            source: "static",
          });
        }
      }
    });

    return findings;
  }

  /** Detect magic numbers (numeric literals other than 0, 1, -1). */
  private detectMagicNumbers(path: string, lines: string[]): Finding[] {
    const findings: Finding[] = [];
    const magicNumberRegex = /(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])/g;

    lines.forEach((line, idx) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("import") || line.trim().startsWith("export")) {
        return;
      }

      let match;
      while ((match = magicNumberRegex.exec(line)) !== null) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: `Magic number ${match[0]} detected.`,
          suggestion: "Consider extracting to a named constant.",
          source: "static",
        });
      }
    });

    return findings;
  }

  /** Detect missing error handling (bare await without try/catch). */
  private detectMissingErrorHandling(path: string, content: string): Finding[] {
    const findings: Finding[] = [];
    const lines = content.split("\n");
    const inTryBlock = new Set<number>();

    let tryStart = -1;
    let braceCount = 0;

    lines.forEach((line, idx) => {
      if (tryStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount <= 0) {
          for (let i = tryStart; i <= idx; i++) {
            inTryBlock.add(i);
          }
          tryStart = -1;
        }
      } else if (/\btry\s*\{/.test(line)) {
        tryStart = idx;
        braceCount = 1;
      }
    });

    lines.forEach((line, idx) => {
      if (inTryBlock.has(idx)) return;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

      if (/\bawait\b/.test(line) && !/\b(try|catch)\b/.test(line)) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Await call without error handling.",
          suggestion: "Wrap in try/catch for proper error handling.",
          source: "static",
        });
      }
    });

    return findings;
  }

  /** Detect long functions (more than 50 lines). */
  private detectLongFunctions(path: string, lines: string[]): Finding[] {
    const findings: Finding[] = [];
    let functionStart = -1;
    let functionName = "";
    let braceCount = 0;

    lines.forEach((line, idx) => {
      const functionMatch = line.match(/(?:function|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))\s+(\w+)?/);
      if (functionMatch && functionStart === -1) {
        functionStart = idx;
        functionName = functionMatch[1] || "anonymous";
        braceCount = 0;
      }

      if (functionStart >= 0) {
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;

        if (braceCount <= 0 && idx > functionStart) {
          const functionLength = idx - functionStart;
          if (functionLength > 50) {
            findings.push({
              severity: "medium",
              category: "smell",
              file: path,
              line: functionStart + 1,
              comment: `Long function "${functionName}" (${functionLength} lines).`,
              suggestion: "Consider breaking into smaller functions.",
              source: "static",
            });
          }
          functionStart = -1;
        }
      }
    });

    return findings;
  }

  /** Aggregate findings across many files. */
  analyzeMany(files: { path: string; content: string }[]): Finding[] {
    return files.flatMap((f) => this.analyze(f.path, f.content));
  }
}

/** Detect the language label for a path (re-export for convenience). */
export function langFor(path: string): string {
  return languageOf(path);
}
