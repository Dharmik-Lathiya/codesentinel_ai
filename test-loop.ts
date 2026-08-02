export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;
const SMALL_INPUT = 100;
const MEDIUM_INPUT = 1000;
const LARGE_INPUT = 4999;

export function calculate(x: number): number {
  const multiplier = x >= EXTREME_THRESHOLD + 1 ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (isRecord(parsed) && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch (err) {
    if (err instanceof SyntaxError) return { value: 0 };
    throw err;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [SMALL_INPUT, SMALL_INPUT * MULTIPLIER],
    [MEDIUM_INPUT, MEDIUM_INPUT * MULTIPLIER],
    [LARGE_INPUT, LARGE_INPUT * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
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
  test("non-number value types return the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("arrays are not treated as records", () => {
    expect(processData("[1,2,3]")).toEqual({ value: 0 });
  });

  test("large numbers beyond Number.MAX_SAFE_INTEGER silently lose precision", () => {
    expect(processData('{"value":9007199254740993}')).toEqual({ value: 9007199254740992 });
  });
});
