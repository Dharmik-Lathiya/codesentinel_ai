import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import type { CodeSentinelConfig, RuntimeSecrets } from "../src/config/types.js";
import { AIHub, type TaskName } from "../src/ai/index.js";

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
  });

  it("uses AIHub by default (use_opencode_cli: false)", () => {
    const config = makeConfig({ use_opencode_cli: false });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    expect(engine["ai"]).toBeInstanceOf(AIHub);
  });

  it("uses AIHub even when use_opencode_cli: true", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    expect(engine["ai"]).toBeInstanceOf(AIHub);
  });

  it("passes use_opencode_cli to secrets for OpenCodeProvider", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const hub = engine["ai"] as AIHub;
    expect(hub).toBeInstanceOf(AIHub);
    expect(engine["config"].use_opencode_cli).toBe(true);
  });

  it("modelForTask respects config models", () => {
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp");
    const ai = engine["ai"] as AIHub;

    const reviewModel = ai.modelForTask("review" as TaskName);
    expect(reviewModel.provider).toBe("opencode");
    expect(reviewModel.model).toBe(DEFAULT_CONFIG.models.review?.model ?? DEFAULT_CONFIG.default_model.model);
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

  it("use_opencode_cli: false still works with aiOverride", () => {
    const fake = {
      modelForTask: () => ({ provider: "opencode", model: "x" }),
      complete: async () => ({ content: "ok", model: "x", provider: "opencode" }),
    };
    const config = makeConfig({ use_opencode_cli: false });
    const engine = new Engine(config, makeSecrets(), "/tmp", fake as any);
    expect(engine["aiAvailable"]).toBe(true);
  });

  it("aiOverride takes precedence over use_opencode_cli", () => {
    const fake = {
      modelForTask: () => ({ provider: "opencode", model: "x" }),
      complete: async () => ({ content: "ok", model: "x", provider: "opencode" }),
    };
    const config = makeConfig({ use_opencode_cli: true });
    const engine = new Engine(config, makeSecrets(), "/tmp", fake as any);
    expect(engine["ai"]).toBe(fake);
    expect(engine["aiAvailable"]).toBe(true);
  });
});
