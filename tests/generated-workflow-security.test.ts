import { describe, it, expect } from "vitest";
import { BUILD_WORKFLOW_CONTENT } from "../src/index.js";

// BUILD_WORKFLOW_CONTENT is exported as a pre-joined YAML string
const lines = BUILD_WORKFLOW_CONTENT.split("\n");

describe("generated build-fix workflow — secret hygiene", () => {
  it("never writes the push token into the git remote config", () => {
    const offenders = lines.filter((l) => /remote\s+set-url[^\n]*x-access-token:/i.test(l));
    expect(offenders, `token-bearing set-url found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("never redirects token-bearing commands into the log stream", () => {
    const offenders = lines.filter((l) => l.includes("x-access-token:") && l.includes("2>&1"));
    expect(offenders, `credential-bearing output echoed:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("suppresses all output of authenticated push/fetch commands", () => {
    const authedCommands = lines.filter(
      (l) => /git\s+(push|fetch)\b/.test(l) && (l.includes("PUSH_URL") || l.includes("x-access-token:")),
    );
    expect(authedCommands.length, "expected at least one authenticated git command").toBeGreaterThan(0);
    for (const line of authedCommands) {
      expect(line, `unsuppressed output leaks credential URLs on failure:\n${line}`).toMatch(
        />\s*\/dev\/null\s+2>&1/,
      );
    }
  });

  it("pushes at most twice (retry after rebase), never unconditionally after the guard", () => {
    const barePush = lines.filter((l) => /^\s*"?git push /.test(l.trim()));
    // one guarded attempt + one post-rebase recovery attempt max
    expect(barePush.length).toBeLessThanOrEqual(2);
  });
});
