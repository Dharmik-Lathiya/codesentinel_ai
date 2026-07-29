import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import type { CodeSentinelConfig, RuntimeSecrets } from "../src/config/types.js";
import { AIHub, type TaskName } from "../src/ai/index.js";

const mockRunReview = vi.hoisted(() => vi.fn());

vi.mock("../src/opencode/runner.js", () => ({
  runReview: mockRunReview,
}));

const { Engine } = await import("../src/engine/index.js");

function makeConfig(overrides: Partial<CodeSentinelConfig> = {}): CodeSentinelConfig {
  return { ...DEFAULT_CONFIG, ...overrides } as CodeSentinelConfig;
}

function makeSecrets(): RuntimeSecrets {
  return {};
}

describe("opencode CLI wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunReview.mockResolvedValue({
      rawOutput: '{"type":"summary","data":{"text":"review done"}}',
      exitCode: 0,
      binaryPath: "/mock/opencode",
    });
  });

  it("uses AIHub by default (use_opencode_cli: false)", () => {
    const config = makeConfig({ use_opencode_cli: false });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    expect(engine["ai"]).toBeInstanceOf(AIHub);
  });

  it("uses OpencodeCliAdapter when use_opencode_cli: true", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const ai = engine["ai"] as any;
    expect(typeof ai.complete).toBe("function");
    expect(typeof ai.modelForTask).toBe("function");
    expect(ai.modelForTask("review").provider).toBe("opencode-cli");
  });

  it("OpencodeCliAdapter.complete delegates to runReview", async () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const ai = engine["ai"] as any;

    const result = await ai.complete("review", [
      { role: "user", content: "review this" },
    ]);

    expect(mockRunReview).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe("opencode-cli");
    expect(result.content).toContain("review done");
  });

  it("OpencodeCliAdapter has modelForTask returning opencode-cli provider", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const ai = engine["ai"] as any;

    const reviewModel = ai.modelForTask("review" as TaskName);
    expect(reviewModel).toEqual({ provider: "opencode-cli", model: "cli" });
  });

  it("checkAIProvider skips when use_opencode_cli is set", async () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const aiAvailableBefore = engine["aiAvailable"];
    await engine["checkAIProvider"]();
    const aiAvailableAfter = engine["aiAvailable"];
    expect(aiAvailableAfter).toBe(true);
    expect(aiAvailableBefore).toBe(true);
  });

  it("aiAvailable is true when use_opencode_cli is enabled", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    expect(engine["aiAvailable"]).toBe(true);
  });

  it("gracefully throws ProviderUnavailableError when runReview fails", async () => {
    mockRunReview.mockRejectedValue(new Error("binary not found"));

    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const ai = engine["ai"] as any;

    await expect(
      ai.complete("review", [{ role: "user", content: "test" }]),
    ).rejects.toThrow(/unavailable/i);
  });

  it("use_opencode_cli: false still works with aiOverride", () => {
    const fake = {
      modelForTask: () => ({ provider: "opencode", model: "x" }),
      complete: async () => ({ content: "ok", model: "x", provider: "opencode" }),
    };
    const config = makeConfig({ use_opencode_cli: false });
    const engine = new Engine(config, makeSecrets(), "/tmp", fake as any);
    expect(engine["aiAvailable"]).toBe(true);
  });
});
