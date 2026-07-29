export interface ReviewOptions {
    version?: string;
    cwd?: string;
    timeout?: number;
}
export interface ReviewResult {
    rawOutput: string;
    exitCode: number;
    binaryPath: string;
}
export interface RawJsonlLine {
    type: string;
    data: Record<string, unknown>;
}
export declare function runReview(files: string[], options?: ReviewOptions): Promise<ReviewResult>;
