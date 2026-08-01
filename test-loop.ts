export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;

export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
  return x * multiplier;
}

export function processData(input: string): { ok: true; value: number } | { ok: false } {
  try {
    const parsed = JSON.parse(input) as { value?: number } | null;
    if (parsed && typeof parsed.value === "number") {
      return { ok: true, value: parsed.value };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
import { describe, expect, test } from "vitest";

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("input %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":42}')).toEqual({ ok: true, value: 42 });
  });

  test("invalid JSON does not throw and returns the failure result", () => {
    expect(processData("not-json")).toEqual({ ok: false });
  });

  test("null value returns the failure result", () => {
    expect(processData('{"value":null}')).toEqual({ ok: false });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ ok: false });
  });

  test("string value returns the failure result", () => {
    expect(processData('{"value":"42"}')).toEqual({ ok: false });
  });

  test("boolean value returns the failure result", () => {
    expect(processData('{"value":true}')).toEqual({ ok: false });
  });

  test("array value returns the failure result", () => {
    expect(processData('{"value":[1,2,3]}')).toEqual({ ok: false });
  });

  test("root-level null JSON returns the failure result", () => {
    expect(processData("null")).toEqual({ ok: false });
  });

  test("1e999 (Infinity) returns the failure result", () => {
    expect(processData("1e999")).toEqual({ ok: false });
  });
});
