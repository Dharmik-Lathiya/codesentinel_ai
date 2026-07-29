import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, rmdirSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseOpencodeOutput,
  parseOpencodeFile,
  emptyOpencodeResult,
  type Issue,
  type Strength,
  type Suggestion,
} from "../src/opencode/jsonl-parser.js";

describe("parseOpencodeOutput", () => {
  it("parses a complete valid JSONL input with all line types", () => {
    const lines = [
      '{"type":"summary","data":{"text":"Great PR overall"}}',
      '{"type":"verdict","data":{"ready":false,"reasoning":"Has critical issues","autoFixable":true,"confidence":"medium"}}',
      '{"type":"strength","data":{"message":"Clean architecture"}}',
      '{"type":"strength","data":{"file":"src/index.ts","line":10,"message":"Well documented"}}',
      '{"type":"issue","data":{"severity":"critical","file":"src/auth.ts","line":42,"message":"SQL injection risk","suggestion":"Use parameterized queries","suggestionCode":"db.query($1, [val])"}}',
      '{"type":"issue","data":{"severity":"minor","file":"src/utils.ts","line":5,"message":"Unused variable"}}',
      '{"type":"suggestion","data":{"file":"src/app.ts","line":99,"suggestion":"Consider extracting this into a helper"}}',
    ];

    const result = parseOpencodeOutput(lines);

    expect(result.summary).toBe("Great PR overall");
    expect(result.verdict).toEqual({ ready: false, reasoning: "Has critical issues" });
    expect(result.strengths).toHaveLength(2);
    expect(result.strengths[0]).toEqual<Strength>({ message: "Clean architecture", file: undefined, line: undefined });
    expect(result.strengths[1]).toEqual<Strength>({ message: "Well documented", file: "src/index.ts", line: 10 });
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toEqual<Issue>({
      severity: "critical",
      file: "src/auth.ts",
      line: 42,
      message: "SQL injection risk",
      suggestion: "Use parameterized queries",
      suggestionCode: "db.query($1, [val])",
    });
    expect(result.issues[1]).toEqual<Issue>({
      severity: "minor",
      file: "src/utils.ts",
      line: 5,
      message: "Unused variable",
    });
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toEqual<Suggestion>({ file: "src/app.ts", line: 99, suggestion: "Consider extracting this into a helper" });
  });

  it("returns empty result for empty input", () => {
    const result = parseOpencodeOutput([]);
    expect(result).toEqual(emptyOpencodeResult());
  });

  it("skips empty and whitespace-only lines", () => {
    const lines = ["", "  ", "\t", '{"type":"summary","data":{"text":"hello"}}', " "];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("hello");
  });

  it("silently skips invalid JSON lines", () => {
    const lines = [
      "not json",
      "{invalid}",
      "",
      '{"type":"summary","data":{"text":"works"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("works");
  });

  it("silently skips lines with wrong structure (missing type or data)", () => {
    const lines = [
      '{"type":"unknown","data":{}}',
      '{"data":{"text":"no type"}}',
      '{"type":"summary","noData":true}',
      '{"type":"issue","data":{}}',
      '{"type":"summary","data":{"text":"valid"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("valid");
    expect(result.issues).toHaveLength(0);
  });

  it("handles partial input with no summary", () => {
    const lines = [
      '{"type":"issue","data":{"severity":"minor","file":"x.ts","line":1,"message":"Nit"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("");
    expect(result.issues).toHaveLength(1);
  });

  it("handles input with no issues or strengths", () => {
    const lines = [
      '{"type":"summary","data":{"text":"All good"}}',
      '{"type":"verdict","data":{"ready":true,"reasoning":"LGTM"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("All good");
    expect(result.verdict).toEqual({ ready: true, reasoning: "LGTM" });
    expect(result.strengths).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it("ignores issue lines with invalid severity", () => {
    const lines = [
      '{"type":"issue","data":{"severity":"invalid","file":"x.ts","line":1,"message":"test"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.issues).toHaveLength(0);
  });

  it("ignores strength lines without a message string", () => {
    const lines = [
      '{"type":"strength","data":{"message":123}}',
      '{"type":"strength","data":{}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.strengths).toHaveLength(0);
  });

  it("ignores suggestion lines with missing fields", () => {
    const lines = [
      '{"type":"suggestion","data":{"file":"x.ts","line":"notanumber","suggestion":"fix"}}',
      '{"type":"suggestion","data":{"file":"x.ts","line":1}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.suggestions).toHaveLength(0);
  });

  it("uses last summary and verdict when multiple are present", () => {
    const lines = [
      '{"type":"summary","data":{"text":"first"}}',
      '{"type":"verdict","data":{"ready":false,"reasoning":"first verdict"}}',
      '{"type":"summary","data":{"text":"second"}}',
      '{"type":"verdict","data":{"ready":true,"reasoning":"second verdict"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.summary).toBe("second");
    expect(result.verdict).toEqual({ ready: true, reasoning: "second verdict" });
  });

  it("aggregates multiple issues, strengths, and suggestions", () => {
    const lines = [
      '{"type":"issue","data":{"severity":"critical","file":"a.ts","line":1,"message":"one"}}',
      '{"type":"issue","data":{"severity":"important","file":"b.ts","line":2,"message":"two"}}',
      '{"type":"issue","data":{"severity":"minor","file":"c.ts","line":3,"message":"three"}}',
      '{"type":"strength","data":{"message":"s1"}}',
      '{"type":"strength","data":{"message":"s2"}}',
      '{"type":"strength","data":{"message":"s3"}}',
      '{"type":"suggestion","data":{"file":"d.ts","line":4,"suggestion":"do x"}}',
      '{"type":"suggestion","data":{"file":"e.ts","line":5,"suggestion":"do y"}}',
    ];
    const result = parseOpencodeOutput(lines);
    expect(result.issues).toHaveLength(3);
    expect(result.strengths).toHaveLength(3);
    expect(result.suggestions).toHaveLength(2);
  });
});

describe("parseOpencodeFile", () => {
  let tmpDir: string;
  let fixturePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "opencode-test-"));
    fixturePath = join(tmpDir, "output.jsonl");
  });

  afterEach(() => {
    if (existsSync(fixturePath)) unlinkSync(fixturePath);
    if (existsSync(tmpDir)) rmdirSync(tmpDir);
  });

  it("parses valid JSONL file", async () => {
    writeFileSync(fixturePath, [
      '{"type":"summary","data":{"text":"File review"}}',
      '{"type":"verdict","data":{"ready":true,"reasoning":"Looks good"}}',
    ].join("\n"), "utf8");

    const result = await parseOpencodeFile(fixturePath);
    expect(result.summary).toBe("File review");
    expect(result.verdict).toEqual({ ready: true, reasoning: "Looks good" });
  });

  it("returns empty result for non-existent file", async () => {
    const result = await parseOpencodeFile("/nonexistent/path.jsonl");
    expect(result).toEqual(emptyOpencodeResult());
  });

  it("parses file with trailing newline", async () => {
    writeFileSync(fixturePath, '{"type":"summary","data":{"text":"trailer"}}\n', "utf8");

    const result = await parseOpencodeFile(fixturePath);
    expect(result.summary).toBe("trailer");
  });
});
