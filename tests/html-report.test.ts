import { describe, it, expect } from "vitest";
import { renderHtmlReport, type EngineReport } from "../src/utils/html-report.js";

describe("renderHtmlReport", () => {
  const baseReport: EngineReport = {
    mode: "review",
    summary: "Found 3 issues",
    findings: [
      {
        severity: "high",
        category: "security",
        file: "src/app.ts",
        line: 10,
        comment: "SQL injection risk",
        suggestion: "Use parameterized queries",
        source: "static",
      },
      {
        severity: "low",
        category: "smell",
        file: "src/utils.ts",
        line: null,
        comment: "Unused variable",
        source: "static",
      },
      {
        severity: "medium",
        category: "bug",
        file: "src/auth.ts",
        line: 42,
        comment: "Null dereference possible",
        source: "ai",
      },
    ],
    score: {
      overall: 72,
      readability: 80,
      maintainability: 65,
      security: 70,
      test_coverage: 75,
      rationale: "Test rationale",
    },
    comments: [],
    generatedTests: [],
    fixAttempts: [],
    metrics: { filesAnalyzed: 5, findingsBySeverity: { high: 1, medium: 1, low: 1 }, durationMs: 150 },
  };

  it("produces valid HTML", () => {
    const html = renderHtmlReport(baseReport);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>CodeSentinel — review Report</title>");
    expect(html).toContain("SQL injection risk");
    expect(html).toContain("src/app.ts:10");
  });

  it("includes score card when score is present", () => {
    const html = renderHtmlReport(baseReport);
    expect(html).toContain("Quality Score");
    expect(html).toContain("72");
    expect(html).toContain("Readability 80");
  });

  it("omits score card when score is null", () => {
    const report = { ...baseReport, score: null };
    const html = renderHtmlReport(report);
    expect(html).not.toContain("Quality Score");
  });

  it("handles empty findings", () => {
    const report = { ...baseReport, findings: [], metrics: { ...baseReport.metrics, findingsBySeverity: {} } };
    const html = renderHtmlReport(report);
    expect(html).toContain("No findings detected");
  });

  it("includes severity distribution bars", () => {
    const html = renderHtmlReport(baseReport);
    expect(html).toContain("Severity Distribution");
    expect(html).toContain("high");
    expect(html).toContain("medium");
    expect(html).toContain("low");
  });

  it("includes category breakdown bars", () => {
    const html = renderHtmlReport(baseReport);
    expect(html).toContain("Category Breakdown");
    expect(html).toContain("security");
    expect(html).toContain("smell");
    expect(html).toContain("bug");
  });

  it("escapes HTML in findings", () => {
    const report = {
      ...baseReport,
      findings: [{
        severity: "high" as const,
        category: "security" as const,
        file: "x.ts",
        line: 1,
        comment: "<script>alert('xss')</script>",
        source: "static" as const,
      }],
      metrics: { ...baseReport.metrics, findingsBySeverity: { high: 1 } },
    };
    const html = renderHtmlReport(report);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows fix attempts table when present", () => {
    const report: EngineReport = {
      ...baseReport,
      fixAttempts: [{
        iteration: 1,
        file: "src/app.ts",
        fixed: true,
        explanation: "Added null check",
        verified: true,
      }],
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("Fix Attempts");
    expect(html).toContain("Added null check");
    expect(html).toContain("verified");
  });

  it("shows generated tests table when present", () => {
    const report: EngineReport = {
      ...baseReport,
      generatedTests: [{
        file: "src/app.ts",
        testFilePath: "src/app.test.ts",
        content: "test code",
      }],
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("Generated Tests");
    expect(html).toContain("src/app.test.ts");
  });
});
