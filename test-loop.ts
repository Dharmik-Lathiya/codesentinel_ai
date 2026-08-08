import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;
const HIGHER_NORMAL_INPUT = 6000; // still below EXTREME_THRESHOLD — named to avoid implying it straddles it
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
function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}
/**
 * Returns `{ ok: true, value }` on a valid numeric value, or `{ ok: false }` for
 * every invalid input (unparseable JSON, missing/non-numeric value, NaN/Infinity).
 * A real `value: 0` is therefore distinguishable from a parse/validation failure.
 */
export function processData(input: string): { ok: true; value: number } | { ok: false } {
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
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BELOW_THRESHOLD_INPUT, BELOW_THRESHOLD_INPUT * MULTIPLIER],
    [HIGHER_NORMAL_INPUT, HIGHER_NORMAL_INPUT * MULTIPLIER],
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

  test.each([SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
  });
  });

  test('inputs above 2^53 lose integer precision (documented limitation)', () => {
    const input = 2 ** 53 + 1;
    expect(calculate(input)).toBe(input * EXTREME_MULTIPLIER);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":true}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ ok: false });
  });
    expect(processData(input)).toEqual({ value: 0 });
  test.each([17, -7])('valid JSON value %s returns the parsed value', (value) => {
    expect(processData('{"value":' + value + '}')).toEqual({ ok: true, value });
  });
    expect(processData('{"value":-7.25}')).toEqual({ value: -7.25 });
  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_SAMPLE_VALUE });
  });
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ value: SAMPLE_VALUE });
  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  });
    expect(processData("")).toEqual({ value: 0 });
  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ ok: false });
  });