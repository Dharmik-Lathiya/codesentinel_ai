import type { Finding } from "../analyzer/index.js";
/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export declare function buildSuggestionsComment(findings: Finding[], fileContents: Map<string, string>): string;
