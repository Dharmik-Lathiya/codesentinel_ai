import { describe, expect, test } from "vitest";

export const EXTREME_THRESHOLD = 10000; // intentional: inputs above this use a hard 2x multiplier step
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2; // 2x MULTIPLIER
const NORMAL_INPUT = 5000;
const BELOW_EXTREME_INPUT = 9999;
const SAMPLE_VALUE = 42;
const DECIMAL_SAMPLE_VALUE = -7.25;

/**
 * Scales the input by a fixed multiplier.
 * NaN and ±Infinity inputs remain NaN/±Infinity after scaling.
 * Results above Number.MAX_SAFE_INTEGER lose integer precision; the documented
 * domain is |x| <= MAX_SAFE_INPUT. Use `calculateSafe` to enforce it.
 */
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;

export const MAX_SAFE_INPUT = Math.floor(Number.MAX_SAFE_INTEGER / EXTREME_MULTIPLIER);

/**
 * Safe variant of `calculate`: enforces the documented input domain
 * (|x| <= MAX_SAFE_INPUT) and rejects non-finite inputs, so results
 * never silently lose integer precision.
 */
export function calculateSafe(x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError("calculateSafe: input must be finite");
  }
  if (Math.abs(x) > MAX_SAFE_INPUT) {
    throw new RangeError("calculateSafe: input exceeds the safe domain");
  }
  return calculate(x);
}
}

function isValueObject(v: unknown): v is { value?: number } {
  return typeof v === "object" && v !== null && "value" in v;
}
  /**
 * Returns a discriminated result for the parsed numeric `value`.
 * `ok: true` means the input contained a finite number `value`;
 * `ok: false` reports a `reason` so callers can choose their own fallback
 * and tell a literal {"value": 0} apart from a failed parse.
 */
export function processData(input: string): { ok: true; value: number } | { ok: false; reason: "parse-error" | "invalid-value" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    return { ok: false, reason: "parse-error" };
  }
  if (isValueObject(parsed) && typeof parsed.value === "number" && Number.isFinite(parsed.value)) {
    return { ok: true, value: parsed.value };
  }
  return { ok: false, reason: "invalid-value" };
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [NORMAL_INPUT, NORMAL_INPUT * MULTIPLIER],
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

describe("calculateSafe", () => {
  test("scales values inside the documented domain", () => {
    expect(calculateSafe(NORMAL_INPUT)).toBe(NORMAL_INPUT * EXTREME_MULTIPLIER);
  });
  test("throws for non-finite inputs", () => {
    expect(() => calculateSafe(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
  test("throws for inputs that would lose integer precision", () => {
    expect(() => calculateSafe(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe("processData", () => {
  test.each([42, SAMPLE_VALUE])('valid JSON value %d returns a successful result', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ ok: true, value });
  });

  test('inputs above 2^53 lose integer precision (documented limitation)', () => {
    const input = 2 ** 53 + 1;
    const expected = BigInt(input) * BigInt(EXTREME_MULTIPLIER);
    expect(BigInt(calculate(input))).not.toBe(expected);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
  test('unparsable JSON returns a parse-error result', () => {
    expect(processData("not-json")).toEqual({ ok: false, reason: "parse-error" });
  });
  test.each([
    ["[1,2,3]"],
    ['{"value":"42"}'],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  ])('valid JSON with a non-numeric value %s returns an invalid-value result', (input) => {
    expect(processData(input)).toEqual({ ok: false, reason: "invalid-value" });
  });

  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ ok: true, value: DECIMAL_SAMPLE_VALUE });
  });
  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ ok: true, value: SAMPLE_VALUE });
  });

  test('empty string input returns a parse-error result', () => {
    expect(processData("")).toEqual({ ok: false, reason: "parse-error" });
  });
  test('a literal {\"value\":0} is a successful result, distinct from failures', () => {
    expect(processData('{\"value\":0}')).toEqual({ ok: true, value: 0 });
  });
  test.each([
    ['true'],
    ['\"42\"'],
    ['null'],
  ])('top-level primitive %s is rejected with an invalid-value result', (input) => {
    expect(processData(input)).toEqual({ ok: false, reason: 'invalid-value' });
  });
});