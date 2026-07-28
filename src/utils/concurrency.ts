/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 */
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 5,
): Promise<R[]> {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (concurrency < 1) throw new Error('concurrency must be >= 1');
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let aborted = false;

  async function worker(): Promise<void> {
    while (nextIndex < items.length && !aborted) {
      const index = nextIndex++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        aborted = true;
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
