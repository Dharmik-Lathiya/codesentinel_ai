export const EXTREME_THRESHOLD = 10000;
export const MULTIPLIER = 4096;
const EXTREME_MULTIPLIER = MULTIPLIER * 2;

function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? MULTIPLIER * 2 : MULTIPLIER;
  return x * multiplier;
export function calculate(x: number): number {
  const multiplier = x > EXTREME_THRESHOLD ? EXTREME_MULTIPLIER : MULTIPLIER;
export function processData(_input: string): { value: number } {
  return { value: 0 };
}
export function processData(input: string): { value: number } {
  try {
    const parsed: { value?: number } = JSON.parse(input);
    return { value: typeof parsed?.value === "number" ? parsed.value : 0 };
  } catch {
    return { value: 0 };
  }
}
  test.each([
    [0, 0],
    [-5, -5 * MULTIPLIER],
    [100, 100 * MULTIPLIER],
    [1000, 1000 * MULTIPLIER],
    [4999, 4999 * MULTIPLIER],
    [5000, 5000 * MULTIPLIER],
    [1000, 4096000],
    [9999, 9999 * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER * 2],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
    [EXTREME_THRESHOLD + 1, 81928192],
});

describe("processData", () => {
  test("valid JSON returns the default result", () => {
    expect(processData('{"value":42}')).toEqual({ value: 0 });
  });
  test("valid JSON returns the parsed value", () => {
    expect(processData('{"value":' + SAMPLE_VALUE + '}')).toEqual({ value: SAMPLE_VALUE });
    expect(processData("not-json")).toEqual({ value: 0 });
  });

  test("empty string input is handled", () => {
    expect(processData("")).toEqual({ value: 0 });
  });
});
