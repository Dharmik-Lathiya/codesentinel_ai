import type { CodeSentinelConfig } from "../config/types.js";
import type { AIHub } from "../ai/index.js";
import { PromptRegistry } from "../prompts/index.js";
/** A function detected in source that may need tests. */
export interface DetectedFunction {
    name: string;
    line: number;
    file: string;
    /** Whether a corresponding test file already exists for the source file. */
    hasTest: boolean;
}
/**
 * detectFunctions performs lightweight, language-agnostic detection of
 * top-level/explicitly-declared functions so we can find untested code. This is
 * heuristic (regex based) and intentionally fast/cheap.
 */
export declare function detectFunctions(root: string, files: {
    path: string;
    content: string;
}[]): DetectedFunction[];
export interface GeneratedTest {
    file: string;
    testFilePath: string;
    content: string;
}
/**
 * TestGenerator uses the AI model to produce unit tests for source files that
 * lack coverage. It writes generated tests into a sibling `__tests__` folder
 * (or co-located, depending on runner conventions).
 */
export declare class TestGenerator {
    private config;
    private ai;
    private prompts;
    constructor(config: CodeSentinelConfig, ai: AIHub, prompts: PromptRegistry);
    /**
     * Generate and save tests for the given source files. Returns the list of
     * written tests. Skips files that already appear to have tests unless
     * `force` is set.
     */
    generate(root: string, files: {
        path: string;
        content: string;
    }[], opts?: {
        force?: boolean;
    }): Promise<GeneratedTest[]>;
    private generateForFile;
    /** Determine the conventional test file path for a source file. */
    private testPathFor;
}
/** Determine if a path's test already exists on disk. */
export declare function testExists(root: string, srcPath: string): boolean;
