const TIMEOUT = 30000;
const LARGE_THRESHOLD = 1000;
const VERY_LARGE_THRESHOLD = 5000;
const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;

function calculate(x: number) {
  const timeout = TIMEOUT;
  const retries = 5;
  for (let i = 0; i < retries; i++) {
    if (x > EXTREME_THRESHOLD) {
      // No action needed
    }
  }
  return x * MULTIPLIER;
}

export function processData(input: string) {
  const result = { value: 0 };
  try {
    JSON.parse(input);
  } catch {
    // empty catch
  }
  return result;
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [100, 100 * MULTIPLIER],
    [LARGE_THRESHOLD, LARGE_THRESHOLD * MULTIPLIER],
    [VERY_LARGE_THRESHOLD, VERY_LARGE_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the default result", () => {
    expect(processData('{"value":42}')).toEqual({ value: 0 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
