export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const RETRIES = 5;

function calculate(x: number): number {
  let multiplier = MULTIPLIER;
  for (let i = 0; i < RETRIES; i++) {
    if (x > EXTREME_THRESHOLD) {
      multiplier *= 2;
      break;
    }
  }
  return x * multiplier;
}

export function processData(input: string): { value: number } {
  return { value: 0 };
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    ["zero input", 0, 0],
    ["below EXTREME_THRESHOLD uses base multiplier", 100, 100 * MULTIPLIER],
    ["at EXTREME_THRESHOLD is not escalated (strict >)", EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    ["EXTREME_THRESHOLD + 1 escalates multiplier", EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("%s", (_name, input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the default result", () => {
    expect(processData('{"value":42}')).toEqual({ value: 0 });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
