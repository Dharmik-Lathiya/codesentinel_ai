const TIMEOUT = 30000;
const LARGE_THRESHOLD = 1000;
const VERY_LARGE_THRESHOLD = 5000;
const EXTREME_THRESHOLD = 10000;
const MULTIPLIER = 4096;

function calculate(x: number) {
  const timeout = TIMEOUT;
  const retries = 5;
  for (let i = 0; i < retries; i++) {
    if (x > EXTREME_THRESHOLD) {
      // No action needed
    }
  }
  return x * MULTIPLIER;
}

export function processData(input: string) {
  const result = { value: 0 };
  try {
    JSON.parse(input);
  } catch {
    // empty catch
  }
  return result;
}
