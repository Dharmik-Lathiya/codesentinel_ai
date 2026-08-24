import { describe, it, expect, vi } from "vitest";
import { verifyFindings } from "../src/opencode/verifier.js";
import type { Issue } from "../src/opencode/jsonl-parser.js";

function makeIssue(overrides: Partial<Issue>): Issue {
  return {
    severity: "minor",
    file: "src/test.ts",
    line: 10,
    message: "Legitimate code issue found in this file",
    ...overrides,
  } as Issue;
}

describe("verifyFindings — rule-based filtering", () => {
  it("drops issues in node_modules/", async () => {
    const findings: Issue[] = [
      makeIssue({ file: "node_modules/pkg/index.js", message: "Hardcoded secret key left in source" }),
      makeIssue({ file: "src/good.ts", message: "Async function missing error handling" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe("src/good.ts");
  });

  it("drops issues in .git/", async () => {
    const findings: Issue[] = [
      makeIssue({ file: ".git/config", message: "Sensitive file exposed in repo" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(0);
  });

  it("drops issues in dist/", async () => {
    const findings: Issue[] = [
      makeIssue({ file: "dist/bundle.js", message: "Minified output should be ignored" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(0);
  });

  it("drops issues with negative or zero line", async () => {
    const findings: Issue[] = [
      makeIssue({ line: -1, message: "Negative line number in report" }),
      makeIssue({ line: 0, message: "Zero line number in report" }),
      makeIssue({ line: 5, message: "Valid line number reference here" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(5);
  });

  it("drops vague messages (too short)", async () => {
    const findings: Issue[] = [
      makeIssue({ message: "Fix" }),
      makeIssue({ message: "OK" }),
      makeIssue({ message: "This is a detailed actionable message" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("This is a detailed actionable message");
  });

  it("drops vague messages with generic phrases", async () => {
    const findings: Issue[] = [
      makeIssue({ message: "This code needs improvement in many areas" }),
      makeIssue({ message: "Could be better written in this section" }),
      makeIssue({ message: "Consider refactoring this entire module" }),
      makeIssue({ message: "Memory leak in render loop" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Memory leak in render loop");
  });

  it("keeps all critical severity findings regardless of other rules", async () => {
    const findings: Issue[] = [
      makeIssue({ severity: "critical", file: "node_modules/evil.ts", message: "XSS vulnerability" }),
      makeIssue({ severity: "critical", line: 0, message: "SQL injection risk" }),
      makeIssue({ severity: "critical", message: "Fix" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty input", async () => {
    const result = await verifyFindings([]);
    expect(result).toEqual([]);
  });

  it("keeps all valid findings when no rules match", async () => {
    const findings: Issue[] = [
      makeIssue({ severity: "important", file: "src/app.ts", line: 42, message: "Unhandled promise rejection" }),
      makeIssue({ severity: "minor", file: "src/utils.ts", line: 15, message: "Unused import: lodash" }),
    ];
    const result = await verifyFindings(findings);
    expect(result).toHaveLength(2);
  });
});

describe("verifyFindings — AI verification pass", () => {
  it("uses AI to verify and returns only confirmed findings", async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: "[0, 1]",
      model: "test-model",
      provider: "test-provider",
    });
    const mockAIHub = { complete: mockComplete } as any;

    const findings: Issue[] = [
      makeIssue({ message: "Real bug in auth flow here" }),
      makeIssue({ message: "SQL injection in user input field" }),
      makeIssue({ message: "Vague" }),
    ];

    const result = await verifyFindings(findings, {
      aiHub: mockAIHub,
      useAi: true,
    });

    expect(result).toHaveLength(2);
    expect(result[0].message).toBe("Real bug in auth flow here");
    expect(result[1].message).toBe("SQL injection in user input field");
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it("returns rule-based results when AI call fails", async () => {
    const mockComplete = vi.fn().mockRejectedValue(new Error("AI unavailable"));
    const mockAIHub = { complete: mockComplete } as any;

    const findings: Issue[] = [
      makeIssue({ message: "Real bug in authentication flow" }),
      makeIssue({ message: "Minor issue in error handling" }),
    ];

    const result = await verifyFindings(findings, {
      aiHub: mockAIHub,
      useAi: true,
    });

    expect(result).toHaveLength(2);
    expect(mockComplete).toHaveBeenCalledOnce();
  });

  it("handles invalid AI response gracefully", async () => {
    const mockComplete = vi.fn().mockResolvedValue({
      content: "not valid json at all",
      model: "test-model",
      provider: "test-provider",
    });
    const mockAIHub = { complete: mockComplete } as any;

    const findings: Issue[] = [
      makeIssue({ message: "Real bug in auth module here" }),
      makeIssue({ message: "Performance issue in render loop" }),
    ];

    const result = await verifyFindings(findings, {
      aiHub: mockAIHub,
      useAi: true,
    });

    expect(result).toHaveLength(2);
  });

  it("does not call AI when useAi is false even with aiHub", async () => {
    const mockComplete = vi.fn();
    const mockAIHub = { complete: mockComplete } as any;

    const findings: Issue[] = [
      makeIssue({ message: "Real bug in authentication module" }),
    ];

    const result = await verifyFindings(findings, {
      aiHub: mockAIHub,
      useAi: false,
    });

    expect(result).toHaveLength(1);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("does not call AI when aiHub is not provided even with useAi true", async () => {
    const findings: Issue[] = [
      makeIssue({ message: "Real bug in authentication module here" }),
    ];

    const result = await verifyFindings(findings, {
      useAi: true,
    });

    expect(result).toHaveLength(1);
  });
});
