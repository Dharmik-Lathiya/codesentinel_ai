export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;

/**
 * Multiplies the input by the configured multiplier.
 * Constraint: for exact results, |x| must stay below
 * Number.MAX_SAFE_INTEGER / MULTIPLIER (~2.2e12).
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { value: 0 };
    }
    throw error;
  }
}
import { describe, expect, test } from "vitest";

const SMALL_INPUT = 100;
const MEDIUM_INPUT = 1000;
const HIGH_INPUT = 4999;

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [SMALL_INPUT, SMALL_INPUT * MULTIPLIER],
    [MEDIUM_INPUT, MEDIUM_INPUT * MULTIPLIER],
    [HIGH_INPUT, HIGH_INPUT * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
  ])("value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("calculate boundary", () => {
  test.each([
    [EXTREME_THRESHOLD - 1, (EXTREME_THRESHOLD - 1) * MULTIPLIER],
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

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
