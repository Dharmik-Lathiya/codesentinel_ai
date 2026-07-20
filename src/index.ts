#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Engine } from "./engine/index.js";
import type { Mode, RuntimeSecrets } from "./config/types.js";
import { logger } from "./utils/logger.js";
import { collectFiles, readText } from "./utils/files.js";
import { installHook } from "./hook/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKFLOW_CONTENT = [
  "name: CodeSentinel AI",
  "",
  "on:",
  "  issue_comment:",
  "    types: [created]",
  "",
  "permissions:",
  "  contents: read",
  "  pull-requests: write",
  "",
  "jobs:",
  "  codesentinel:",
  "    if: >",
  "      github.event.issue.pull_request &&",
  "      (startsWith(github.event.comment.body, '/review') ||",
  "       startsWith(github.event.comment.body, '/fix') ||",
  "       startsWith(github.event.comment.body, '/audit') ||",
  "       startsWith(github.event.comment.body, '/score') ||",
  "       startsWith(github.event.comment.body, '/testgen'))",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - name: Extract command",
  "        id: cmd",
  "        uses: actions/github-script@v7",
  "        with:",
  "          script: |",
  "            const body = context.payload.comment.body.trim();",
  "            const match = body.match(/^\\/(review|fix|audit|score|testgen)\\b/i);",
  "            if (!match) { core.setFailed('No valid command'); return; }",
  "            core.setOutput('mode', match[1].toLowerCase());",
  "",
  "      - name: Get PR info",
  "        id: pr",
  "        uses: actions/github-script@v7",
  "        with:",
  "          script: |",
  "            const { data: pr } = await github.rest.pulls.get({",
  "              owner: context.repo.owner, repo: context.repo.repo,",
  "              pull_number: context.issue.number",
  "            });",
  "            core.setOutput('base_ref', pr.base.ref);",
  "            core.setOutput('head_sha', pr.head.sha);",
  "",
  "      - name: Checkout PR",
  "        uses: actions/checkout@v4",
  "        with:",
  "          ref: ${{ steps.pr.outputs.head_sha }}",
  "          fetch-depth: 0",
  "",
  "      - name: Checkout CodeSentinel",
  "        uses: actions/checkout@v4",
  "        with:",
  "          repository: Dharmik-Lathiya/CodeSentinel_AI",
  "          path: codesentinel",
  "          fetch-depth: 1",
  "",
  "      - name: Setup Node",
  "        uses: actions/setup-node@v4",
  "        with:",
  "          node-version: 20",
  "",
  "      - name: Build CodeSentinel",
  "        working-directory: codesentinel",
  "        run: npm install && npm run build",
  "",
  "      - name: Loading comment",
  "        id: loading",
  "        uses: actions/github-script@v7",
  "        with:",
  "          script: |",
  "            const { data: comment } = await github.rest.issues.createComment({",
  "              owner: context.repo.owner, repo: context.repo.repo,",
  "              issue_number: context.issue.number,",
  "              body: '🔄 **CodeSentinel** is reviewing... please wait.'",
  "            });",
  "            core.setOutput('comment_id', comment.id);",
  "",
  "      - name: Run CodeSentinel",
  "        env:",
  "          GITHUB_BASE_REF: ${{ steps.pr.outputs.base_ref }}",
  "        run: |",
  "          node codesentinel/dist/index.js ${{ steps.cmd.outputs.mode }} 2>&1 | tee /tmp/cs-out.txt || true",
  "",
  "      - name: Update comment",
  "        uses: actions/github-script@v7",
  "        with:",
  "          script: |",
  "            const fs = require('fs');",
  "            let out = ''; try { out = fs.readFileSync('/tmp/cs-out.txt','utf8'); } catch {}",
  "            const mode = '${{ steps.cmd.outputs.mode }}';",
  "            const body = '### CodeSentinel \\u2014 ' + mode + '\\n\\n```\\n' + out + '\\n```';",
  "            await github.rest.issues.updateComment({",
  "              owner: context.repo.owner, repo: context.repo.repo,",
  "              comment_id: ${{ steps.loading.outputs.comment_id }},",
  "              body: body",
  "            });",
].join("\n");

function runSetup(): void {
  const cwd = process.cwd();
  const workflowDir = join(cwd, ".github", "workflows");
  const workflowPath = join(workflowDir, "codesentinel.yml");

  if (existsSync(workflowPath)) {
    process.stdout.write(`Overwriting existing workflow...\n`);
  }

  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(workflowPath, WORKFLOW_CONTENT, "utf8");

  process.stdout.write(`\n✅ Created .github/workflows/codesentinel.yml\n\n`);
  process.stdout.write("Next steps:\n");
  process.stdout.write("  git add .github/workflows/codesentinel.yml\n");
  process.stdout.write('  git commit -m "Add CodeSentinel AI"\n');
  process.stdout.write("  git push\n\n");
  process.stdout.write("Then comment on any PR:\n");
  process.stdout.write("  /review    — AI code review\n");
  process.stdout.write("  /fix       — propose fixes\n");
  process.stdout.write("  /audit     — full repo audit\n");
  process.stdout.write("  /score     — quality score\n");
  process.stdout.write("  /testgen   — generate tests\n");
  process.stdout.write("  /gate      — quality gate check\n");
  process.stdout.write("  /deadcode  — detect unused exports\n");
}

