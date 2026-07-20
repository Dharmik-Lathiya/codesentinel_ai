import type { Finding } from "../analyzer/index.js";
import type { GateConfig } from "../config/types.js";
import type { ScoreBreakdown } from "../scorer/index.js";

export interface GateResult {
  passed: boolean;
  reason: string;
}

export function evaluateGate(
  findings: Finding[],
  score: ScoreBreakdown | null,
  config: GateConfig,
): GateResult {
  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");
  const security = findings.filter((f) => f.category === "security");
  const bugs = findings.filter((f) => f.category === "bug");

  if (critical.length > config.maxCritical) {
    return { passed: false, reason: `Too many critical findings: ${critical.length} > ${config.maxCritical}` };
  }
  if (high.length > config.maxHigh) {
    return { passed: false, reason: `Too many high findings: ${high.length} > ${config.maxHigh}` };
  }
  if (config.blockOnSecurity && security.length > 0) {
    return { passed: false, reason: `Security findings blocked: ${security.length} found` };
  }
  if (config.blockOnBugs && bugs.length > 0) {
    return { passed: false, reason: `Bug findings blocked: ${bugs.length} found` };
  }
  if (score && score.overall < config.minScore) {
    return { passed: false, reason: `Score ${score.overall}/100 below minimum ${config.minScore}` };
  }

  return { passed: true, reason: "All gate checks passed" };
}
