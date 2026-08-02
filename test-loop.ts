export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;
const SMALL_INPUT = 100;
const MEDIUM_INPUT = 1000;
const LARGE_INPUT = 4999;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } | null {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return null;
  } catch (err) {
    console.debug("processData: invalid JSON", err);
    return null;
  }
}
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [SMALL_INPUT, SMALL_INPUT * MULTIPLIER],
    [MEDIUM_INPUT, MEDIUM_INPUT * MULTIPLIER],
    [LARGE_INPUT, LARGE_INPUT * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    [1_000_000, 1_000_000 * EXTREME_MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("float value returns the parsed value", () => {
    expect(processData('{"value":3.14}')).toEqual({ value: 3.14 });
  });

  test("non-numeric value returns null", () => {
    expect(processData('{"value":"42"}')).toEqual(null);
  });

  test("array input has no value and returns null", () => {
    expect(processData('[1,2]')).toEqual(null);
  });

  test("invalid JSON does not throw and returns null", () => {
    expect(processData("not-json")).toEqual(null);
  });

  test("null value returns null", () => {
    expect(processData('{"value":null}')).toEqual(null);
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual(null);
  });
});
