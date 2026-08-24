/** Minimal JSONC parser: strips // and /* *\/ comments then JSON.parse. */
export declare function parseJsonc(raw: string): Record<string, unknown>;
