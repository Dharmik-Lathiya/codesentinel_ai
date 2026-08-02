export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;

export function calculate(x: number): number {
  const multiplier = Math.abs(x) > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch (err) {
    console.error("processData: JSON parse failed", err);
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  const SMALL_INPUT = 100;
  const MEDIUM_INPUT = 1000;
  const LARGE_INPUT = 4999;
  test.each([
    [0, 0],
    [-5, -20480],
    [SMALL_INPUT, 409600],
    [MEDIUM_INPUT, 4096000],
    [LARGE_INPUT, 20475904],
    [5000, 20480000],
    [6000, 24576000],
    [9999, 40955904],
    [EXTREME_THRESHOLD, 40960000],
    [EXTREME_THRESHOLD + 1, 81928192],
    [-10001, -81928192],
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
