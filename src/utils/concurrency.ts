/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 * Errors are collected per-item; the caller is responsible for filtering.
 */
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 5,
): Promise<(R | Error)[]> {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  const dense = Array.from(items);
  const results: (R | Error)[] = new Array(dense.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < dense.length) {
      const index = nextIndex++;
      try {
        results[index] = await fn(dense[index], index);
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, dense.length) }, () => worker());
  try {
    await Promise.all(workers);
  } catch (error) {
    throw error;
  }
  return results;
}
