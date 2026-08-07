import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const BELOW_THRESHOLD_INPUT = 4999;
const INPUT_BELOW_THRESHOLD = 5000;
const INPUT_AT_THRESHOLD = 6000;
const INPUT_JUST_BELOW_THRESHOLD = 9999;
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
 * Returns `{ ok: true; value }` for a finite numeric `value`, or
 * `{ ok: false; error }` for every invalid input (unparseable JSON,
 * missing/non-numeric value, NaN/Infinity).
 */
export type ProcessDataResult = { ok: true; value: number } | { ok: false; error: string };

export function processData(input: string): ProcessDataResult {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
      return { ok: true, value: parsed.value };
    }
    return { ok: false, error: "Invalid input: not a JSON object with a finite numeric value" };
  } catch {
    return { ok: false, error: "Invalid input: not a JSON object with a finite numeric value" };
  }
}
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [INPUT_BELOW_THRESHOLD, INPUT_BELOW_THRESHOLD * MULTIPLIER],
    [INPUT_AT_THRESHOLD, INPUT_AT_THRESHOLD * MULTIPLIER],
    [INPUT_JUST_BELOW_THRESHOLD, INPUT_JUST_BELOW_THRESHOLD * MULTIPLIER],
    [BELOW_EXTREME_INPUT, BELOW_EXTREME_INPUT * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('boundary value %i', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  test('x === EXTREME_THRESHOLD keeps the regular multiplier (branch is strictly greater-than)', () => {
    expect(calculate(EXTREME_THRESHOLD)).toBe(EXTREME_THRESHOLD * MULTIPLIER);
  });
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
  });
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
    expect(processData(input)).toEqual({ ok: false, error: "Invalid input: not a JSON object with a finite numeric value" });
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ value: 0 });
  });
    expect(processData('{"value":' + DECIMAL_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_VALUE });
  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":-7.25}')).toEqual({ value: -7.25 });
  });
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ value: SAMPLE_VALUE });
  });
    expect(processData("")).toEqual({ ok: false, error: "Invalid input: not a JSON object with a finite numeric value" });
  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});