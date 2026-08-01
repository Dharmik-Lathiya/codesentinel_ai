const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;

const SMALL_INPUT = 100;
const MEDIUM_INPUT = 1000;

function calculate(x: number): number {
  const multiplier = x >= EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    return JSON.parse(input) as { value: number };
  } catch {
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [1000, 1000 * MULTIPLIER],
    [4999, 4999 * MULTIPLIER],
    [SMALL_INPUT, SMALL_INPUT * MULTIPLIER],
    [MEDIUM_INPUT, MEDIUM_INPUT * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * EXTREME_MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    [-10001, -10001 * MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed result", () => {
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
