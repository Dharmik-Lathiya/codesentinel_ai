/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 */
export async function concurrentMap(items, fn, concurrency = 5) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            try {
                results[index] = await fn(items[index], index);
            }
            catch (error) {
                throw error; // rethrow to propagate failure
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    try {
        await Promise.all(workers);
    }
    catch (error) {
        throw error; // rethrow to propagate failure
    }
    return results;
}
//# sourceMappingURL=concurrency.js.map