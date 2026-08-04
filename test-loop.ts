import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;

const SAMPLE_VALUE = 42;

/**
 * Accepts finite numbers; NaN/Infinity inputs pass through unchanged.
 * Results above Number.MAX_SAFE_INTEGER lose integer precision.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}
const DEFAULT_RESULT: { value: number } = { value: 0 };

export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { value: parsed.value };
    }
    return DEFAULT_RESULT;
  } catch {
    return DEFAULT_RESULT;
  }
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
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("valid JSON SAMPLE_VALUE returns the parsed value", () => {
    expect(processData('{"value":' + SAMPLE_VALUE + '}')).toEqual({ value: SAMPLE_VALUE });
  });
  test("invalid JSON returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("non-numeric value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("non-numeric SAMPLE_VALUE returns the default result", () => {
    expect(processData('{"value":"' + SAMPLE_VALUE + '"}')).toEqual({ value: 0 });
  });
  test("non-object value returns the default result", () => {
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
