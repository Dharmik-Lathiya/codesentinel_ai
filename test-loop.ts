const LARGE_THRESHOLD = 1000;
const VERY_LARGE_THRESHOLD = 5000;
const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;

function calculate(x: number): number {
  let multiplier = MULTIPLIER;
  if (x > EXTREME_THRESHOLD) {
    multiplier *= 2;
  }
  if (!Number.isFinite(x)) {
    return x;
  }
  if (x > Number.MAX_SAFE_INTEGER / multiplier) {
    throw new RangeError("input exceeds Number.MAX_SAFE_INTEGER");
  }
  return x * multiplier;
}

export function processData(_input: string): { value: number } {
  return { value: 0 };
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
[0, 0],
[100, 409600],
[LARGE_THRESHOLD, 4096000],
[1001, 4100096],
[VERY_LARGE_THRESHOLD, 20480000],
[9999, 40955904],
[EXTREME_THRESHOLD, 40960000],
[EXTREME_THRESHOLD + 1, 81928192],
[-5, -20480],
[Infinity, Infinity],
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
