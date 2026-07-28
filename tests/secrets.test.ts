import { describe, it, expect } from "vitest";
import { scanSecrets, redactSecrets } from "../src/secrets/index.js";
import type { SecretPattern } from "../src/config/types.js";

const TEST_PATTERNS: SecretPattern[] = [
  {
    id: "aws-key",
    name: "AWS Access Key",
    regex: "AKIA[0-9A-Z]{16}",
    severity: "critical",
    message: "Hardcoded AWS Access Key ID detected.",
    suggestion: "Use IAM roles or environment variables instead.",
  },
  {
    id: "github-token",
    name: "GitHub Token",
    regex: "(?i)github[-_]?(token|pat|key)\\s*[=:]\\s*['\"](ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}['\"]",
    severity: "critical",
    message: "Hardcoded GitHub token detected.",
    suggestion: "Use GITHUB_TOKEN secret or environment variables.",
  },
  {
    id: "jwt-token",
    name: "JWT Token",
    regex: "(?i)(jwt|bearer)\\s*[=:]\\s*['\"]eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}['\"]",
    severity: "high",
    message: "Hardcoded JWT token detected.",
    suggestion: "Use short-lived tokens from a secure source.",
  },
];

describe("scanSecrets", () => {
  it("detects an AWS key in file content", () => {
    // AKIA + 16 uppercase alphanumeric chars
    const content = 'const awsKey = "AKIA1234567890ABCDEF";';
    const findings = scanSecrets("test.ts", content, TEST_PATTERNS);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].category).toBe("security");
  });

  it("detects a JWT token in `jwt = \"eyJ...\"` format", () => {
    const content = 'jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNrxPmJ2H8k2H63sS2BSbSo9-lu3mN0s6o-n8Ls"';
    const findings = scanSecrets("test.ts", content, TEST_PATTERNS);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("returns empty for clean content", () => {
    const content = "const x = 1;\nconst y = 2;";
    const findings = scanSecrets("test.ts", content, TEST_PATTERNS);
    expect(findings).toHaveLength(0);
  });
});

describe("redactSecrets", () => {
  it("redacts an AWS key from content", () => {
    const raw = 'const awsKey = "AKIA1234567890ABCDEF";';
    const redacted = redactSecrets(raw, TEST_PATTERNS);
    expect(redacted).not.toContain("AKIA1234567890ABCDEF");
    expect(redacted).toContain("[REDACTED:aws-key]");
  });

  it("redacts a JWT token in `jwt = \"eyJ...\"` format", () => {
    const raw = 'jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNrxPmJ2H8k2H63sS2BSbSo9-lu3mN0s6o-n8Ls"';
    const redacted = redactSecrets(raw, TEST_PATTERNS);
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain("[REDACTED:jwt-token]");
  });

  it("preserves non-secret content", () => {
    const raw = "const x = 42;\nconst name = 'hello';";
    const redacted = redactSecrets(raw, TEST_PATTERNS);
    expect(redacted).toBe(raw);
  });

  it("does not modify the original string", () => {
    const raw = 'const key = "AKIA1234567890ABCDEF";';
    const copy = raw;
    redactSecrets(raw, TEST_PATTERNS);
    expect(raw).toBe(copy);
  });

  it("produces content safe to send to an AI provider", () => {
    const raw = [
      "// config",
      'aws: "AKIA1234567890ABCDEF"',
      'github_token = "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"',
      "const x = 1;",
    ].join("\n");

    const redacted = redactSecrets(raw, TEST_PATTERNS);

    for (const secret of ["AKIA1234567890ABCDEF", "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]) {
      expect(redacted).not.toContain(secret);
    }

    const markers = redacted.match(/\[REDACTED:[^\]]+\]/g);
    expect(markers).not.toBeNull();
    expect(markers!.length).toBeGreaterThanOrEqual(2);
  });
});
