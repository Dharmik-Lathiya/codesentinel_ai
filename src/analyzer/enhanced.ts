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
export class EnhancedAnalyzer {
  private severityConfig: SeverityAdjustmentConfig;
  private confidenceThresholds: ConfidenceThresholds;
  private customRules: CustomRule[];
  private analysisContext: AnalysisContext;

  constructor(
    severityConfig?: Partial<SeverityAdjustmentConfig>,
    confidenceThresholds?: Partial<ConfidenceThresholds>,
    customRules?: CustomRule[],
  ) {
    this.severityConfig = {
      highRiskPatterns: ["src/", "lib/", "app/"],
      lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
      historyBasedAdjustment: true,
      changeFrequencyMultiplier: 1.5,
      ...severityConfig,
    };

    this.confidenceThresholds = {
      security: 0.7,
      bug: 0.6,
      performance: 0.5,
      smell: 0.4,
      style: 0.3,
      ...confidenceThresholds,
    };

    this.customRules = customRules || [];
    this.analysisContext = {
      fileHistory: new Map(),
      sessionStart: Date.now(),
    };
  }

  /**
   * Analyze a file with enhanced features.
   */
  analyze(
    path: string,
    content: string,
    options?: {
      fileHistory?: FileHistory;
      previousFindings?: Finding[];
    },
  ): Finding[] {
    const startTime = Date.now();
    const findings: Finding[] = [];

    // Apply built-in rules with dynamic severity adjustment
    findings.push(...this.analyzeWithDynamicSeverity(path, content, options?.fileHistory));

    // Apply custom rules
    findings.push(...this.applyCustomRules(path, content));

    // Filter by confidence thresholds
    const filteredFindings = this.filterByConfidence(findings);

    return filteredFindings;
  }

