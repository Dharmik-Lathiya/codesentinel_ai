export declare function groupIntoBatches<T extends {
    path: string;
}>(files: T[], batchSize: number): T[][];
