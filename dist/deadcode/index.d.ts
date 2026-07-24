import type { Finding } from "../analyzer/index.js";
/**
 * Detect unused exports across files.
 * Reports exports that are defined but never imported by any other file.
 */
export declare function detectDeadCode(files: {
    path: string;
    content: string;
}[]): Finding[];
