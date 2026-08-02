export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;

export function calculate(x: number): number {
export function calculate(x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError("calculate: input must be a finite number");
  }
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}
export function processData(input: string): { value: number } {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
    if (parsed && Number.isFinite(parsed.value)) {
    }
    return { value: 0 };
  } catch {
  } catch (error) {
    console.error("processData: failed to parse input:", error);
    return { value: 0 };
}
import { describe, expect, test } from "vitest";
const BOUNDARY_LOW = 100;
const BOUNDARY_MEDIUM = 1000;
const BOUNDARY_HIGH = 4999;


describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [BOUNDARY_LOW, BOUNDARY_LOW * MULTIPLIER],
    [BOUNDARY_MEDIUM, BOUNDARY_MEDIUM * MULTIPLIER],
    [BOUNDARY_HIGH, BOUNDARY_HIGH * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [6000, 6000 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  test("non-finite inputs throw", () => {
    expect(() => calculate(NaN)).toThrow();
    expect(() => calculate(Infinity)).toThrow();
  });

  test("large finite inputs are not silently masked", () => {
    expect(calculate(Number.MAX_VALUE)).toBe(Infinity);
  });
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

  test("non-number value returns the default result", () => {
    expect(processData('{"value":"42"}')).toEqual({ value: 0 });
  });

  test("array root is handled", () => {
    expect(processData("[1,2]")).toEqual({ value: 0 });
  });
  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
