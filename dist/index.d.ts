#!/usr/bin/env node
export interface DismissArgs {
    reason: string;
    ruleId?: string;
    filePath?: string;
    lineNum?: number | null;
    ruleIdArg?: string;
    error?: string;
}
export declare function parseDismissArgs(dismissArgs: string[]): DismissArgs;
export declare const WORKFLOW_CONTENT: string;
export declare const BUILD_WORKFLOW_CONTENT: string;
export declare function runSetup(force: boolean): void;
