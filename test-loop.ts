export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

function isValueRecord(x: unknown): x is { value?: number } {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function processData(input: string): { value: number } {
  try {
    const parsed: unknown = JSON.parse(input);
    if (isValueRecord(parsed) && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch (error) {
    console.debug("processData: JSON parse failed", error);
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";
const INPUT_100 = 100;
const INPUT_1000 = 1000;
const INPUT_4999 = 4999;

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [INPUT_100, INPUT_100 * MULTIPLIER],
    [INPUT_1000, INPUT_1000 * MULTIPLIER],
    [INPUT_4999, INPUT_4999 * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ value: 42 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });

  test("non-object JSON returns the default result", () => {
    expect(processData("42")).toEqual({ value: 0 });
    expect(processData('[1,2,3]')).toEqual({ value: 0 });
    expect(processData("true")).toEqual({ value: 0 });
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });
});
