export const EXTREME_CUTOFF = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;
const SMALL_BOUNDARY = 100;
const MEDIUM_BOUNDARY = 1000;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_CUTOFF ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "value" in parsed &&
      typeof (parsed as { value?: unknown }).value === "number" &&
      Number.isFinite((parsed as { value: number }).value)
    ) {
      return { value: (parsed as { value: number }).value };
    }
    return { value: 0 };
  } catch (error) {
    console.warn("processData: failed to parse input", error);
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [SMALL_BOUNDARY, SMALL_BOUNDARY * MULTIPLIER],
    [MEDIUM_BOUNDARY, MEDIUM_BOUNDARY * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_CUTOFF, EXTREME_CUTOFF * MULTIPLIER],
    [EXTREME_CUTOFF + 1, (EXTREME_CUTOFF + 1) * MULTIPLIER * 2],
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
