import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectFiles, readIgnoreFile } from "../src/utils/files.js";
import { mergeConfig, DEFAULT_CONFIG } from "../src/config/defaults.js";

describe("collectFiles with .codesentinelignore", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "codesentinel-ignore-"));
    writeFileSync(join(root, "app.ts"), "export const x = 1;");
    writeFileSync(join(root, "secret.ts"), "export const key = 'abc';");
    writeFileSync(join(root, "debug.ts"), "console.log('debug');");
    writeFileSync(join(root, "helper.ts"), "export const y = 2;");
    writeFileSync(
      join(root, ".codesentinelignore"),
      "secret.ts\ndebug.ts\n",
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads ignore patterns from .codesentinelignore", () => {
    const patterns = readIgnoreFile(root);
    expect(patterns).toEqual(["secret.ts", "debug.ts"]);
  });

  it("excludes files listed in .codesentinelignore", () => {
    const files = collectFiles(
      root,
      ["**/*.ts"],
      ["node_modules/**", ".codesentinel*"],
    );
    expect(files).toContain("app.ts");
    expect(files).toContain("helper.ts");
    expect(files).not.toContain("secret.ts");
    expect(files).not.toContain("debug.ts");
  });

  it("returns empty array when no ignore file exists", () => {
    const patterns = readIgnoreFile("/tmp/nonexistent-path-12345");
    expect(patterns).toEqual([]);
  });
});

describe("mergeConfig array merging", () => {
  it("merges include arrays instead of overwriting", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      include: ["**/*.py"],
    });
    expect(merged.include).toContain("**/*.{ts,tsx,js,jsx,py,go,java,rb}");
    expect(merged.include).toContain("**/*.py");
  });

  it("merges exclude arrays instead of overwriting", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      exclude: ["**/*.d.ts"],
    });
    expect(merged.exclude).toContain("node_modules/**");
    expect(merged.exclude).toContain("**/*.d.ts");
  });

  it("merges plugins arrays instead of overwriting", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      plugins: ["my-plugin"],
    });
    expect(merged.plugins).toContain("my-plugin");
  });
});
