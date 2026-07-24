import type { Finding } from "../analyzer/index.js";
import type { SecretPattern } from "../config/types.js";
export declare function scanSecrets(path: string, content: string, patterns: SecretPattern[]): Finding[];
