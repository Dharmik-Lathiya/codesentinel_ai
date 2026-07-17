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
  ranges: { file: string; start: number; end: number }[];
  /** Code content (for display). */
  content: string;
  /** Similarity score (0-1). */
  similarity: number;
}

/**
 * Progressive analyzer that performs analysis in stages.
 */
export class ProgressiveAnalyzer {
  private config: ProgressiveAnalysisConfig;
  private multiFileConfig: MultiFileAnalysisConfig;

  constructor(
    config?: Partial<ProgressiveAnalysisConfig>,
    multiFileConfig?: Partial<MultiFileAnalysisConfig>,
  ) {
    this.config = {
      quickScanRules: ["security", "critical"],
      standardScanRules: ["security", "bug", "performance", "smell"],
      deepScanRules: ["security", "bug", "performance", "smell", "style", "experimental"],
      autoEscalate: true,
      escalationThreshold: 5,
      ...config,
    };

    this.multiFileConfig = {
      maxConcurrentFiles: 10,
      analyzeDependencies: true,
      analyzeImports: true,
      analyzePatterns: true,
      fileGroupPatterns: ["src/", "lib/", "test/"],
      ...multiFileConfig,
    };
  }

  /**
   * Perform progressive analysis starting with quick scan.
   */
  async analyzeProgressive(
    files: { path: string; content: string }[],
    analyzer: (path: string, content: string, rules?: string[]) => Finding[],
  ): Promise<ProgressiveAnalysisResult[]> {
    const results: ProgressiveAnalysisResult[] = [];
    let totalFindings: Finding[] = [];

    // Quick scan
    const quickResult = await this.performAnalysis(
      files,
      analyzer,
      "quick",
      this.config.quickScanRules,
    );
    results.push(quickResult);
    totalFindings.push(...quickResult.findings);

    // Check if escalation is needed
    if (this.config.autoEscalate && 
        quickResult.findings.length >= this.config.escalationThreshold) {
      
      // Standard scan
      const standardResult = await this.performAnalysis(
        files,
        analyzer,
        "standard",
        this.config.standardScanRules,
      );
      results.push(standardResult);
      totalFindings.push(...standardResult.findings);

      // Deep scan if still finding issues
      if (standardResult.findings.length >= this.config.escalationThreshold) {
        const deepResult = await this.performAnalysis(
          files,
          analyzer,
          "deep",
          this.config.deepScanRules,
        );
        results.push(deepResult);
        totalFindings.push(...deepResult.findings);
      }
    }

    // Update total findings count
    results.forEach(r => {
      r.totalFindings = totalFindings.length;
    });

    return results;
  }

  /**
   * Perform analysis at a specific depth.
   */
  private async performAnalysis(
    files: { path: string; content: string }[],
    analyzer: (path: string, content: string, rules?: string[]) => Finding[],
    depth: AnalysisDepth,
    rules: string[],
  ): Promise<ProgressiveAnalysisResult> {
    const startTime = Date.now();
    const findings: Finding[] = [];

    for (const file of files) {
      const fileFindings = analyzer(file.path, file.content, rules);
      findings.push(...fileFindings);
    }

    return {
      depth,
      findings,
      escalated: false,
      durationMs: Date.now() - startTime,
      rulesApplied: rules,
      totalFindings: findings.length,
    };
  }

