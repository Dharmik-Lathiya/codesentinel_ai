#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Engine } from "./engine/index.js";
import type { Mode, RuntimeSecrets } from "./config/types.js";
import { logger } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function showHelp(): void {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  );
  process.stdout.write(`CodeSentinel AI v${pkg.version}
AI-powered code review, fix, audit, scoring, and test generation.

Usage:
  codesentinel [mode] [options]

Modes:
  review      Analyze code for bugs, security, performance, smells (default)
  fix         Auto-fix issues with verification loop
  audit       Full repo security/performance/architecture audit
  score       Compute 0-100 quality score across 4 dimensions
  testgen     Generate unit tests for untested functions
  chat        Ask questions about the codebase (--ask required)

Options:
  -m, --mode <mode>           Operational mode
  -c, --config <path>         Path to codesentinel.config.json
  --provider <name>           AI provider (openai | anthropic | gemini | opencode)
                              Overrides all task models at once
  --max-iterations <n>        Max fix iterations (default: 5)
  --auto-fix                  Apply fixes automatically
  --scoring / --no-scoring    Enable/disable scoring (default: enabled)
  --test-gen                  Enable test generation
  --ask <question>            Ask a question (activates chat mode)
  --context <text>            Free-form project context for prompts
  --dry-run                   Show what would be fixed without writing (fix mode)
  --log-level <level>         Log level: debug | info | warn | error
  --version                   Show version number
  --help                      Show this help message

Environment Variables:
  GITHUB_TOKEN                GitHub token for PR comments / issues
  OPENAI_API_KEY              OpenAI API key
  ANTHROPIC_API_KEY           Anthropic API key
  GEMINI_API_KEY              Google Gemini API key
  OPENCODE_API_KEY            OpenCode API key
  OPENCODE_BASE_URL           Custom OpenCode endpoint URL
  CODESENTINEL_LOG_LEVEL      Default log level

Examples:
  codesentinel review --config ./codesentinel.config.json
  codesentinel fix --auto-fix --dry-run
  codesentinel score --provider openai
  codesentinel chat --ask "How does auth work?"
  codesentinel audit --context "Node.js REST API"
`);
}

function showVersion(): void {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  );
  process.stdout.write(`${pkg.version}\n`);
}

/**
 * Command-line interface. Usage:
 *   codesentinel --mode review --config ./codesentinel.config.json
 *   codesentinel score --provider opencode
 *   codesentinel chat --ask "How does auth work?"
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", short: "m" },
      config: { type: "string", short: "c" },
      "max-iterations": { type: "string" },
      "auto-fix": { type: "boolean", default: false },
      scoring: { type: "boolean", default: true },
      "test-gen": { type: "boolean", default: false },
      provider: { type: "string" },
      ask: { type: "string" },
      context: { type: "string" },
      "log-level": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    args: process.argv.slice(2),
  });

  if (values.help) {
    showHelp();
    return;
  }
  if (values.version) {
    showVersion();
    return;
  }

  if (values["log-level"]) {
    logger.level = values["log-level"] as any;
  }

  const secrets: RuntimeSecrets = {
    github_token: process.env.GITHUB_TOKEN,
    openai_api_key: process.env.OPENAI_API_KEY,
    anthropic_api_key: process.env.ANTHROPIC_API_KEY,
    gemini_api_key: process.env.GEMINI_API_KEY,
    opencode_api_key: process.env.OPENCODE_API_KEY,
    opencode_base_url: process.env.OPENCODE_BASE_URL,
  };

  const overrides: Record<string, unknown> = {};
  if (values.mode) overrides.mode = values.mode as Mode;
  if (values["max-iterations"]) overrides.max_iterations = Number(values["max-iterations"]);
  if (values["auto-fix"]) overrides.enable_auto_fix = true;
  if (values.scoring !== undefined) overrides.enable_scoring = values.scoring;
  if (values["test-gen"]) overrides.enable_test_generation = true;
  if (values.context) overrides.project_context = values.context;
  if (values.provider) {
    const providerModel = { provider: values.provider as any, model: "default" };
    overrides.default_model = providerModel;
    overrides.models = {
      review: providerModel,
      fix: providerModel,
      audit: providerModel,
      score: providerModel,
      testgen: providerModel,
      chat: providerModel,
    };
  }
  if (values["dry-run"]) overrides.enable_auto_fix = false;

  const engine = Engine.fromInputs({
    configPath: values.config,
    overrides: overrides as any,
    secrets,
  });

  if (values["ask"] && (values.mode === "chat" || !values.mode)) {
    const answer = await engine.ask(values["ask"]);
    process.stdout.write(answer + "\n");
    return;
  }

  const report = await engine.run();

  // Human-readable console output.
  process.stdout.write(`\n=== CodeSentinel [${report.mode}] ===\n`);
  if (values["dry-run"] && report.mode === "fix") {
    process.stdout.write("[DRY RUN] No files were modified.\n");
  }
  process.stdout.write(report.summary + "\n");
  if (report.score) {
    process.stdout.write(
      `Score: ${report.score.overall}/100 ` +
        `(readability ${report.score.readability}, ` +
        `maintainability ${report.score.maintainability}, ` +
        `security ${report.score.security}, ` +
        `coverage ${report.score.test_coverage})\n`,
    );
  }
  if (report.findings.length) {
    process.stdout.write(`\nFindings (${report.findings.length}):\n`);
    for (const f of report.findings) {
      process.stdout.write(`  [${f.severity}] ${f.file}${f.line ? ":" + f.line : ""} — ${f.comment}\n`);
    }
  }
  if (report.fixAttempts.length) {
    process.stdout.write(`\nFix attempts (${report.fixAttempts.length}):\n`);
    for (const a of report.fixAttempts) {
      const status = a.fixed ? (a.verified ? "verified" : "applied") : "skipped";
      process.stdout.write(`  #${a.iteration} ${a.file} — ${status}: ${a.explanation}\n`);
    }
  }
  if (report.generatedTests.length) {
    process.stdout.write(`\nGenerated tests:\n`);
    for (const t of report.generatedTests) {
      process.stdout.write(`  + ${t.testFilePath}\n`);
    }
  }
  process.stdout.write(`\nDone in ${report.metrics.durationMs}ms.\n`);
}

main().catch((err) => {
  logger.error("Fatal:", err);
  process.exit(1);
});
