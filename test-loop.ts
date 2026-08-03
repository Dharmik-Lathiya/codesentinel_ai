import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;

/**
 * Multiplies x by a step multiplier.
 * Accepts finite numbers; NaN/Infinity inputs pass through unchanged.
 * Results above Number.MAX_SAFE_INTEGER lose integer precision.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number | null } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (isFiniteValueObject(parsed)) {
      return { value: parsed.value };
    }
    return { value: null };
  } catch {
    return { value: null };
  }
}

function isFiniteValueObject(parsed: unknown): parsed is { value: number } {
  if (typeof parsed !== "object" || parsed === null) return false;
  if (!("value" in parsed)) return false;
  const value = (parsed as { value: unknown }).value;
  return typeof value === "number" && Number.isFinite(value);
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    [MODERATE_INPUT, MODERATE_INPUT * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
  test.each([
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])("passes through %s unchanged", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });

  test("documents precision loss above Number.MAX_SAFE_INTEGER", () => {
    const input = Number.MAX_SAFE_INTEGER;
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: null });
  });

  test("non-numeric value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: null });
  });

  test("array input returns the default result", () => {
    expect(processData("[1,2,3]")).toEqual({ value: null });
  });

  test("Infinity value returns the default result", () => {
    expect(processData('{"value":1e999}')).toEqual({ value: null });
  });
  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: null });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: null });
  });
});