  /**
   * Perform multi-file analysis with cross-file insights.
   */
  async analyzeMultiFile(
    files: { path: string; content: string }[],
    analyzer: (path: string, content: string) => Finding[],
  ): Promise<MultiFileAnalysisResult> {
    const fileResults = new Map<string, Finding[]>();
    const crossFileFindings: Finding[] = [];

    // Analyze each file
    for (const file of files) {
      const findings = analyzer(file.path, file.content);
      fileResults.set(file.path, findings);
    }

    // Perform cross-file analysis
    if (this.multiFileConfig.analyzeDependencies) {
      const dependencyAnalysis = this.analyzeDependencies(files);
      crossFileFindings.push(...this.generateDependencyFindings(dependencyAnalysis));
    }

    if (this.multiFileConfig.analyzeImports) {
      const importExportAnalysis = this.analyzeImportsExports(files);
      crossFileFindings.push(...this.generateImportExportFindings(importExportAnalysis));
    }

    if (this.multiFileConfig.analyzePatterns) {
      const patternAnalysis = this.analyzePatterns(files);
      crossFileFindings.push(...this.generatePatternFindings(patternAnalysis));
    }

    // Calculate summary
    const totalFindings = Array.from(fileResults.values())
      .reduce((sum, findings) => sum + findings.length, 0) + crossFileFindings.length;

    let mostProblematicFile = "";
    let mostProblematicFileFindings = 0;

    for (const [file, findings] of fileResults) {
      if (findings.length > mostProblematicFileFindings) {
        mostProblematicFile = file;
        mostProblematicFileFindings = findings.length;
      }
    }

    return {
      fileResults,
      crossFileFindings,
      summary: {
        totalFiles: files.length,
        totalFindings,
        averageFindingsPerFile: files.length > 0 ? totalFindings / files.length : 0,
        mostProblematicFile,
        mostProblematicFileFindings,
      },
    };
  }

  /**
   * Analyze dependencies between files.
   */
  private analyzeDependencies(
    files: { path: string; content: string }[],
  ): DependencyAnalysis {
    const graph = new Map<string, Set<string>>();
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;

    // Build dependency graph
    for (const file of files) {
      const dependencies = new Set<string>();
      let match;

      // Reset regex lastIndex for each file
      importRegex.lastIndex = 0;
      requireRegex.lastIndex = 0;

      // Check imports
      while ((match = importRegex.exec(file.content)) !== null) {
        const dep = this.resolveDependency(file.path, match[1]);
        if (dep) dependencies.add(dep);
      }

      // Check requires
      while ((match = requireRegex.exec(file.content)) !== null) {
        const dep = this.resolveDependency(file.path, match[1]);
        if (dep) dependencies.add(dep);
      }

      graph.set(file.path, dependencies);
    }

    // Detect circular dependencies
    const circularDependencies = this.detectCircularDependencies(graph);

    // Calculate fan-in/fan-out
    const fanIn = new Map<string, number>();
    const fanOut = new Map<string, number>();

    for (const [file, deps] of graph) {
      fanOut.set(file, deps.size);
      for (const dep of deps) {
        fanIn.set(dep, (fanIn.get(dep) || 0) + 1);
      }
    }

    const highFanOut = Array.from(fanOut.entries())
      .filter(([_, count]) => count > 10)
      .map(([file, _]) => file);

    const highFanIn = Array.from(fanIn.entries())
      .filter(([_, count]) => count > 10)
      .map(([file, _]) => file);

    return {
      graph,
      circularDependencies,
      highFanOut,
      highFanIn,
    };
  }

  /**
   * Resolve a dependency path relative to a file.
   */
  private resolveDependency(filePath: string, importPath: string): string | null {
    if (importPath.startsWith(".")) {
      // Relative import - resolve it
      const parts = filePath.split("/");
      parts.pop(); // remove filename
      for (const segment of importPath.split("/")) {
        if (segment === "..") {
          parts.pop();
        } else if (segment !== ".") {
          parts.push(segment);
        }
      }
      return parts.join("/");
    }
    // External dependency - skip
    return null;
  }