function showHelp(): void {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8"),
  );
  process.stdout.write(`CodeSentinel AI v${pkg.version}
AI-powered code review, fix, audit, scoring, and test generation.

Usage:
  codesentinel [mode] [options]
  codesentinel setup

Commands:
  setup               Create GitHub Actions workflow in current project
  init-hook           Install pre-commit git hook
  dashboard           Start web dashboard
  dismiss <finding>   Dismiss a false positive finding

Modes:
  review      Analyze code for bugs, security, performance, smells (default)
  fix         Auto-fix issues with verification loop
  audit       Full repo security/performance/architecture audit
  score       Compute 0-100 quality score across 4 dimensions
  testgen     Generate unit tests for untested functions
  chat        Ask questions about the codebase (--ask required)
  gate        Run quality gate (exit non-zero on threshold breach)
  deadcode    Detect unused exports across files

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
  --min-score <n>             Minimum score to pass gate (0-100)
  --max-critical <n>          Max critical findings allowed in gate
  --max-high <n>              Max high findings allowed in gate
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
  codesentinel setup
  codesentinel review --config ./codesentinel.config.json
  codesentinel fix --auto-fix --dry-run
  codesentinel score --provider opencode
  codesentinel chat --ask "How does auth work?"
  codesentinel audit --context "Node.js REST API"
  codesentinel gate --min-score 70 --max-critical 0
  codesentinel init-hook
  codesentinel dashboard
  codesentinel deadcode
  codesentinel describe
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
  const args = process.argv.slice(2);

  // Handle top-level commands
  if (args[0] === "setup") {
    runSetup();
    return;
  }

  if (args[0] === "init-hook") {
    const root = process.cwd();
    const hookPath = installHook(root);
    process.stdout.write(`✅ Pre-commit hook installed at ${hookPath}\n`);
    return;
  }

  if (args[0] === "dashboard") {
    const secrets: RuntimeSecrets = {
      github_token: process.env.GITHUB_TOKEN,
      openai_api_key: process.env.OPENAI_API_KEY,
      anthropic_api_key: process.env.ANTHROPIC_API_KEY,
      gemini_api_key: process.env.GEMINI_API_KEY,
      opencode_api_key: process.env.OPENCODE_API_KEY,
      opencode_base_url: process.env.OPENCODE_BASE_URL,
    };
    const engine = Engine.fromInputs({ secrets });
    engine.getDashboard().start();
    process.stdout.write(`Dashboard running at http://localhost:${engine.config.dashboard.port}\n`);
    process.stdout.write("Press Ctrl+C to stop.\n");
    await new Promise(() => {});
    return;
  }

  if (args[0] === "dismiss") {
    const secrets: RuntimeSecrets = {
      github_token: process.env.GITHUB_TOKEN,
      openai_api_key: process.env.OPENAI_API_KEY,
      anthropic_api_key: process.env.ANTHROPIC_API_KEY,
      gemini_api_key: process.env.GEMINI_API_KEY,
      opencode_api_key: process.env.OPENCODE_API_KEY,
      opencode_base_url: process.env.OPENCODE_BASE_URL,
    };
    const engine = Engine.fromInputs({ secrets });
    const reason = args.slice(2).join(" ") || "dismissed by user";
    if (args[1] === "--rule" && args[2]) {
      engine.getDismissalManager().dismissByRule(args[2], reason);
      process.stdout.write(`✅ Dismissed rule: ${args[2]}\n`);
    } else {
      process.stdout.write("Usage: codesentinel dismiss --rule <ruleId> [reason]\n");
      process.stdout.write("       codesentinel dismiss --file <path> --line <n> [reason]\n");
    }
    return;
  }

  const { values, positionals } = parseArgs({
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
      "min-score": { type: "string" },
      "max-critical": { type: "string" },
      "max-high": { type: "string" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    args: process.argv.slice(2),
    allowPositionals: true,
  });

  // Use positional arg as mode if --mode not provided
  const modeArg = values.mode || positionals[0];

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
  if (modeArg) overrides.mode = modeArg as Mode;
  if (values["max-iterations"]) overrides.max_iterations = Number(values["max-iterations"]);
  if (values["auto-fix"]) overrides.enable_auto_fix = true;
  if (values.scoring !== undefined) overrides.enable_scoring = values.scoring;
  if (values["test-gen"]) overrides.enable_test_generation = true;
  if (values.context) overrides.project_context = values.context;

  if (values["min-score"]) {
    overrides.gate = { ...(overrides.gate as any || {}), minScore: Number(values["min-score"]) };
  }
  if (values["max-critical"]) {
    overrides.gate = { ...(overrides.gate as any || {}), maxCritical: Number(values["max-critical"]) };
  }
  if (values["max-high"]) {
    overrides.gate = { ...(overrides.gate as any || {}), maxHigh: Number(values["max-high"]) };
  }

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
      describe: providerModel,
    };
  }
  if (values["dry-run"]) overrides.enable_auto_fix = false;

  const engine = Engine.fromInputs({
    configPath: values.config,
    overrides: overrides as any,
    secrets,
  });

  if (values["ask"] && (modeArg === "chat" || !modeArg)) {
    const answer = await engine.ask(values["ask"]);
    process.stdout.write(answer + "\n");
    return;
  }

  // Special handling for deadcode mode — run in-process without AI
  if (modeArg === "deadcode") {
    const root = process.cwd();
    const rels = collectFiles(root, engine.config.include, engine.config.exclude);
    const files = rels.map((path) => ({
      path,
      content: readText(resolve(root, path)),
    }));
    const findings = await engine.runDeadCode(files);
    if (findings.length === 0) {
      process.stdout.write("✅ No unused exports detected.\n");
    } else {
      process.stdout.write(`\n=== CodeSentinel [deadcode] ===\n`);
      process.stdout.write(`Unused exports (${findings.length}):\n`);
      for (const f of findings) {
        process.stdout.write(`  [${f.severity}] ${f.file}:${f.line} — ${f.comment}\n`);
      }
    }
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

  // Exit non-zero if gate fails
  if (report.mode === "gate" && !report.summary.includes("PASSED")) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("Fatal:", err);
  process.exit(1);
});
