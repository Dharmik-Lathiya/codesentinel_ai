import type { Finding } from "../analyzer/index.js";
import type { SecretPattern, Severity } from "../config/types.js";

function checkLine(
  line: string,
  lineNumber: number,
  path: string,
  pattern: SecretPattern,
  re: RegExp,
): Finding | null {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return null;
  if (trimmed.startsWith("#")) return null;

  re.lastIndex = 0;
  if (re.test(line)) {
    return {
      severity: pattern.severity as Severity,
      category: "security",
      file: path,
      line: lineNumber,
      comment: pattern.message,
      suggestion: pattern.suggestion,
      source: "static",
    };
  }
  return null;
}

export function scanSecrets(
  path: string,
  content: string,
  patterns: SecretPattern[],
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (const pattern of patterns) {
    const flags = pattern.regex.startsWith("(?i)") ? "gi" : "g";
    const source = pattern.regex.startsWith("(?i)") ? pattern.regex.slice(4) : pattern.regex;
    let re: RegExp;
    try {
      re = new RegExp(source, flags);
    } catch {
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const finding = checkLine(line, i + 1, path, pattern, re);
      if (finding) findings.push(finding);
    }
  }

  return findings;
}
