import { describe, expect, test } from "vitest";

const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const SAMPLE_VALUE = 42;

/**
 * Scales the input by a fixed multiplier.
 * NaN and ±Infinity inputs remain NaN/±Infinity after scaling.
 * Results above Number.MAX_SAFE_INTEGER lose integer precision.
 */
function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && typeof (v as { value?: unknown }).value === "number";
}
/**
 * Returns the parsed numeric `value`, or 0 as a sentinel for every invalid
 * input (unparseable JSON, missing/non-numeric value, NaN/Infinity).
 */
function processData(input: string): { value: number } {
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
    [4999, 4999 * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('boundary value %i', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test.each([SAMPLE_VALUE])('valid JSON value returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ value });
  });
  test('JSON value 0 is returned as 0, which is numerically equal to the invalid-input sentinel (documented conflation)', () => {
    expect(processData('{"value":0}')).toEqual({ value: 0 });
  });

  test('inputs above 2^53 lose integer precision (documented limitation)', () => {
    const input = 2 ** 53 + 1;
    expect(calculate(input)).toBe(input * EXTREME_MULTIPLIER);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  test.each([17, -7])('valid JSON value %d returns the parsed value', (value) => {
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