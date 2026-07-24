/** Run a git command in the given cwd, returning stdout. */
export declare function git(args: string[], cwd?: string): Promise<string>;
export interface DiffFile {
    /** Path of the file changed in the diff. */
    path: string;
    /** Unified diff text for this file. */
    diff: string;
    /** Full (post-change) content of the file, if it still exists. */
    content: string;
    /** Status: added | modified | deleted | renamed. */
    status: "added" | "modified" | "deleted" | "renamed";
}
/**
 * Collect the changed files for the current PR/branch relative to a base ref.
 * Falls back to the working tree diff when no base ref is supplied and no
 * upstream branch is configured.
 */
export declare function collectDiff(base?: string, cwd?: string): Promise<DiffFile[]>;
