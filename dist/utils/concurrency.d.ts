/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 * Errors are collected per-item; the caller is responsible for filtering.
 * Note: an Error value that `fn` resolves to (rather than throws) is treated as a successful result.
 * Sparse arrays: holes are preserved, and fn(undefined, i) is invoked for each hole.
 */
export declare function concurrentMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency?: number): Promise<(R | Error)[]>;
