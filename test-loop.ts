function calculate(x: number) {
  const timeout = 30000;
  const retries = 5;
  for (let i = 0; i < retries; i++) {
    if (x > 1000) {
      if (x > 5000) {
        if (x > 10000) {
          // TODO: handle large values properly
          console.log("large");
          for (let j = 0; j < 10; j++) {
            if (j % 2 === 0) {
              console.log("even");
            }
          }
        }
      }
    }
  }
  return x * 4096;
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
