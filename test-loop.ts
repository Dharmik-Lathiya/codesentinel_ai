import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;
const EXTENDED_INPUT = 6000;

const SAMPLE_VALUE = 42;

/**
 * Accepts finite numbers; NaN/Infinity inputs pass through unchanged.
 * Results are clamped to the safe integer range [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER].
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  const result = x * multiplier;
  return Number.isFinite(result)
    ? Math.max(-Number.MAX_SAFE_INTEGER, Math.min(result, Number.MAX_SAFE_INTEGER))
    : result;
}

    if (parsed && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
  try {
function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch {
    return { value: 0 };
  }
}
describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [-EXTREME_THRESHOLD - 1, (-EXTREME_THRESHOLD - 1) * MULTIPLIER],
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    [MODERATE_INPUT, MODERATE_INPUT * MULTIPLIER],
    [EXTENDED_INPUT, EXTENDED_INPUT * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("valid JSON SAMPLE_VALUE returns the parsed value", () => {
    expect(processData('{"value":' + SAMPLE_VALUE + '}')).toEqual({ value: SAMPLE_VALUE });
  });
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("non-numeric value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("non-numeric SAMPLE_VALUE returns the default result", () => {
    expect(processData('{"value":"' + SAMPLE_VALUE + '"}')).toEqual({ value: 0 });
  });
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
