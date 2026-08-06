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
 * Results above Number.MAX_SAFE_INTEGER lose integer precision.
 * Note: inputs strictly greater than EXTREME_THRESHOLD use a 2x multiplier, so
 * calculate(x) jumps exactly 2x for a value just above the threshold.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}

/**
 * Returns the parsed numeric `value`, or 0 as a sentinel for every invalid
 * input (unparseable JSON, missing/non-numeric value, NaN/Infinity).
 * Finite numbers above Number.MAX_SAFE_INTEGER lose integer precision.
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
    ['zero', 0, 0],
    ['negative', -5, -5 * MULTIPLIER],
    ['below threshold', BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    ['moderate', MODERATE_INPUT, MODERATE_INPUT * MULTIPLIER],
    ['high', HIGH_INPUT, HIGH_INPUT * MULTIPLIER],
    ['below extreme', BELOW_EXTREME_INPUT, BELOW_EXTREME_INPUT * MULTIPLIER],
    ['exactly extreme', EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    ['above extreme', EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    ['NaN', NaN, NaN],
    ['Infinity', Infinity, Infinity],
    ['-Infinity', -Infinity, -Infinity],
  ])('boundary value %s', (_name, input, expected) => {
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