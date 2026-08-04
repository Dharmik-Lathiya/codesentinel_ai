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
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}
export type ProcessDataResult = { ok: true; value: number } | { ok: false };

/**
 * Parses the numeric `value` from the input JSON, or returns `{ ok: false }`
 * for every invalid input (unparseable JSON, missing/non-numeric value, NaN/Infinity).
 * Finite numbers above Number.MAX_SAFE_INTEGER lose integer precision.
 */
export function processData(input: string): ProcessDataResult {
  try {
    const parsed: unknown = JSON.parse(input);
    if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { ok: true, value: parsed.value };
    }
    return { ok: false };
  } catch {
    return { ok: false };
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
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('boundary value %i', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });

  test('values above Number.MAX_SAFE_INTEGER lose integer precision', () => {
    expect(calculate(2 ** 53 + 1)).toBe((2 ** 53 + 1) * EXTREME_MULTIPLIER);
  });
});

describe("processData", () => {
  test.each([42, SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
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
  ])('invalid input %s returns { ok: false }', (input) => {
    expect(processData(input)).toEqual({ ok: false });
  });

  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":-7.25}')).toEqual({ ok: true, value: -7.25 });
  });

  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  });

  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ ok: false });
  });

  test('values above Number.MAX_SAFE_INTEGER lose integer precision', () => {
    expect(processData('{"value":9007199254740993}')).toEqual({ ok: true, value: 9007199254740993 });
  });
});