/**
 * Execute async operations with bounded concurrency. Returns results in input order.
 */
export declare function concurrentMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency?: number): Promise<R[]>;
