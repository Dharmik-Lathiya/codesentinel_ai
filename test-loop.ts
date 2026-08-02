/**
 * Exclusive: x > EXTREME_THRESHOLD switches to EXTREME_MULTIPLIER;
 * exactly EXTREME_THRESHOLD (10000) still uses MULTIPLIER.
 */
export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;
const BOUNDARY_100 = 100;
const BOUNDARY_1000 = 1000;
const BOUNDARY_4999 = 4999;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { value?: unknown }).value === "number"
    ) {
      return { value: (parsed as { value: number }).value };
    }
    return { value: 0 };
  } catch (error) {
    console.warn("processData: failed to parse JSON input", error);
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BOUNDARY_100, BOUNDARY_100 * MULTIPLIER],
    [BOUNDARY_1000, BOUNDARY_1000 * MULTIPLIER],
    [BOUNDARY_4999, BOUNDARY_4999 * MULTIPLIER],
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

  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: 0 });
  });

  test("valid JSON without a value key returns the default result", () => {
    expect(processData('{"foo":1}')).toEqual({ value: 0 });
  });

  test("non-numeric value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
