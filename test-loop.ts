export const LARGE_THRESHOLD = 1000;
export const VERY_LARGE_THRESHOLD = 5000;
export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;

export function calculate(x: number): number {
  // EXTREME_THRESHOLD is exclusive: only values strictly greater than it are doubled.
  let multiplier = MULTIPLIER;
  if (x > EXTREME_THRESHOLD) {
    multiplier *= 2;
  }
  const result = x * multiplier;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("calculate() result exceeds Number.MAX_SAFE_INTEGER");
  }
  return result;
}

export function processData(input: string): { value: number } {
  if (!input.trim()) {
    return { value: 0 };
  }
  try {
    const parsed = JSON.parse(input) as { value?: unknown };
    if (typeof parsed?.value === "number") {
      return { value: parsed.value };
    }
  } catch {
    // invalid JSON or non-object input
  }
  return { value: 0 };
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [100, 100 * MULTIPLIER],
    [LARGE_THRESHOLD, LARGE_THRESHOLD * MULTIPLIER],
    [VERY_LARGE_THRESHOLD, VERY_LARGE_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
