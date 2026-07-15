#!/usr/bin/env node
import { parseArgs } from "node:util";

import { Engine } from "./engine/index.js";
import type { Mode, RuntimeSecrets } from "./config/types.js";
import { logger } from "./utils/logger.js";

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
      "ask": { type: "string" },
      context: { type: "string" },
      "log-level": { type: "string" },
    },
    args: process.argv.slice(2),
  });

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
    overrides.default_model = { provider: values.provider as any, model: "default" };
  }

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