  /**
   * Detect circular dependencies in the graph.
   */
  private detectCircularDependencies(
    graph: Map<string, Set<string>>,
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const deps = graph.get(node) || new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Analyze imports and exports across files.
   */
  private analyzeImportsExports(
    files: { path: string; content: string }[],
  ): ImportExportAnalysis {
    const unusedImports = new Map<string, string[]>();
    const missingExports = new Map<string, string[]>();
    let totalImports = 0;
    let totalExports = 0;

    for (const file of files) {
      const importPaths = this.extractImports(file.content);
      const importedNames = this.extractImportedNames(file.content);
      const exports = this.extractExports(file.content);

      totalImports += importPaths.length;
      totalExports += exports.length;

      // Find unused imports by checking if imported identifiers are used in code
      const contentWithoutImports = file.content.replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*/g, "");
      const unused: string[] = [];
      for (let i = 0; i < importedNames.length; i++) {
        const name = importedNames[i];
        // Use word boundary check to avoid matching substrings
        const wordRegex = new RegExp(`\\b${name}\\b`);
        if (!wordRegex.test(contentWithoutImports)) {
          unused.push(importPaths[i] || name);
        }
      }
      if (unused.length > 0) {
        unusedImports.set(file.path, unused);
      }
    }

    return {
      unusedImports,
      missingExports,
      stats: {
        totalImports,
        totalExports,
        averageImportsPerFile: files.length > 0 ? totalImports / files.length : 0,
      },
    };
  }

