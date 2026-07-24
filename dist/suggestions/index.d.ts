import type { Finding } from "../analyzer/index.js";
/**
 * Format a finding as a GitHub committable suggestion block.
 * GitHub shows "Commit suggestion" button on fenced code blocks with `suggestion` tag.
 */
export declare function formatSuggestion(finding: Finding, originalCode: string, suggestedCode: string): string;
/**
 * Wrap multiple findings into a single comment with suggestion blocks.
 */
export declare function buildSuggestionsComment(findings: Finding[], fileContents: Map<string, string>): string;
