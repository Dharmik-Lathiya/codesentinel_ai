import { describe, it, expect } from "vitest";
import { StaticAnalyzer } from "../src/analyzer/index.js";

describe("StaticAnalyzer", () => {
  const analyzer = new StaticAnalyzer();

  it("detects hardcoded API keys", () => {
    const findings = analyzer.analyze("config.ts", `const api_key = "sk_live_1234567890abcdef";`);
    const hit = findings.find((f) => f.category === "security" && /key/i.test(f.comment));
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("high");
  });

  it("flags eval as critical", () => {
    const findings = analyzer.analyze("x.ts", `eval(userInput)`);
    const hit = findings.find((f) => f.comment.includes("eval"));
    expect(hit?.severity).toBe("critical");
  });

  it("flags console.log outside test files", () => {
    const findings = analyzer.analyze("svc.ts", `console.log("hi")`);;
    expect(findings.some((f) => f.comment.includes("Debug logging"))).toBe(true);
  });

  it("ignores console.log inside test files", () => {
    const findings = analyzer.analyze("svc.test.ts", `console.log("hi")`);
    expect(findings.some((f) => f.comment.includes("Debug logging"))).toBe(false);
  });

  it("detects TODO markers", () => {
    const findings = analyzer.analyze("a.ts", `// TODO: refactor this`);
    expect(findings.some((f) => f.comment.includes("Tech-debt"))).toBe(true);
  });

  it("finds line numbers", () => {
    const findings = analyzer.analyze("a.ts", `line1\nline2\neval(x)\n`);
    const hit = findings.find((f) => f.comment.includes("eval"));
    expect(hit?.line).toBe(3);
  });
});
