import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const { mockRunLinters, mockRunThirdPartySecrets } = vi.hoisted(() => ({
  mockRunLinters: vi.fn(),
  mockRunThirdPartySecrets: vi.fn(),
}));

vi.mock("../src/linters/index.js", () => ({
  runLinters: mockRunLinters,
}));
vi.mock("../src/scanners/index.js", () => ({
  runThirdPartySecrets: mockRunThirdPartySecrets,
}));

const { Engine } = await import("../src/engine/index.js");
const { loadConfig } = await import("../src/config/index.js");

function fakeAI() {
  return {
    modelForTask: () => ({ provider: "opencode", model: "x" }),
    complete: async (task: string) => {
      if (task === "score") {
        return {
          content: JSON.stringify({
            readability: 70,
            maintainability: 65,
            security: 90,
            test_coverage: 55,
            rationale: "ai",
          }),
          model: "x",
          provider: "opencode",
        };
      }
      return { content: "{}", model: "x", provider: "opencode" };
    },
  };
}

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "codesentinel-auditfix-"));
  mkdirSync(join(root, "src"), { recursive: true });
  execSync("git init -q && git checkout -q -b main", { cwd: root });
  execSync('git config user.email "test@test.local" && git config user.name "test"', { cwd: root });
  for (const name of ["a.ts", "b.ts", "c.ts"]) {
    writeFileSync(join(root, "src", name), "export function f() { return 1 }\n");
  }
  execSync("git add -A && git commit -q -m base", { cwd: root });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("C1: linter/scanner findings are not duplicated per file", () => {
  it("includes each linter finding exactly once across multiple files", async () => {
    mockRunLinters.mockReturnValue([
      {
        severity: "medium",
        category: "smell",
        file: "src/a.ts",
        line: 1,
        comment: "LINTER-FINDING",
        source: "linter",
      },
    ]);
    mockRunThirdPartySecrets.mockReturnValue([
      {
        severity: "high",
        category: "security",
        file: "src/a.ts",
        line: 1,
        comment: "SCANNER-FINDING",
        source: "scanner",
      },
    ]);

    const engine = new Engine(
      loadConfig({
        overrides: {
          mode: "review",
          enable_cache: false,
          enable_auto_fix: false,
          linters: { enabled: true, tools: [], args: {} },
          enableSecretScanner: true,
        },
      }),
      {},
      root,
      fakeAI() as any,
    );

    const report = await engine.run();
    const linterCount = report.findings.filter((f) => f.comment === "LINTER-FINDING").length;
    const scannerCount = report.findings.filter((f) => f.comment === "SCANNER-FINDING").length;

    expect(linterCount).toBe(1);
    expect(scannerCount).toBe(1);
  });
});
