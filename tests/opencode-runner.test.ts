import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSetupOpenCode, mockRunOpenCode } = vi.hoisted(() => ({
  mockSetupOpenCode: vi.fn(),
  mockRunOpenCode: vi.fn(),
}));

vi.mock("../src/opencode/installer.js", () => ({
  setupOpenCode: mockSetupOpenCode,
  runOpenCode: mockRunOpenCode,
}));

const { runReview } = await import("../src/opencode/runner.js");

describe("runReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetupOpenCode.mockResolvedValue({
      binaryPath: "/mock/opencode",
      version: "0.1.0",
      cached: false,
    });
    mockRunOpenCode.mockReturnValue('{"type":"result","data":{}}');
  });

  it("calls setupOpenCode and runOpenCode with correct args", async () => {
    const result = await runReview(["src/file1.ts", "src/file2.ts"]);

    expect(mockSetupOpenCode).toHaveBeenCalledWith(undefined);
    expect(mockRunOpenCode).toHaveBeenCalledWith(
      "/mock/opencode",
      ["run", "--auto", "--format", "jsonl", "src/file1.ts", "src/file2.ts"],
      { cwd: undefined },
    );
    expect(result.rawOutput).toBe('{"type":"result","data":{}}');
    expect(result.exitCode).toBe(0);
    expect(result.binaryPath).toBe("/mock/opencode");
  });

  it("passes version to setupOpenCode when provided in options", async () => {
    await runReview(["file.ts"], { version: "1.0.0" });

    expect(mockSetupOpenCode).toHaveBeenCalledWith("1.0.0");
  });

  it("builds correct argument list for multiple files", async () => {
    await runReview(["a.ts", "b.ts", "c.ts"]);

    expect(mockRunOpenCode).toHaveBeenCalledWith(
      "/mock/opencode",
      ["run", "--auto", "--format", "jsonl", "a.ts", "b.ts", "c.ts"],
      { cwd: undefined },
    );
  });

  it("handles runOpenCode throwing an error and returns exit code 1", async () => {
    const execError = new Error("Command failed: exit code 1") as Error & {
      status?: number;
      stderr?: string;
    };
    execError.status = 1;
    execError.stderr = '{"type":"error","data":{"message":"fail"}}';
    mockRunOpenCode.mockImplementation(() => {
      throw execError;
    });

    const result = await runReview(["file.ts"]);

    expect(result.exitCode).toBe(1);
    expect(result.rawOutput).toBe('{"type":"error","data":{"message":"fail"}}');
    expect(result.binaryPath).toBe("/mock/opencode");
  });

  it("throws a clear error when setupOpenCode fails", async () => {
    mockSetupOpenCode.mockRejectedValue(new Error("not found"));

    await expect(runReview(["file.ts"])).rejects.toThrow(
      "OpenCode binary is not available: not found",
    );
  });

  it("handles non-Error rejection from setupOpenCode", async () => {
    mockSetupOpenCode.mockRejectedValue("string error");

    await expect(runReview(["file.ts"])).rejects.toThrow(
      "OpenCode binary is not available: string error",
    );
  });

  it("returns exit code from exec error when status is undefined", async () => {
    const execError = new Error("unknown error") as Error & {
      status?: number;
      stderr?: string;
    };
    mockRunOpenCode.mockImplementation(() => {
      throw execError;
    });

    const result = await runReview(["file.ts"]);

    expect(result.exitCode).toBe(1);
  });
});
