/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 * Errors are collected per-item; the caller is responsible for filtering.
 */
export async function concurrentMap(items, fn, concurrency = 5) {
    if (!Array.isArray(items))
        throw new TypeError('items must be an array');
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error('concurrency must be a positive integer');
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await fn(items[index], index);
            }
            catch (error) {
                results[index] = error instanceof Error ? error : new Error(String(error));
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    try {
        await Promise.all(workers);
    }
    catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
    return results;
}
//# sourceMappingURL=concurrency.js.map