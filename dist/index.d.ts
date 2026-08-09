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