  /**
   * Extract imports from file content.
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Extract the imported identifiers from an import statement.
   */
  private extractImportedNames(content: string): string[] {
    const names: string[] = [];
    const importRegex = /import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importClause = match[1].trim();
      if (importClause === "*") continue; // namespace import
      if (importClause.startsWith("{")) {
        // Named imports: { a, b as c }
        const named = importClause.replace(/[{}]/g, "").split(",").map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return (parts[1] || parts[0]).trim();
        }).filter(Boolean);
        names.push(...named);
      } else {
        // Default import
        names.push(importClause);
      }
    }

    return names;
  }

  /**
   * Extract exports from file content.
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  /**
   * Analyze code patterns across files.
   */
  private analyzePatterns(
    files: { path: string; content: string }[],
  ): PatternAnalysis {
    const patterns: CodePattern[] = [];
    const duplicateCode: DuplicateCodeBlock[] = [];

    // Detect common patterns
    const errorHandlingPattern = this.detectErrorHandlingPattern(files);
    if (errorHandlingPattern) patterns.push(errorHandlingPattern);

    const asyncPattern = this.detectAsyncPattern(files);
    if (asyncPattern) patterns.push(asyncPattern);

    // Detect duplicate code blocks
    const duplicates = this.detectDuplicateCode(files);
    duplicateCode.push(...duplicates);

    return {
      patterns,
      duplicateCode,
      stats: {
        totalPatterns: patterns.length,
        totalDuplicates: duplicateCode.length,
        averagePatternSize: duplicateCode.length > 0 
          ? duplicateCode.reduce((sum, d) => sum + d.content.split("\n").length, 0) / duplicateCode.length
          : 0,
      },
    };
  }

  /**
   * Detect error handling patterns.
   */
  private detectErrorHandlingPattern(
    files: { path: string; content: string }[],
  ): CodePattern | null {
    const filesWithPattern: string[] = [];
    const errorHandlingRegex = /try\s*\{[\s\S]*?\}\s*catch\s*\(/g;

    for (const file of files) {
      if (errorHandlingRegex.test(file.content)) {
        filesWithPattern.push(file.path);
      }
    }

    if (filesWithPattern.length >= 3) {
      return {
        id: "error-handling-pattern",
        description: "Consistent error handling pattern using try/catch",
        files: filesWithPattern,
        frequency: filesWithPattern.length,
        severity: "info",
      };
    }

    return null;
  }

  /**
   * Detect async/await patterns.
   */
  private detectAsyncPattern(
    files: { path: string; content: string }[],
  ): CodePattern | null {
    const filesWithPattern: string[] = [];
    const asyncRegex = /async\s+(?:function|()=>)/g;

    for (const file of files) {
      if (asyncRegex.test(file.content)) {
        filesWithPattern.push(file.path);
      }
    }

    if (filesWithPattern.length >= 3) {
      return {
        id: "async-pattern",
        description: "Consistent async/await pattern",
        files: filesWithPattern,
        frequency: filesWithPattern.length,
        severity: "info",
      };
    }

    return null;
  }

  /**
   * Detect duplicate code blocks.
   */
  private detectDuplicateCode(
    files: { path: string; content: string }[],
  ): DuplicateCodeBlock[] {
    const duplicates: DuplicateCodeBlock[] = [];
    const minLines = 5; // Minimum lines for duplicate detection
    const similarityThreshold = 0.8;

    // Simple duplicate detection (line-based)
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const file1 = files[i];
        const file2 = files[j];

        const lines1 = file1.content.split("\n");
        const lines2 = file2.content.split("\n");

        // Find common line sequences
        for (let start1 = 0; start1 < lines1.length - minLines; start1++) {
          for (let start2 = 0; start2 < lines2.length - minLines; start2++) {
            let matchLength = 0;
            while (
              start1 + matchLength < lines1.length &&
              start2 + matchLength < lines2.length &&
              lines1[start1 + matchLength].trim() === lines2[start2 + matchLength].trim()
            ) {
              matchLength++;
            }

            if (matchLength >= minLines) {
              const similarity = matchLength / Math.max(lines1.length, lines2.length);
              if (similarity >= similarityThreshold) {
                duplicates.push({
                  files: [file1.path, file2.path],
                  ranges: [
                    { file: file1.path, start: start1 + 1, end: start1 + matchLength },
                    { file: file2.path, start: start2 + 1, end: start2 + matchLength },
                  ],
                  content: lines1.slice(start1, start1 + matchLength).join("\n"),
                  similarity,
                });
              }
            }
          }
        }
      }
    }

    return duplicates;
  }

  /**
   * Generate findings from dependency analysis.
   */
  private generateDependencyFindings(
    analysis: DependencyAnalysis,
  ): Finding[] {
    const findings: Finding[] = [];

    // Circular dependencies
    for (const cycle of analysis.circularDependencies) {
      findings.push({
        severity: "high",
        category: "bug",
        file: cycle[0],
        line: null,
        comment: `Circular dependency detected: ${cycle.join(" → ")}`,
        suggestion: "Refactor to break the circular dependency.",
        source: "static",
      });
    }

    // High fan-out
    for (const file of analysis.highFanOut) {
      findings.push({
        severity: "medium",
        category: "smell",
        file,
        line: null,
        comment: "File has too many dependencies (high fan-out).",
        suggestion: "Consider splitting into smaller modules.",
        source: "static",
      });
    }

    // High fan-in
    for (const file of analysis.highFanIn) {
      findings.push({
        severity: "info",
        category: "smell",
        file,
        line: null,
        comment: "File is depended on by many others (high fan-in).",
        suggestion: "Consider if this is a god module that should be split.",
        source: "static",
      });
    }

    return findings;
  }

  /**
   * Generate findings from import/export analysis.
   */
  private generateImportExportFindings(
    analysis: ImportExportAnalysis,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const [file, imports] of analysis.unusedImports) {
      for (const imp of imports) {
        findings.push({
          severity: "low",
          category: "smell",
          file,
          line: null,
          comment: `Unused import: ${imp}`,
          suggestion: "Remove unused imports to keep code clean.",
          source: "static",
        });
      }
    }

    return findings;
  }

  /**
   * Generate findings from pattern analysis.
   */
  private generatePatternFindings(
    analysis: PatternAnalysis,
  ): Finding[] {
    const findings: Finding[] = [];

    for (const pattern of analysis.patterns) {
      if (pattern.frequency > 5) {
        findings.push({
          severity: "info",
          category: "style",
          file: pattern.files[0],
          line: null,
          comment: `Common pattern detected: ${pattern.description} (${pattern.frequency} occurrences)`,
          suggestion: "Consider extracting to a shared utility.",
          source: "static",
        });
      }
    }

    for (const duplicate of analysis.duplicateCode) {
      findings.push({
        severity: "medium",
        category: "smell",
        file: duplicate.files[0],
        line: duplicate.ranges[0].start,
        comment: `Duplicate code detected across ${duplicate.files.length} files (${Math.round(duplicate.similarity * 100)}% similar)`,
        suggestion: "Extract common code into a shared module.",
        source: "static",
      });
    }

    return findings;
  }
}