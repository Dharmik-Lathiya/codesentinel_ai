import type { Finding } from "../analyzer/index.js";
import type { GateConfig } from "../config/types.js";
import type { ScoreBreakdown } from "../scorer/index.js";
export declare const MAX_SCORE = 100;
export interface GateResult {
    passed: boolean;
    reason: string;
}
export declare function evaluateGate(findings: Finding[], score: ScoreBreakdown | null, config: GateConfig): GateResult;
