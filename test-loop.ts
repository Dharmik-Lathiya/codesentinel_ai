const LARGE_THRESHOLD = 1000;
const VERY_LARGE_THRESHOLD = 5000;
const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;

function calculate(x: number) {
function calculate(x: number) {
  const maxSafe = Math.floor(Number.MAX_SAFE_INTEGER / MULTIPLIER);
  const clamped = Math.max(-maxSafe, Math.min(maxSafe, x));
  return clamped * MULTIPLIER;
}
export function processData(input: string) {
export function processData(input: string) {
  const result = { value: 0 };
  try {
    const parsed = JSON.parse(input);
    result.value = parsed.value ?? 0;
  } catch (error) {
    console.warn(`processData failed to parse input: ${error instanceof Error ? error.message : String(error)}`);
  }
  return result;
}
describe("calculate", () => {
  test.each([
    [0, 0],
  test.each([
    [0, 0],
    [SAMPLE_INPUT, SAMPLE_INPUT * MULTIPLIER],
    [LARGE_THRESHOLD, LARGE_THRESHOLD * MULTIPLIER],
    [VERY_LARGE_THRESHOLD, VERY_LARGE_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD, EXTREME_THRESHOLD * MULTIPLIER],
    [EXTREME_THRESHOLD + 1, (EXTREME_THRESHOLD + 1) * MULTIPLIER],
    [-SAMPLE_INPUT, -SAMPLE_INPUT * MULTIPLIER],
  ])("boundary value %i", (input, expected) => {
    expect(calculate(input)).toBe(expected);
  });

  test("NaN input produces NaN", () => {
    expect(calculate(NaN)).toBeNaN();
  });

  test("large values are clamped to the safe integer range", () => {
    expect(calculate(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
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
