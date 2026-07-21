import { writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { languageOf, ensureDir } from "../utils/files.js";
import type { CodeSentinelConfig } from "../config/types.js";
import type { AIHub } from "../ai/index.js";
import { PromptRegistry } from "../prompts/index.js";
import { extractJson } from "../ai/provider.js";

/** A function detected in source that may need tests. */
export interface DetectedFunction {
  name: string;
  line: number;
  file: string;
  /** Whether a corresponding test file already exists for the source file. */
  hasTest: boolean;
}

/**
 * detectFunctions performs lightweight, language-agnostic detection of
 * top-level/explicitly-declared functions so we can find untested code. This is
 * heuristic (regex based) and intentionally fast/cheap.
 */
export function detectFunctions(
  root: string,
  files: { path: string; content: string }[],
): DetectedFunction[] {
  const testSet = new Set(
    files.map((f) => f.path).filter((p) => /\.(test|spec)\./.test(p)),
  );

  const out: DetectedFunction[] = [];
  const fnRe =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;

  for (const { path, content } of files) {
    if (/\.(test|spec)\./.test(path)) continue;
    const base = path.replace(/\.[^.]+$/, "");
    const hasTest = [...testSet].some((t) => t.startsWith(base));
    let m: RegExpExecArray | null;
    fnRe.lastIndex = 0;
    while ((m = fnRe.exec(content)) !== null) {
      out.push({
        name: m[1],
        line: content.slice(0, m.index).split("\n").length,
        file: path,
        hasTest,
      });
    }
  }
  return out;
}

export interface GeneratedTest {
  file: string;
  testFilePath: string;
  content: string;
}

/**
 * TestGenerator uses the AI model to produce unit tests for source files that
 * lack coverage. It writes generated tests into a sibling `__tests__` folder
 * (or co-located, depending on runner conventions).
 */
export class TestGenerator {
  constructor(
    private config: CodeSentinelConfig,
    private ai: AIHub,
    private prompts: PromptRegistry,
  ) {}

  /**
   * Generate and save tests for the given source files. Returns the list of
   * written tests. Skips files that already appear to have tests unless
   * `force` is set.
   */
  async generate(
    root: string,
    files: { path: string; content: string }[],
    opts: { force?: boolean } = {},
  ): Promise<GeneratedTest[]> {
    const detected = detectFunctions(root, files);
    const targets = detected.filter((d) => opts.force || !d.hasTest);
    const uniqueFiles = [...new Set(targets.map((d) => d.file))];

    const results: GeneratedTest[] = [];
    for (const rel of uniqueFiles) {
      const file = files.find((f) => f.path === rel);
      if (!file) continue;
      const gen = await this.generateForFile(root, file);
      if (gen) results.push(gen);
    }
    return results;
  }

  private async generateForFile(
    root: string,
    file: { path: string; content: string },
  ): Promise<GeneratedTest | null> {
    const framework =
      this.config.test_runner === "jest"
        ? "Jest with describe/it/expect"
        : "Vitest with describe/it/expect";
    const targetPath = this.testPathFor(root, file.path);

    const prompt = this.prompts.render("testgen", {
      test_runner: this.config.test_runner,
      test_framework: framework,
      file: file.path,
      language: languageOf(file.path),
      code: file.content,
      project_context: this.config.project_context || "(none)",
    });

    const res = await this.ai.complete("testgen", [
      { role: "system", content: "You generate precise unit tests." },
      { role: "user", content: prompt },
    ]);

    const parsed = extractJson<{ test_file_path?: string; content: string }>(
      res.content,
    );
    if (!parsed?.content) return null;

    const outPath = parsed.test_file_path
      ? resolve(root, parsed.test_file_path)
      : targetPath;
    ensureDir(dirname(outPath));
    writeFileSync(outPath, parsed.content, "utf8");
    return { file: file.path, testFilePath: relative(root, outPath), content: parsed.content };
  }

  /** Determine the conventional test file path for a source file. */
  private testPathFor(root: string, srcPath: string): string {
    const abs = resolve(root, srcPath);
    const dir = dirname(abs);
    const ext = srcPath.match(/\.([^.]+)$/)?.[1] ?? "ts";
    const base = srcPath.replace(/\.[^.]+$/, "");
    if (this.config.test_runner === "jest") {
      return join(dir, "__tests__", (base.split("/").pop() ?? "index") + `.test.${ext}`);
    }
    return join(root, base + `.test.${ext}`);
  }
}

/** Determine if a path's test already exists on disk. */
export function testExists(root: string, srcPath: string): boolean {
  const base = srcPath.replace(/\.[^.]+$/, "");
  return existsSync(resolve(root, base + ".test.ts"));
}
