import type { Issue } from "./jsonl-parser.js";
import type { AIHub } from "../ai/index.js";
export interface VerifyOptions {
    aiHub?: AIHub;
    useAi?: boolean;
}
export declare function verifyFindings(findings: Issue[], options?: VerifyOptions): Promise<Issue[]>;
