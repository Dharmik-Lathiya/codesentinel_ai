import { type ReviewEntry, type IssueEntry } from "./types/jsonl.js";
export interface ReviewResult {
    summary: string;
    verdict: "approved" | "changes_requested" | "comment";
    strengths: {
        title: string;
        description?: string;
    }[];
    issues: IssueEntry[];
}
export declare function emptyResult(): ReviewResult;
export declare function parseJsonlString(raw: string): ReviewEntry[];
export declare function parseJsonlFile(filePath: string): ReviewEntry[];
export declare function validateAndNormalize(entries: ReviewEntry[]): ReviewResult;
export declare function buildReviewBody(result: ReviewResult): string;
export declare function buildInlineComments(result: ReviewResult): {
    file: string;
    line: number | null;
    body: string;
    severity: string;
}[];
