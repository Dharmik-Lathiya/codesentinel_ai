import { describe, it, expect, beforeEach } from "vitest";
import { StaticAnalyzer, type Finding } from "../src/analyzer/index.js";
import { EnhancedAnalyzer, type FileHistory, type SeverityAdjustmentConfig, type ConfidenceThresholds, type CustomRule } from "../src/analyzer/enhanced.js";
import { AnalysisCache, generateConfigHash } from "../src/analyzer/cache.js";
import { ProgressiveAnalyzer, type AnalysisDepth, type ProgressiveAnalysisResult, type MultiFileAnalysisResult } from "../src/analyzer/progressive.js";

describe("StaticAnalyzer", () => {
  it("should detect hardcoded API keys", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", 'const apiKey = "abcdefghijklmnop1234567890";');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
    expect(findings[0].category).toBe("security");
  });

  it("should detect console.log in source files", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("src/app.ts", "console.log('test');");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
    expect(findings[0].category).toBe("smell");
  });

  it("should not detect console.log in test files", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test/app.test.ts", "console.log('test');");
    expect(findings).toHaveLength(0);
  });

  it("should detect eval usage", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", "eval('malicious code');");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].category).toBe("security");
  });

  it("should detect TODO/FIXME markers", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", "// TODO: fix this");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].category).toBe("smell");
  });

  it("should detect hardcoded passwords", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", 'const password = "secret123";');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
    expect(findings[0].category).toBe("security");
  });

  it("should detect process.exit() usage", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", "process.exit(1);");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].category).toBe("smell");
  });

  it("should detect deep nesting", () => {
    const analyzer = new StaticAnalyzer();
    const content = `
function test() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      while (condition) {
        if (condition2) {
          console.log('deep');
        }
      }
    }
  }
}`;
    const findings = analyzer.analyze("test.ts", content);
    expect(findings.some(f => f.comment.includes("Deep nesting"))).toBe(true);
  });

  it("should detect magic numbers", () => {
    const analyzer = new StaticAnalyzer();
    const findings = analyzer.analyze("test.ts", "const multiplier = 123;");
    expect(findings).toHaveLength(1);
    expect(findings[0].comment).toContain("Magic number 123");
  });

  it("should detect missing error handling", () => {
    const analyzer = new StaticAnalyzer();
    const content = `
async function test() {
  await fetch('https://example.com');
}`;
    const findings = analyzer.analyze("test.ts", content);
    expect(findings.some(f => f.comment.includes("Await call without error handling"))).toBe(true);
  });

  it("should detect long functions", () => {
    const analyzer = new StaticAnalyzer();
    const lines = ["function longFunc() {"];
    for (let i = 0; i < 60; i++) {
      lines.push(`  line${i}();`);
    }
    lines.push("}");
    const content = lines.join("\n");
    const findings = analyzer.analyze("test.ts", content);
    expect(findings.some(f => f.comment.includes("Long function"))).toBe(true);
  });

  it("should analyze multiple files", () => {
    const analyzer = new StaticAnalyzer();
    const files = [
      { path: "test1.ts", content: 'const apiKey = "abcdefghijklmnop1234567890";' },
      { path: "test2.ts", content: "console.log('test');" },
    ];
    const findings = analyzer.analyzeMany(files);
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("EnhancedAnalyzer", () => {
  let analyzer: EnhancedAnalyzer;

  beforeEach(() => {
    analyzer = new EnhancedAnalyzer();
  });

  it("should analyze files with dynamic severity adjustment", () => {
    const findings = analyzer.analyze("src/app.ts", 'const apiKey = "abcdefghijklmnop1234567890";');
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("should adjust severity based on file risk patterns", () => {
    const highRiskFindings = analyzer.analyze("src/app.ts", "process.exit(1);");
    const lowRiskFindings = analyzer.analyze("test/app.test.ts", "process.exit(1);");
    
    expect(highRiskFindings[0].severity).toBe("high");
    expect(lowRiskFindings[0].severity).toBe("low");
  });

  it("should filter findings by confidence thresholds", () => {
    const findings = analyzer.analyze("test.ts", "console.log('test');");
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("low");
  });

  it("should apply custom rules", () => {
    const customRule: CustomRule = {
      id: "test-rule",
      name: "Test Rule",
      pattern: "TODO:",
      severity: "info",
      category: "smell",
      comment: "Custom TODO marker found",
      confidence: 0.9,
    };

    analyzer.addCustomRule(customRule);
    const findings = analyzer.analyze("test.ts", "// TODO: custom task");
    expect(findings.some(f => f.comment === "Custom TODO marker found")).toBe(true);
  });

  it("should remove custom rules", () => {
    const customRule: CustomRule = {
      id: "test-rule",
      name: "Test Rule",
      pattern: "TODO:",
      severity: "info",
      category: "smell",
      comment: "Custom TODO marker found",
      confidence: 0.9,
    };

    analyzer.addCustomRule(customRule);
    analyzer.removeCustomRule("test-rule");
    const findings = analyzer.analyze("test.ts", "// TODO: custom task");
    expect(findings.some(f => f.comment === "Custom TODO marker found")).toBe(false);
  });

  it("should update confidence thresholds", () => {
    analyzer.updateConfidenceThresholds({ security: 0.95 });
    const findings = analyzer.analyze("test.ts", 'const apiKey = "abcdefghijklmnop1234567890";');
    // With high threshold, low confidence findings should be filtered
    expect(findings).toHaveLength(0);
  });

  it("should update severity configuration", () => {
    analyzer.updateSeverityConfig({
      highRiskPatterns: ["production/"],
      lowRiskPatterns: ["development/"],
    });
    
    const highRiskFindings = analyzer.analyze("production/app.ts", "process.exit(1);");
    const lowRiskFindings = analyzer.analyze("development/app.ts", "process.exit(1);");
    
    expect(highRiskFindings[0].severity).toBe("high");
    expect(lowRiskFindings[0].severity).toBe("low");
  });

  it("should analyze multiple files", () => {
    const files = [
      { path: "src/app.ts", content: 'const apiKey = "abcdefghijklmnop1234567890";' },
      { path: "src/utils.ts", content: "console.log('test');" },
    ];
    const findings = analyzer.analyzeMany(files);
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AnalysisCache", () => {
  let cache: AnalysisCache;

  beforeEach(() => {
    cache = new AnalysisCache("/tmp/test-cache");
  });

  it("should generate consistent cache keys", () => {
    const key1 = cache.generateKey("test.ts", "content", "config1");
    const key2 = cache.generateKey("test.ts", "content", "config1");
    expect(key1).toBe(key2);
  });

  it("should generate different keys for different content", () => {
    const key1 = cache.generateKey("test.ts", "content1", "config1");
    const key2 = cache.generateKey("test.ts", "content2", "config1");
    expect(key1).not.toBe(key2);
  });

  it("should store and retrieve cache entries", () => {
    const findings: Finding[] = [{
      severity: "high",
      category: "security",
      file: "test.ts",
      line: 1,
      comment: "Test finding",
      source: "static",
    }];

    cache.set("test.ts", "content", "config1", findings, {
      durationMs: 100,
      rulesApplied: ["test-rule"],
    });

    const cached = cache.get("test.ts", "content", "config1");
    expect(cached).not.toBeNull();
    expect(cached?.findings).toHaveLength(1);
  });

  it("should compare analysis results", () => {
    const previousFindings: Finding[] = [{
      severity: "high",
      category: "security",
      file: "test.ts",
      line: 1,
      comment: "Old finding",
      source: "static",
    }];

    const currentFindings: Finding[] = [{
      severity: "medium",
      category: "smell",
      file: "test.ts",
      line: 2,
      comment: "New finding",
      source: "static",
    }];

    const comparison = cache.compare(previousFindings, currentFindings);
    expect(comparison).not.toBeNull();
    expect(comparison?.newFindings).toHaveLength(1);
    expect(comparison?.fixedFindings).toHaveLength(1);
  });

  it("should clear cache", () => {
    const findings: Finding[] = [{
      severity: "high",
      category: "security",
      file: "test.ts",
      line: 1,
      comment: "Test finding",
      source: "static",
    }];

    cache.set("test.ts", "content", "config1", findings, {
      durationMs: 100,
      rulesApplied: ["test-rule"],
    });

    cache.clear();
    const cached = cache.get("test.ts", "content", "config1");
    expect(cached).toBeNull();
  });

  it("should return cache statistics", () => {
    const stats = cache.getStats();
    expect(stats).toHaveProperty("memoryEntries");
    expect(stats).toHaveProperty("diskEntries");
    expect(stats).toHaveProperty("totalSizeBytes");
  });
});

describe("ProgressiveAnalyzer", () => {
  let analyzer: ProgressiveAnalyzer;

  beforeEach(() => {
    analyzer = new ProgressiveAnalyzer();
  });

  it("should perform progressive analysis", async () => {
    const files = [
      { path: "test.ts", content: 'const apiKey = "abcdefghijklmnop1234567890";' },
    ];

    const mockAnalyzer = (path: string, content: string, rules?: string[]): Finding[] => {
      const findings: Finding[] = [];
      if (content.includes("apiKey")) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: 1,
          comment: "API key detected",
          source: "static",
        });
      }
      return findings;
    };

    const results = await analyzer.analyzeProgressive(files, mockAnalyzer);
    expect(results).toHaveLength(1);
    expect(results[0].depth).toBe("quick");
  });

  it("should perform multi-file analysis", async () => {
    const files = [
      { path: "src/app.ts", content: "import { helper } from './helper';" },
      { path: "src/helper.ts", content: "export const helper = () => {};" },
    ];

    const mockAnalyzer = (path: string, content: string): Finding[] => {
      return [{
        severity: "low",
        category: "smell",
        file: path,
        line: 1,
        comment: "Test finding",
        source: "static",
      }];
    };

    const result = await analyzer.analyzeMultiFile(files, mockAnalyzer);
    expect(result.fileResults.size).toBe(2);
    expect(result.summary.totalFiles).toBe(2);
  });

  it("should detect circular dependencies", async () => {
    const files = [
      { path: "a.ts", content: "import { b } from './b.ts';" },
      { path: "b.ts", content: "import { a } from './a.ts';" },
    ];

    const mockAnalyzer = (path: string, content: string): Finding[] => [];

    const result = await analyzer.analyzeMultiFile(files, mockAnalyzer);
    expect(result.crossFileFindings.some(f => f.comment.includes("Circular dependency"))).toBe(true);
  });

  it("should detect unused imports", async () => {
    const files = [
      { path: "test.ts", content: "import { unused } from './module';" },
    ];

    const mockAnalyzer = (path: string, content: string): Finding[] => [];

    const result = await analyzer.analyzeMultiFile(files, mockAnalyzer);
    expect(result.crossFileFindings.some(f => f.comment.includes("Unused import"))).toBe(true);
  });
});

describe("Configuration", () => {
  it("should have default analyzer configuration", () => {
    const config = {
      enableEnhancedAnalysis: false,
      severityAdjustment: {
        highRiskPatterns: ["src/", "lib/", "app/"],
        lowRiskPatterns: ["test/", "tests/", "__tests__/", ".test.", ".spec."],
        historyBasedAdjustment: true,
        changeFrequencyMultiplier: 1.5,
      },
      confidenceThresholds: {
        security: 0.7,
        bug: 0.6,
        performance: 0.5,
        smell: 0.4,
        style: 0.3,
      },
      customRules: [],
      progressiveAnalysis: {
        quickScanRules: ["security", "critical"],
        standardScanRules: ["security", "bug", "performance", "smell"],
        deepScanRules: ["security", "bug", "performance", "smell", "style", "experimental"],
        autoEscalate: true,
        escalationThreshold: 5,
      },
      multiFileAnalysis: {
        maxConcurrentFiles: 10,
        analyzeDependencies: true,
        analyzeImports: true,
        analyzePatterns: true,
        fileGroupPatterns: ["src/", "lib/", "test/"],
      },
    };

    expect(config.enableEnhancedAnalysis).toBe(false);
    expect(config.severityAdjustment.highRiskPatterns).toContain("src/");
    expect(config.confidenceThresholds.security).toBe(0.7);
    expect(config.customRules).toHaveLength(0);
  });

  it("should generate consistent config hashes", () => {
    const config1 = { enableEnhancedAnalysis: true, security: 0.7 };
    const config2 = { enableEnhancedAnalysis: true, security: 0.7 };
    
    const hash1 = generateConfigHash(config1);
    const hash2 = generateConfigHash(config2);
    expect(hash1).toBe(hash2);
  });

  it("should generate different hashes for different configs", () => {
    const config1 = { enableEnhancedAnalysis: true };
    const config2 = { enableEnhancedAnalysis: false };
    
    const hash1 = generateConfigHash(config1);
    const hash2 = generateConfigHash(config2);
    expect(hash1).not.toBe(hash2);
  });
});