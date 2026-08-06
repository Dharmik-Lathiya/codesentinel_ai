import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;
const HIGH_INPUT = 6000;
const BELOW_EXTREME_INPUT = 9999;
const SAMPLE_VALUE = 42;

/**
 * Scales the input by a fixed multiplier.
 * NaN and ±Infinity inputs remain NaN/±Infinity after scaling.
 * Integer precision is lost for inputs above
 * Math.trunc(Number.MAX_SAFE_INTEGER / MULTIPLIER) (~2^41) on the normal path,
 * and above Math.trunc(Number.MAX_SAFE_INTEGER / EXTREME_MULTIPLIER) when the
 * extreme 2x multiplier applies (inputs above EXTREME_THRESHOLD).
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}

 * Returns the parsed numeric `value`, or 0 as a sentinel for every invalid
 * input (unparseable JSON, non-numeric/missing value, NaN/Infinity).
 * Finite numbers above Number.MAX_SAFE_INTEGER lose integer precision.
 * NOTE: the sentinel 0 also swallows parse errors (empty catch), so a real zero
 * value and an invalid input are indistinguishable to callers.
 */
 */
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
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    [MODERATE_INPUT, MODERATE_INPUT * MULTIPLIER],
    [HIGH_INPUT, HIGH_INPUT * MULTIPLIER],
    [BELOW_EXTREME_INPUT, BELOW_EXTREME_INPUT * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
  ])('boundary value %i', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });

  test.each([
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('non-finite input %s passes through', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test.each([42, SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ value });
  });

  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
    ["{" + SAMPLE_VALUE + "}"],
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ value: 0 });
  });

  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":-7.25}')).toEqual({ value: -7.25 });
  });

  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ value: SAMPLE_VALUE });
  });

  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});