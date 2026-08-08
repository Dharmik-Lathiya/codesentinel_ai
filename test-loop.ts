import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const BELOW_EXTREME_INPUT = 9999;
const SAMPLE_VALUE = 42;
const DECIMAL_SAMPLE_VALUE = -7.25;

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
function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
export type ProcessDataResult =
/**
export type ProcessDataResult = { ok: true; value: number } | { ok: false };
/**
 * Returns the parsed numeric `value`, or `{ ok: false }` for every invalid
 * input (unparseable JSON, missing/non-numeric value, NaN/Infinity).
 */
export function processData(input: string): ProcessDataResult {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { ok: true, value: parsed.value };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    [MODERATE_INPUT, MODERATE_INPUT * MULTIPLIER],
    [HIGH_INPUT, HIGH_INPUT * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('boundary value %i', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test.each([42, SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ value });
  test.each([SAMPLE_VALUE, SAMPLE_VALUE + 1])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
  test('inputs above 2^53 lose integer precision (documented limitation)', () => {
    const input = 2 ** 53 + 1;
  test(`inputs above 2^${MAX_SAFE_INTEGER_EXPONENT} lose integer precision (documented limitation)`, () => {
    const input = 2 ** MAX_SAFE_INTEGER_EXPONENT + 1;
    const effectiveInput = 2 ** MAX_SAFE_INTEGER_EXPONENT;
    expect(input).toBe(effectiveInput);
    expect(calculate(effectiveInput)).toBe(effectiveInput * EXTREME_MULTIPLIER);
    expect(Number.isSafeInteger(calculate(effectiveInput))).toBe(false);
  });
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  test.each([17, -7])('valid JSON value %d returns the parsed value', (value) => {
  ])('invalid input %s returns the default result', (input) => {
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ ok: false });
  });
    expect(processData('{"value":-7.25}')).toEqual({ value: -7.25 });
  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":-7.25}')).toEqual({ ok: true, value: -7.25 });
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_SAMPLE_VALUE });
  });
  });
  expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ value: 0 });
  });
  expect(processData("")).toEqual({ ok: false });