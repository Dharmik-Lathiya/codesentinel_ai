import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { isWithinRoot, testExists } from "../src/testgen/index.js";
import { parseChecksum } from "../src/opencode/installer.js";
import { GitHubReporter } from "../src/github/reporter.js";
import { AIHub } from "../src/ai/index.js";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "auditfix-i-"));
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

describe("I3: testgen path containment", () => {
  it("accepts paths inside the root", () => {
    expect(isWithinRoot(tmpDir, resolve(tmpDir, "src/app.test.ts"))).toBe(true);
    expect(isWithinRoot(tmpDir, resolve(tmpDir, "a/b.test.ts"))).toBe(true);
  });

  it("rejects traversal outside the root", () => {
    expect(isWithinRoot(tmpDir, resolve(tmpDir, "../evil.test.ts"))).toBe(false);
    expect(isWithinRoot(tmpDir, resolve(tmpDir, "../../etc/passwd"))).toBe(false);
    expect(isWithinRoot(tmpDir, "/etc/passwd")).toBe(false);
  });

  it("rejects absolute paths outside root", () => {
    expect(isWithinRoot(tmpDir, "/tmp/outside.test.ts")).toBe(false);
  });
});

describe("I3: testExists checks the working tree (not bundle-relative)", () => {
  it("finds an existing test file on disk", () => {
    writeFileSync(join(tmpDir, "app.test.ts"), "it('x', () => {})");
    expect(testExists(tmpDir, "app.ts")).toBe(true);
  });

  it("returns false when no test exists", () => {
    expect(testExists(tmpDir, "app.ts")).toBe(false);
  });
});

describe("I4: checksum verification", () => {
  it("parses SHA256SUMS multi-line format", () => {
    const text = [
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  opencode-linux-x86_64",
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff  opencode-linux-arm64",
    ].join("\n");
    expect(parseChecksum(text, "opencode-linux-x86_64")).toBe(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  it("parses single-hash .sha256 format", () => {
    const hash = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    expect(parseChecksum(hash, "opencode-linux-x86_64")).toBe(hash);
  });

  it("returns null when the asset is not listed", () => {
    const text = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  other-asset";
    expect(parseChecksum(text, "opencode-linux-x86_64")).toBeNull();
  });
});

describe("I2: auto-merge uses native auto-merge endpoint", () => {
  it("requests /auto_merge, not /merge", async () => {
    let calledUrl = "";
    const reporter = new GitHubReporter({ token: "t", owner: "o", repo: "r" });
    (reporter as any).request = async (method: string, url: string) => {
      calledUrl = url;
      return { number: 42 };
    };
    await reporter.enableAutoMerge(42, "squash");
    expect(calledUrl).toContain("/pulls/42/auto_merge");
    expect(calledUrl).not.toContain("/pulls/42/merge");
  });
});

describe("I7: opencode-cli provider is registered", () => {
  it("constructs a provider for opencode-cli without throwing", () => {
    const config = {
      ...DEFAULT_CONFIG,
      models: { review: { provider: "opencode-cli", model: "opencode" } },
      default_model: { provider: "opencode-cli", model: "opencode" },
    };
    const hub = new AIHub(config as any, {} as any, tmpDir);
    const provider = (hub as any).factories["opencode-cli"]({}, tmpDir);
    expect(provider).not.toBeNull();
    expect(provider.name).toBe("opencode-cli");
  });
});
