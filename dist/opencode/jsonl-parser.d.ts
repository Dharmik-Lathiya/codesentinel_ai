export interface OpencodeLine {
    type: "summary" | "verdict" | "strength" | "issue" | "suggestion";
    data: Record<string, unknown>;
}
export interface ReviewSummary {
    text: string;
}
export interface Verdict {
    ready: boolean;
    reasoning: string;
    autoFixable?: boolean;
    confidence?: "high" | "medium" | "low";
}
export interface Strength {
    file?: string;
    line?: number;
    message: string;
}
export interface Issue {
    severity: "critical" | "important" | "minor";
    file: string;
    line: number;
    message: string;
    suggestion?: string;
    suggestionCode?: string;
}
export interface Suggestion {
    file: string;
    line: number;
    suggestion: string;
}
export interface OpencodeResult {
    summary: string;
    verdict: {
        ready: boolean;
        reasoning: string;
    };
    strengths: Strength[];
    issues: Issue[];
    suggestions: Suggestion[];
}
export declare function emptyOpencodeResult(): OpencodeResult;
export declare function parseOpencodeOutput(lines: string[]): OpencodeResult;
export declare function parseOpencodeFile(filePath: string): Promise<OpencodeResult>;
