import { describe, it, expect } from "vitest";
import { retry } from "../src/utils/retry.js";

describe("retry", () => {
  it("returns result on first success", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        return "ok";
      },
      { maxAttempts: 3 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on transient errors", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("rate limit exceeded");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 10 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after exhausting attempts", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("rate limit exceeded");
        },
        { maxAttempts: 2, baseDelayMs: 10 },
      ),
    ).rejects.toThrow("rate limit exceeded");
    expect(attempts).toBe(2);
  });

  it("does not retry on non-retryable errors", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("invalid API key");
        },
        { maxAttempts: 3, baseDelayMs: 10 },
      ),
    ).rejects.toThrow("invalid API key");
    expect(attempts).toBe(1);
  });

  it("respects custom shouldRetry predicate", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error("custom error");
        return "ok";
      },
      {
        maxAttempts: 3,
        baseDelayMs: 10,
        shouldRetry: (err) => err instanceof Error && err.message.includes("custom"),
      },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });
});
