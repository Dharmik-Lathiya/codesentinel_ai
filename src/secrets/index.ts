import type { Finding } from "../analyzer/index.js";
import type { SecretPattern, Severity } from "../config/types.js";

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
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      if (trimmed.startsWith("#")) continue;

      re.lastIndex = 0;
      if (re.test(line)) {
        findings.push({
          severity: pattern.severity as Severity,
          category: "security",
          file: path,
          line: i + 1,
          comment: pattern.message,
          suggestion: pattern.suggestion,
          source: "static",
        });
      }
    }
  }

  return findings;
}
