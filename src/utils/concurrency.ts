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
  const results: (R | Error)[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      // Each worker must claim its index synchronously (nextIndex++) BEFORE
      // awaiting fn(...). Keep this ordering — an await before the increment
      // would let multiple workers process the same index twice.
      const index = nextIndex++;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  try {
    await Promise.all(workers);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return results;
}

/**
 * Discriminated union result for concurrentMapSettled: `ok: true` carries the
 * value, `ok: false` carries the error.
 */
export type ConcurrentSettled<T> = { ok: true; value: T } | { ok: false; error: Error };

/**
 * Like concurrentMap, but returns a discriminated union per item so callers
 * never have to instanceof-narrow a bare (R | Error)[].
 */
export async function concurrentMapSettled<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 5,
): Promise<ConcurrentSettled<R>[]> {
  const results = await concurrentMap(items, fn, concurrency);
  return results.map((result) =>
    result instanceof Error ? { ok: false, error: result } : { ok: true, value: result },
  );
}
