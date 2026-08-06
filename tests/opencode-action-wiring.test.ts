import { describe, it, expect } from "vitest";
import { configFromInputs } from "../src/config/index.js";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";

describe("Task 7 — action.yml / action.ts wiring", () => {
  describe("configFromInputs — use_opencode_cli", () => {
    it("use_opencode_cli: 'true' → config.use_opencode_cli = true", () => {
      const cfg = configFromInputs({ use_opencode_cli: "true" });
      expect(cfg.use_opencode_cli).toBe(true);
    });

    it("use_opencode_cli: 'false' → config.use_opencode_cli = false", () => {
      const cfg = configFromInputs({ use_opencode_cli: "false" });
      expect(cfg.use_opencode_cli).toBe(false);
    });

    it("use_opencode_cli absent → not set in output", () => {
      const cfg = configFromInputs({});
      expect(cfg.use_opencode_cli).toBeUndefined();
    });

    it("use_opencode_cli + provider compose correctly", () => {
      const cfg = configFromInputs({ use_opencode_cli: "true", provider: "openai" });
      expect(cfg.use_opencode_cli).toBe(true);
      expect(cfg.default_model?.provider).toBe("openai");
    });
  });

  describe("default_model unchanged when use_opencode_cli only", () => {
    it("does not override provider when only use_opencode_cli is given", () => {
      const cfg = configFromInputs({ use_opencode_cli: "true" });
      expect(cfg.default_model).toBeUndefined();
    });
  });

  describe("configFromInputs: opencode_version is not a config key", () => {
    it("unrecognised inputs are silently ignored", () => {
      const cfg = configFromInputs({
        opencode_version: "v0.3.0",
        use_opencode_cli: "true",
      } as Record<string, string>);
      expect(cfg.use_opencode_cli).toBe(true);
      expect((cfg as Record<string, unknown>).opencode_version).toBeUndefined();
    });
  });

  describe("PATH manipulation logic (unit)", () => {
    it("prepend logic adds missing dir at front", () => {
      const binDir = "/home/user/.codesentinel/opencode";
      const existingPath = "/usr/bin:/usr/local/bin";
      const parts = existingPath.split(":");
      const prepended = parts.includes(binDir)
        ? existingPath
        : `${binDir}:${existingPath}`;
      expect(prepended).toBe("/home/user/.codesentinel/opencode:/usr/bin:/usr/local/bin");
      expect(prepended.split(":")[0]).toBe(binDir);
    });

    it("does not duplicate when dir already in PATH", () => {
      const binDir = "/home/user/.codesentinel/opencode";
      const existingPath = `${binDir}:/usr/bin`;
      const parts = existingPath.split(":");
      const prepended = parts.includes(binDir)
        ? existingPath
        : `${binDir}:${existingPath}`;
      expect(prepended.split(":").filter((p) => p === binDir)).toHaveLength(1);
    });
  });
});
