export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
export const EXTREME_MULTIPLIER = MULTIPLIER * 2;
const TEST_INPUT_100 = 100;
const TEST_INPUT_1000 = 1000;
const TEST_INPUT_4999 = 4999;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { value: number } {
export function processData(input: string): { value: number } {
  // Fallback semantics: invalid JSON, non-object JSON (e.g. "42", true), missing value,
  // value:null, and non-number values all intentionally collapse to { value: 0 }.
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
      return { value: parsed.value };
    }
    return { value: 0 };
  } catch {
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [TEST_INPUT_100, TEST_INPUT_100 * MULTIPLIER],
    [TEST_INPUT_1000, TEST_INPUT_1000 * MULTIPLIER],
    [TEST_INPUT_4999, TEST_INPUT_4999 * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * EXTREME_MULTIPLIER],
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
});

  test("string number value falls back to the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("bare JSON number falls back to the default result", () => {
    expect(processData("42")).toEqual({ value: 0 });
  });

  test("boolean value falls back to the default result", () => {
    expect(processData('{"value":true}')).toEqual({ value: 0 });
  });

  test("valid zero value returns the parsed value", () => {
    expect(processData('{"value":0}')).toEqual({ value: 0 });
  });
});