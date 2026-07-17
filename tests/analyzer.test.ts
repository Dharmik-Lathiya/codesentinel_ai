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
    const findings = analyzer.analyze("svc.ts", `console.log("hi")`);
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

  it("detects hardcoded passwords", () => {
    const findings = analyzer.analyze("auth.ts", `const password = "secret123";`);
    const hit = findings.find((f) => f.comment.includes("hardcoded password"));
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("high");
  });

  it("detects process.exit()", () => {
    const findings = analyzer.analyze("main.ts", `process.exit(1)`);
    const hit = findings.find((f) => f.comment.includes("process.exit"));
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("medium");
  });

  it("detects deep nesting", () => {
    const deepCode = `
if (a) {
  if (b) {
    if (c) {
      if (d) {
        if (e) {
          console.log("deep");
        }
      }
    }
  }
}`;
    const findings = analyzer.analyze("deep.ts", deepCode);
    expect(findings.some((f) => f.comment.includes("Deep nesting"))).toBe(true);
  });

  it("detects magic numbers", () => {
    const findings = analyzer.analyze("math.ts", `const x = 42 + 100;`);
    const magicFindings = findings.filter((f) => f.comment.includes("Magic number"));
    expect(magicFindings.length).toBeGreaterThan(0);
  });

  it("detects bare await without try/catch", () => {
    const code = `async function foo() {
  const data = await fetch("https://api.example.com");
  return data;
}`;
    const findings = analyzer.analyze("async.ts", code);
    expect(findings.some((f) => f.comment.includes("Await call without error handling"))).toBe(true);
  });

  it("does not flag await inside try block", () => {
    const code = `async function foo() {
  try {
    const data = await fetch("https://api.example.com");
    return data;
  } catch (e) {
    return null;
  }
}`;
    const findings = analyzer.analyze("async.ts", code);
    expect(findings.some((f) => f.comment.includes("Await call without error handling"))).toBe(false);
  });

  it("detects long functions", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `  line${i};`).join("\n");
    const code = `function longFunc() {\n${lines}\n}`;
    const findings = analyzer.analyze("long.ts", code);
    expect(findings.some((f) => f.comment.includes("Long function"))).toBe(true);
  });
});
