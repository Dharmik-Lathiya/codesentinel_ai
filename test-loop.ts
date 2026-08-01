export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  const result = x * multiplier;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`result ${result} is not a safe integer`);
  }
  return result;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: number };
    return { value: typeof parsed?.value === "number" ? parsed.value : 0 };
  } catch {
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [100, 100 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
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
