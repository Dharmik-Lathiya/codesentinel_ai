import { languageOf } from "../utils/files.js";
import type { Severity } from "../config/types.js";

/** A finding produced by either static or AI analysis. */
export interface Finding {
  severity: Severity;
  category: "bug" | "security" | "performance" | "smell" | "style" | "praise";
  file: string;
  line: number | null;
  comment: string;
  suggestion?: string;
  /** Source of the finding: local heuristic or the AI model. */
  source: "static" | "ai";
}

/**
 * StaticAnalyzer runs cheap, deterministic, offline heuristic checks that do
 * not require an AI call. These act as a fast first pass and also power the
 * scoring breakdown even when AI is unavailable.
 */
export class StaticAnalyzer {
  /**
   * Scan a single file's content for common issues. Returned findings include
   * line numbers where possible.
   */
  analyze(path: string, content: string): Finding[] {
    const findings: Finding[] = [];
    const lines = content.split("\n");

    // 1. Hardcoded secrets / API keys.
    lines.forEach((line, idx) => {
      if (/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i.test(line)) {
        findings.push({
          severity: "high",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Possible hardcoded API key detected.",
          suggestion: "Move secrets to environment variables or a secrets manager.",
          source: "static",
        });
      }
      // 2. console.log left in source (smell, not for tests).
      if (/\bconsole\.(log|debug)\(/.test(line) && !path.includes(".test.")) {
        findings.push({
          severity: "low",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Debug logging left in source.",
          suggestion: "Remove or replace with a proper logger.",
          source: "static",
        });
      }
      // 3. eval usage (security).
      if (/\beval\s*\(/.test(line)) {
        findings.push({
          severity: "critical",
          category: "security",
          file: path,
          line: idx + 1,
          comment: "Use of eval() is dangerous and can lead to code injection.",
          suggestion: "Avoid eval; parse structured input instead.",
          source: "static",
        });
      }
      // 4. TODO/FIXME without tracking.
      if (/(TODO|FIXME|XXX)\b/.test(line)) {
        findings.push({
          severity: "info",
          category: "smell",
          file: path,
          line: idx + 1,
          comment: "Tech-debt marker (TODO/FIXME) found.",
          suggestion: "Link to a tracked issue where possible.",
          source: "static",
        });
      }
    });

    return findings;
  }

  /** Aggregate findings across many files. */
  analyzeMany(files: { path: string; content: string }[]): Finding[] {
    return files.flatMap((f) => this.analyze(f.path, f.content));
  }
}

/** Detect the language label for a path (re-export for convenience). */
export function langFor(path: string): string {
  return languageOf(path);
}
