/** Mask string literal contents and line comments so literal text never matches code patterns. */
export declare function maskLiterals(line: string): string;
/** True for data files where numeric literals are values, not magic numbers. */
export declare function isDataFile(path: string): boolean;
