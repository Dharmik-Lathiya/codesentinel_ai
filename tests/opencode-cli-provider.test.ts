import { describe, it, expect, afterEach } from "vitest";
import {
  buildCliArgs,
  buildCIConfig,
  cliTimeoutMs,
  DEFAULT_CLI_TIMEOUT_MINUTES,
  messagesToPrompt,
} from "../src/ai/opencode.js";

describe("messagesToPrompt", () => {
  it("serialises system and user messages into a single prompt", () => {
    const prompt = messagesToPrompt([
      { role: "system", content: "You apply minimal, safe code fixes." },
      { role: "user", content: "Fix bug in src/a.ts" },
    ]);
    expect(prompt).toBe("[system]\nYou apply minimal, safe code fixes.\n\n[user]\nFix bug in src/a.ts");
  });

  it("joins multiple user messages", () => {
    const prompt = messagesToPrompt([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
    ]);
    expect(prompt).toContain("[user]\nfirst");
    expect(prompt).toContain("[user]\nsecond");
  });
});

describe("buildCliArgs", () => {
  it("runs with --auto (permission auto-approve) like the reference runner", () => {
    const args = buildCliArgs("opencode/deepseek-v4-flash-free", "prompt text");
    expect(args).toEqual([
      "run",
      "--auto",
      "--format",
      "json",
      "--model",
      "opencode/deepseek-v4-flash-free",
      "prompt text",
    ]);
  });

  it("passes the prompt as a positional argument, not via stdin JSON", () => {
    const args = buildCliArgs("m", "some prompt");
    expect(args[args.length - 1]).toBe("some prompt");
    expect(args).not.toContain("--pure");
  });
});

describe("cliTimeoutMs", () => {
  afterEach(() => {
    delete process.env.OPENCODE_CLI_TIMEOUT_MINUTES;
  });

  it("defaults to 20 minutes", () => {
    expect(cliTimeoutMs()).toBe(DEFAULT_CLI_TIMEOUT_MINUTES * 60_000);
    expect(DEFAULT_CLI_TIMEOUT_MINUTES).toBe(20);
  });

  it("honours OPENCODE_CLI_TIMEOUT_MINUTES override", () => {
    process.env.OPENCODE_CLI_TIMEOUT_MINUTES = "5";
    expect(cliTimeoutMs()).toBe(5 * 60_000);
  });

  it("falls back to default for invalid values", () => {
    process.env.OPENCODE_CLI_TIMEOUT_MINUTES = "abc";
    expect(cliTimeoutMs()).toBe(DEFAULT_CLI_TIMEOUT_MINUTES * 60_000);
    process.env.OPENCODE_CLI_TIMEOUT_MINUTES = "-3";
    expect(cliTimeoutMs()).toBe(DEFAULT_CLI_TIMEOUT_MINUTES * 60_000);
  });
});

describe("buildCIConfig", () => {
  it("enables all tools and disables autoupdate/share/mcp/plugins for CI", () => {
    const config = JSON.parse(buildCIConfig()) as Record<string, unknown>;
    expect(config.permission).toBe("allow");
    expect(config.autoupdate).toBe(false);
    expect(config.share).toBe("disabled");
    expect(config.mcp).toEqual({});
    expect(config.plugin).toEqual([]);
  });
});