  /**
   * Analyze with dynamic severity adjustment based on file context.
   */
  private analyzeWithDynamicSeverity(
    path: string,
    content: string,
    fileHistory?: FileHistory,
  ): Finding[] {
    const findings: Finding[] = [];
    const lines = content.split("\n");

    // Determine base severity adjustment based on file risk
    const severityMultiplier = this.calculateSeverityMultiplier(path, fileHistory);

    lines.forEach((line, idx) => {
      // 1. Hardcoded secrets / API keys
      if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("high", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Possible hardcoded API key detected.",
          "Move secrets to environment variables or a secrets manager.",
          0.9, // High confidence
        ));
      }

      // 2. console.log left in source
      if (/\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Debug logging left in source.",
          "Remove or replace with a proper logger.",
          0.8, // High confidence
        ));
      }

      // 3. eval usage
      if (/\beval\s*\(/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("critical", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Use of eval() is dangerous and can lead to code injection.",
          "Avoid eval; parse structured input instead.",
          0.95, // Very high confidence
        ));
      }

      // 4. TODO/FIXME without tracking
      if (/(TODO|FIXME|XXX)\b/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("info", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Tech-debt marker (TODO/FIXME) found.",
          "Link to a tracked issue where possible.",
          0.9, // High confidence
        ));
      }

      // 5. Hardcoded passwords
      if (/password\s*=\s*["'][^"']+["']/i.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("high", severityMultiplier),
          "security",
          path,
          idx + 1,
          "Possible hardcoded password detected.",
          "Use environment variables or a secrets manager.",
          0.85, // High confidence
        ));
      }

      // 6. process.exit() usage
      if (/\bprocess\.exit\s*\(/.test(line)) {
        findings.push(this.createFinding(
          this.adjustSeverity("medium", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Direct process.exit() call found.",
          "Use exceptions or return codes for cleaner shutdown.",
          0.9, // High confidence
        ));
      }
    });

    // 7. Deep nesting detection
    findings.push(...this.detectDeepNesting(path, lines, severityMultiplier));

    // 8. Magic numbers detection
    findings.push(...this.detectMagicNumbers(path, lines, severityMultiplier));

    // 9. Missing error handling
    findings.push(...this.detectMissingErrorHandling(path, content, severityMultiplier));

    // 10. Long functions detection
    findings.push(...this.detectLongFunctions(path, lines, severityMultiplier));

    return findings;
  }

  /**
   * Calculate severity multiplier based on file risk level.
   */
  private calculateSeverityMultiplier(
    path: string,
    fileHistory?: FileHistory,
  ): number {
    let multiplier = 1.0;

    // Check high-risk patterns
    if (this.severityConfig.highRiskPatterns.some(pattern => path.includes(pattern))) {
      multiplier *= 1.3;
    }

    // Check low-risk patterns
    if (this.severityConfig.lowRiskPatterns.some(pattern => path.includes(pattern))) {
      multiplier *= 0.7;
    }

    // Adjust based on file history if enabled
    if (this.severityConfig.historyBasedAdjustment && fileHistory) {
      // Increase severity for frequently changed files
      if (fileHistory.changeCount > 10) {
        multiplier *= this.severityConfig.changeFrequencyMultiplier;
      }

      // Increase severity for files with high finding density
      if (fileHistory.findingDensity > 0.1) { // More than 1 finding per 10 lines
        multiplier *= 1.2;
      }
    }

    return Math.min(Math.max(multiplier, 0.5), 2.0); // Clamp between 0.5 and 2.0
  }

  /**
   * Adjust severity based on multiplier.
   */
  private adjustSeverity(baseSeverity: Severity, multiplier: number): Severity {
    const severityOrder: Severity[] = ["info", "low", "medium", "high", "critical"];
    const baseIndex = severityOrder.indexOf(baseSeverity);
    
    // Apply multiplier to index
    const adjustedIndex = Math.round(baseIndex * multiplier);
    const clampedIndex = Math.min(Math.max(adjustedIndex, 0), severityOrder.length - 1);
    
    return severityOrder[clampedIndex];
  }

  /**
   * Create a finding with confidence metadata.
   */
  private createFinding(
    severity: Severity,
    category: Finding["category"],
    file: string,
    line: number,
    comment: string,
    suggestion: string,
    confidence: number,
  ): Finding {
    return {
      severity,
      category,
      file,
      line,
      comment,
      suggestion,
      source: "static",
      // @ts-ignore - Adding confidence metadata
      confidence,
    };
  }

  /**
   * Apply custom rules to the file content.
   */
  private applyCustomRules(path: string, content: string): Finding[] {
    const findings: Finding[] = [];

    for (const rule of this.customRules) {
      // Check if rule applies to this file
      if (rule.filePatterns && !rule.filePatterns.some(pattern => path.includes(pattern))) {
        continue;
      }

      try {
        const regex = new RegExp(rule.pattern, "gi");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            findings.push(this.createFinding(
              rule.severity,
              rule.category,
              path,
              idx + 1,
              rule.comment,
              rule.suggestion || "",
              rule.confidence || 0.7,
            ));
          }
        });
      } catch {
        // Skip invalid regex patterns
      }
    }

    return findings;
  }

  /**
   * Filter findings by confidence thresholds.
   */
  private filterByConfidence(findings: Finding[]): Finding[] {
    return findings.filter(finding => {
      // @ts-ignore - Using confidence metadata
      const confidence = finding.confidence || 0.5;
      const threshold = (this.confidenceThresholds as unknown as Record<string, number>)[finding.category] || 0.5;
      return confidence >= threshold;
    });
  }

  /**
   * Detect deep nesting with severity adjustment.
   */
  private detectDeepNesting(
    path: string,
    lines: string[],
    severityMultiplier: number,
  ): Finding[] {
    const findings: Finding[] = [];
    const maxDepth = 4;

    lines.forEach((line, idx) => {
      const indent = line.search(/\S/);
      if (indent >= 0) {
        const depth = Math.floor(indent / 2);
        if (depth > maxDepth) {
          findings.push(this.createFinding(
            this.adjustSeverity("medium", severityMultiplier),
            "smell",
            path,
            idx + 1,
            `Deep nesting detected (depth: ${depth}).`,
            "Consider extracting logic into separate functions.",
            Math.min(0.5 + (depth - maxDepth) * 0.1, 0.9), // Higher depth = higher confidence
          ));
        }
      }
    });

    return findings;
  }

  /**
   * Detect magic numbers with severity adjustment.
   */
  private detectMagicNumbers(
    path: string,
    lines: string[],
    severityMultiplier: number,
  ): Finding[] {
    const findings: Finding[] = [];
    const magicNumberRegex = /(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])/g;

    lines.forEach((line, idx) => {
      if (line.trim().startsWith("//") || line.trim().startsWith("import") || line.trim().startsWith("export")) {
        return;
      }

      let match;
      while ((match = magicNumberRegex.exec(line)) !== null) {
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          `Magic number ${match[0]} detected.`,
          "Consider extracting to a named constant.",
          0.7, // Medium confidence
        ));
      }
    });

    return findings;
  }

  /**
   * Detect missing error handling with severity adjustment.
   */
  private detectMissingErrorHandling(
    path: string,
    content: string,
    severityMultiplier: number,
  ): Finding[] {
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
        findings.push(this.createFinding(
          this.adjustSeverity("low", severityMultiplier),
          "smell",
          path,
          idx + 1,
          "Await call without error handling.",
          "Wrap in try/catch for proper error handling.",
          0.8, // High confidence
        ));
      }
    });

    return findings;
  }

  /**
   * Detect long functions with severity adjustment.
   */
  private detectLongFunctions(
    path: string,
    lines: string[],
    severityMultiplier: number,
  ): Finding[] {
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
            findings.push(this.createFinding(
              this.adjustSeverity("medium", severityMultiplier),
              "smell",
              path,
              functionStart + 1,
              `Long function "${functionName}" (${functionLength} lines).`,
              "Consider breaking into smaller functions.",
              Math.min(0.5 + (functionLength - 50) * 0.01, 0.9), // Longer = higher confidence
            ));
          }
          functionStart = -1;
        }
      }
    });

    return findings;
  }

  /**
   * Analyze multiple files with enhanced features.
   */
  analyzeMany(
    files: { path: string; content: string }[],
    options?: {
      fileHistories?: Map<string, FileHistory>;
      previousFindings?: Map<string, Finding[]>;
    },
  ): Finding[] {
    return files.flatMap(f => 
      this.analyze(f.path, f.content, {
        fileHistory: options?.fileHistories?.get(f.path),
        previousFindings: options?.previousFindings?.get(f.path),
      })
    );
  }

  /**
   * Update analysis context with new file history.
   */
  updateContext(fileHistory: Map<string, FileHistory>): void {
    this.analysisContext.fileHistory = fileHistory;
  }

  /**
   * Get analysis context for comparison.
   */
  getContext(): AnalysisContext {
    return { ...this.analysisContext };
  }

  /**
   * Add a custom rule.
   */
  addCustomRule(rule: CustomRule): void {
    this.customRules.push(rule);
  }

  /**
   * Remove a custom rule by ID.
   */
  removeCustomRule(ruleId: string): void {
    this.customRules = this.customRules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Update confidence thresholds.
   */
  updateConfidenceThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    this.confidenceThresholds = { ...this.confidenceThresholds, ...thresholds };
  }

  /**
   * Update severity adjustment configuration.
   */
  updateSeverityConfig(config: Partial<SeverityAdjustmentConfig>): void {
    this.severityConfig = { ...this.severityConfig, ...config };
  }
}