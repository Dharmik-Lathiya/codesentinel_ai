export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const TEST_VALUE_100 = 100;
const TEST_VALUE_1000 = 1000;

function calculate(x: number): number {
export function calculate(x: number): number {
  const multiplier = x >= EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
}

export function processData(_input: string): { value: number } {
export function processData(input: string): { value: number } {
  try {
    return { value: JSON.parse(input)?.value ?? 0 };
  } catch {
    return { value: 0 };
  }
}

describe("calculate", () => {
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [-5, -20480],
    [100, 409600],
    [1000, 4096000],
    [4999, 20475904],
    [5000, 20480000],
    [6000, 24576000],
    [9999, 40955904],
    [10000, 81920000],
    [10001, 81928192],
    expect(calculate(input)).toBe(expected);
  });
});

describe("processData", () => {
  test("valid JSON returns the default result", () => {
  test("valid JSON returns the parsed value", () => {
    expect(processData(`{"value":${SAMPLE_VALUE}}`)).toEqual({ value: SAMPLE_VALUE });
  });

  test("invalid JSON does not throw and returns the default result", () => {
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
