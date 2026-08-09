import { describe, expect, test } from "vitest";
import { EXTREME_THRESHOLD, MULTIPLIER, EXTREME_MULTIPLIER, calculate, processData } from "./src/numeric";

const BELOW_THRESHOLD_INPUT = 4999;
const MODERATE_INPUT = 5000;
const HIGH_INPUT = 6000;
const BELOW_EXTREME_INPUT = 9999;
const SAMPLE_VALUE = 42;
const MAX_SAFE_INTEGER_BITS = 53;
const DECIMAL_FRACTION = 25;
const DECIMAL_SAMPLE_VALUE = -(7 + DECIMAL_FRACTION / 100);



describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -50],
    [BELOW_THRESHOLD_INPUT, 49990],
    [MODERATE_INPUT, 50000],
    [HIGH_INPUT, 60000],
    [BELOW_EXTREME_INPUT, 99990],
    [EXTREME_THRESHOLD - 1, 99990],
    [EXTREME_THRESHOLD, 100000],
    [EXTREME_THRESHOLD + 1, 10001000],
    [NaN, NaN],
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ])('boundary value %s', (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test.each([SAMPLE_VALUE])('valid JSON value %d returns the parsed value', (value) => {
    expect(processData('{"value":' + value + "}")).toEqual({ value });
  });

  test(`inputs above 2^${MAX_SAFE_INTEGER_BITS} lose integer precision (documented limitation)`, () => {
    const input = 2 ** MAX_SAFE_INTEGER_BITS + 1;
    const expected = BigInt(input) * BigInt(EXTREME_MULTIPLIER);
    expect(BigInt(Math.round(calculate(input)))).not.toBe(expected);
    expect(Number.isSafeInteger(calculate(input))).toBe(false);
  });
  test.each([
    ["not-json"],
    ["[1,2,3]"],
    ['{"value":"' + SAMPLE_VALUE + '"}'],
    ["{}"],
    ['{"value":null}'],
    ['{"value":1e999}'],
  ])('invalid input %s returns the default result', (input) => {
    expect(processData(input)).toEqual({ value: 0 });
  });
  test('explicit value 0 is a valid parsed value (documented sentinel)', () => {
    expect(processData('{"value":0}')).toEqual({ value: 0 });
  });
  test('negative and decimal values are preserved', () => {
    expect(processData('{"value":' + DECIMAL_SAMPLE_VALUE + '}')).toEqual({ value: DECIMAL_SAMPLE_VALUE });
  });
  test('whitespace-padded JSON is parsed', () => {
    expect(processData(' {"value": ' + SAMPLE_VALUE + "} ")).toEqual({ value: SAMPLE_VALUE });
  });

  test('empty string input is handled', () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});