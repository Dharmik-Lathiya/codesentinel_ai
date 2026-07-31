const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;

function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
  return x * multiplier;
}

export function processData(_input: string): { value: number } {
  return { value: 0 };
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [1000, 1000 * MULTIPLIER],
    [4999, 4999 * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
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
