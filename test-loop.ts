import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = EXTREME_THRESHOLD / 2 - 1;
const MODERATE_INPUT = EXTREME_THRESHOLD / 2;
const HIGH_INPUT = MODERATE_INPUT + 1000;
const BELOW_EXTREME_INPUT = EXTREME_THRESHOLD - 1;
const SAMPLE_VALUE = 42;
const MAX_SAFE_INTEGER_BITS = 53;
const DECIMAL_FRACTION = 25;
const DECIMAL_SAMPLE_VALUE = -(7 + DECIMAL_FRACTION / 100);

/**
 * Scales the input by a fixed multiplier.
 * NaN and ±Infinity inputs remain NaN/±Infinity after scaling.
 * Results above Number.MAX_SAFE_INTEGER lose integer precision.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  const multiplier = Math.abs(x) > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
}

function isValueObject(v: unknown): v is { value?: number } {
function isValueObject(v: unknown): v is { value: number } {
  return typeof v === "object" && v !== null && typeof (v as { value?: number }).value === "number";
}
/**
 * Returns `{ ok: true, value }` on valid numeric inputs, or `{ ok: false }` for
 * invalid ones (unparsable JSON, missing/non-numeric value, NaN/Infinity), so a
 * legitimate `{"value": 0}` is distinguishable from a parse failure.
 */
export type ProcessDataResult = { ok: true; value: number } | { ok: false };
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
});

describe("processData", () => {
  test.each([SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ value });
  });
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
  test(`inputs above 2^${MAX_SAFE_INTEGER_BITS} lose integer precision (documented limitation)`, () => {
    const input = 2 ** MAX_SAFE_INTEGER_BITS + 1;
    const expected = BigInt(input) * BigInt(EXTREME_MULTIPLIER);
    expect(BigInt(calculate(input))).not.toBe(expected);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":1e999}'],
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ value: 0 });
  });
    expect(processData(input)).toEqual({ ok: false });
  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ value: DECIMAL_SAMPLE_VALUE });
  });
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_SAMPLE_VALUE });
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ value: SAMPLE_VALUE });
  });
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ value: 0 });
  });
    expect(processData("")).toEqual({ ok: false });