const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;
const INPUT_1000 = 1000;
const INPUT_4999 = 4999;
const INPUT_5000 = 5000;

function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
  return x * multiplier;
}

const DEFAULT_RESULT = { value: 0 };

export function processData(_input: string): { value: number } {
  // TODO: implement real parsing; returning the default value for now.
  return DEFAULT_RESULT;
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [INPUT_1000, INPUT_1000 * MULTIPLIER],
    [INPUT_4999, INPUT_4999 * MULTIPLIER],
    [INPUT_5000, INPUT_5000 * MULTIPLIER],
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
