export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = 8192; // 2x MULTIPLIER
const SMALL_INPUT = 100;
const MEDIUM_INPUT = 1000;
const BELOW_THRESHOLD_INPUT = 4999;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

    if (parsed && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch {
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
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
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("non-numeric value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("array input returns the default result", () => {
    expect(processData("[1,2,3]")).toEqual({ value: 0 });
  });

  test("Infinity value returns the default result", () => {
    expect(processData('{"value":1e999}')).toEqual({ value: 0 });
  });
  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
