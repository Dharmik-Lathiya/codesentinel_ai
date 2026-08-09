import { describe, expect, test } from "vitest";
import { EXTREME_THRESHOLD, MULTIPLIER, EXTREME_MULTIPLIER, calculate, processData } from "./src/numeric";

const MIDPOINT_INPUT = Math.floor(EXTREME_THRESHOLD / 2);
const BELOW_EXTREME_INPUT = EXTREME_THRESHOLD - 1;
const SAMPLE_VALUE = 42;
const MAX_SAFE_INTEGER_BITS = 53;
const DECIMAL_FRACTION = 25;
const DECIMAL_SAMPLE_VALUE = -(7 + DECIMAL_FRACTION / 100);

/**
describe("calculate", () => {
  test.each([
    [0, 0],
    [-0, -0],
    [1.5, 1.5 * MULTIPLIER],
    [-5, -5 * MULTIPLIER],
    [MIDPOINT_INPUT, MIDPOINT_INPUT * MULTIPLIER],
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

  test(`inputs above 2^${MAX_SAFE_INTEGER_BITS} lose integer precision (documented limitation)`, () => {
  test(`inputs above 2^${MAX_SAFE_INTEGER_BITS} lose integer precision (documented limitation)`, () => {
    const input = 2 ** MAX_SAFE_INTEGER_BITS + 1;
    const result = calculate(input);
    expect(Number.isFinite(result)).toBe(true);
    expect(Number.isSafeInteger(result)).toBe(false);
    expect(result).not.toBe(Number(BigInt(input) * BigInt(EXTREME_MULTIPLIER)));
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