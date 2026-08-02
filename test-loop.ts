export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;
// calculate() is only exact for inputs up to ~1.1e12 (Number.MAX_SAFE_INTEGER / (MULTIPLIER * 2)).
const BELOW_EXTREME = 9999;
const SAMPLE_VALUE = 42;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}
}
const isValuePayload = (input: unknown): input is { value?: number } =>
  !!input && typeof input === "object" && "value" in input;

export function processData(input: string): { value: number } {
  let result: { value: number } = { value: 0 };
  try {
    const parsed = JSON.parse(input) as unknown;
    if (isValuePayload(parsed) && typeof parsed.value === "number") {
      result = { value: parsed.value };
    }
  } catch (error) {
    console.debug("processData: JSON.parse failed", error);
  }
  return result;
}
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [SMALL_VALUE, SMALL_VALUE * MULTIPLIER],
    [MEDIUM_VALUE, MEDIUM_VALUE * MULTIPLIER],
    [BELOW_EXTREME, BELOW_EXTREME * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
  });
});

  test("valid JSON returns the parsed value", () => {
    expect(processData(`{"value":${SAMPLE_VALUE}}`)).toEqual({ value: SAMPLE_VALUE });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });
  });

  test("null value returns the default result", () => {
    expect(processData('{"value":null}')).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
