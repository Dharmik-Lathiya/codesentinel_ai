export interface FileBatch {
    index: number;
    files: {
        path: string;
        content: string;
        diff?: string;
    }[];
}
export declare function groupIntoBatches<T extends {
    path: string;
}>(files: T[], batchSize: number): T[][];
export declare function estimateTokenBudget(files: {
    path: string;
    content: string;
    diff?: string;
}[], maxTokens: number): number;
