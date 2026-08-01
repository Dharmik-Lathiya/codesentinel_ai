const LARGE_THRESHOLD = 1000;
const VERY_LARGE_THRESHOLD = 5000;
const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;
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
  try {
    const parsed = JSON.parse(input);
    return { value: parsed.value };
  } catch {
    return { value: 0 };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [100, 100 * MULTIPLIER],
    [LARGE_THRESHOLD, LARGE_THRESHOLD * MULTIPLIER],
    [VERY_LARGE_THRESHOLD, VERY_LARGE_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
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

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
