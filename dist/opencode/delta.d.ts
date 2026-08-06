export interface FixIteration {
    iteration: number;
    file: string;
    fixed: boolean;
    explanation: string;
    verified: boolean;
    diff?: string;
    previousResult?: string;
}
export declare function buildDeltaContext(history: FixIteration[]): string;
export declare function mergeDeltas(existing: string, newDelta: string): string;
