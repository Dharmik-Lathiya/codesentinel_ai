import type { Finding } from "../analyzer/index.js";
import type { SecretPattern } from "../config/types.js";
export declare function scanSecrets(path: string, content: string, patterns: SecretPattern[]): Finding[];
/**
 * Redact secrets from file content before sending to an AI provider.
 * Returns a new string with each detected secret replaced by
 * `[REDACTED:<pattern-id>]`. The original content is never modified.
 */
export declare function redactSecrets(content: string, patterns: SecretPattern[]): string;
