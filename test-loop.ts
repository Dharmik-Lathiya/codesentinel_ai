import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;

export function calculate(x: number): number {
  const multiplier = x >= EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: unknown };
    if (typeof parsed?.value === "number") return { value: parsed.value };
  } catch {}
  return { value: 0 };
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -20480],
    [100, 409600],
    [1000, 4096000],
    [4999, 20475904],
    [5000, 20480000],
    [6000, 24576000],
    [9999, 40955904],
    [EXTREME_THRESHOLD, 81920000],
    [EXTREME_THRESHOLD + 1, 81928192],
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

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
