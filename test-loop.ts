const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;
const LARGE_INPUT = 1000;
const NEAR_HALF_THRESHOLD = 4999;
const HALF_THRESHOLD = 5000;

function calculate(x: number): number {
  if (!Number.isFinite(x)) {
    return 0;
  }
  const multiplier = x > EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
  const result = x * multiplier;
  return Number.isFinite(result) ? result : 0;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: number };
    if (parsed && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
  } catch {}
  return { value: 0 };
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [LARGE_INPUT, LARGE_INPUT * MULTIPLIER],
    [NEAR_HALF_THRESHOLD, NEAR_HALF_THRESHOLD * MULTIPLIER],
    [HALF_THRESHOLD, HALF_THRESHOLD * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });

  test("non-finite inputs are handled explicitly", () => {
    expect(calculate(NaN)).toBe(0);
    expect(calculate(Infinity)).toBe(0);
    expect(calculate(-Infinity)).toBe(0);
  });
});

describe("processData", () => {
  test("valid JSON returns its parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
