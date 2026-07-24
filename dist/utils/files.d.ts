/** Convert a glob pattern (subset) into a RegExp. Supports **, *, ?, {a,b}. */
export declare function globToRegExp(glob: string): RegExp;
/** Recursively walk a directory yielding file paths (relative to root). */
export declare function walk(root: string): string[];
/** Read a .codesentinelignore file and return its patterns (one per line). */
export declare function readIgnoreFile(root: string): string[];
/** Collect files under `root` matching include globs and not exclude globs. */
export declare function collectFiles(root: string, include: string[], exclude: string[]): string[];
/** Read a file as UTF-8 (returns "" on failure). */
export declare function readText(path: string): string;
/** Map a file extension to a language label for prompt context. */
export declare function languageOf(path: string): string;
/** Ensure a directory (and parents) exists. */
export declare function ensureDir(path: string): void;
/** Backup a file with a timestamp suffix. Returns the backup path. */
export declare function backupFile(filePath: string): string;
