import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;
const HIGH_INPUT = 6000;
const BELOW_EXTREME_INPUT = 9999;
const SAMPLE_VALUE = 42;
const DECIMAL_SAMPLE_VALUE = -7.25;

/**
 * Scales the input by a fixed multiplier.
 * NaN and ±Infinity inputs remain NaN/±Infinity after scaling.
 * Multiplication by a power-of-two multiplier is exact for all finite inputs; integer-safe results require x <= Number.MAX_SAFE_INTEGER.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}
/**
 * Returns a discriminated result: `{ ok: true, value }` for a finite numeric
 * `value`, or `{ ok: false }` for every invalid input (unparsable JSON,
 * missing/non-numeric value, NaN/Infinity).
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
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
  });

  test('results beyond Number.MAX_SAFE_INTEGER lose integer precision (documented limitation)', () => {
    const input = Number.MAX_SAFE_INTEGER;
    const expected = BigInt(input) * BigInt(EXTREME_MULTIPLIER);
    expect(BigInt(calculate(input))).toBe(expected);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ ok: false });
  });

  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_SAMPLE_VALUE });
  });
  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  });

  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ ok: false });
  });
});