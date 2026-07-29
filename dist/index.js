#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "./engine/index.js";
import { logger } from "./utils/logger.js";
import { collectFiles, readText } from "./utils/files.js";
import { installHook } from "./hook/index.js";
import { renderSarif } from "./utils/sarif.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_CONTENT = [
    "name: CodeSentinel AI",
    "",
    "on:",
    "  issues:",
    "    types: [opened]",
    "  issue_comment:",
    "    types: [created]",
    "",
    "permissions:",
    "  contents: read",
    "  pull-requests: write",
    "  issues: write",
    "",
    "jobs:",
    "  plan-on-issue:",
    "    if: github.event_name == 'issues' && github.event.action == 'opened'",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Checkout repository",
    "        uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 1",
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
    "      - name: Generate implementation plan",
    "        id: loading",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const { data: comment } = await github.rest.issues.createComment({",
    "              owner: context.repo.owner, repo: context.repo.repo,",
    "              issue_number: context.issue.number,",
    "              body: '🔄 **CodeSentinel** is analyzing this issue and generating an implementation plan...'",
    "            });",
    "            core.setOutput('comment_id', comment.id);",
    "",
    "      - name: Run CodeSentinel plan",
    "        env:",
    "          INPUT_MODE: plan",
    "          INPUT_ISSUE_TITLE: ${{ github.event.issue.title }}",
    "          INPUT_ISSUE_BODY: ${{ github.event.issue.body }}",
    "        run: |",
    "          node codesentinel/dist/index.js plan 2>&1 | tee /tmp/cs-out.txt || true",
    "",
    "      - name: Update comment with plan",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const fs = require('fs');",
    "            let out = ''; try { out = fs.readFileSync('/tmp/cs-out.txt','utf8'); } catch {}",
    "            const body = '### CodeSentinel \\u2014 Implementation Plan\\n\\n```\\n' + out + '\\n```\\n\\nReply with `/fix` to start implementation.';",
    "            await github.rest.issues.updateComment({",
    "              owner: context.repo.owner, repo: context.repo.repo,",
    "              comment_id: ${{ steps.loading.outputs.comment_id }},",
    "              body: body",
    "            });",
    "",
    "  slash-command:",
    "    if: github.event_name == 'issue_comment' && github.event.action == 'created'",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Is PR comment?",
    "        id: is_pr",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            core.setOutput('value', String(!!context.payload.issue?.pull_request));",
    "",
    "      - name: Extract command",
    "        id: cmd",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const body = context.payload.comment.body.trim();",
    "            const match = body.match(/^\\/(review|fix|audit|score|testgen|gate|deadcode|describe|plan|ask)\\b/i);",
    "            if (!match) { core.setFailed('No valid command'); return; }",
    "            const mode = match[1].toLowerCase();",
    "            const question = mode === 'ask' ? body.replace(/^\\/ask\\s*/i, '').trim() : '';",
    "            core.setOutput('mode', mode);",
    "            core.setOutput('question', question);",
    "",
    "      - name: Get PR info (PR comments only)",
    "        id: pr",
    "        if: steps.is_pr.outputs.value === 'true'",
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
    "      - name: Checkout PR (PR comments only)",
    "        if: steps.is_pr.outputs.value === 'true'",
    "        uses: actions/checkout@v4",
    "        with:",
    "          ref: ${{ steps.pr.outputs.head_sha }}",
    "          fetch-depth: 0",
    "",
    "      - name: Checkout default branch (issue comments)",
    "        if: steps.is_pr.outputs.value != 'true'",
    "        uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 1",
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
    "              body: '🔄 **CodeSentinel** is processing... please wait.'",
    "            });",
    "            core.setOutput('comment_id', comment.id);",
    "",
    "      - name: Get issue info (for plan/fix commands)",
    "        id: issue_info",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const { data: issue } = await github.rest.issues.get({",
    "              owner: context.repo.owner, repo: context.repo.repo,",
    "              issue_number: context.issue.number",
    "            });",
    "            core.setOutput('title', issue.title);",
    "            core.setOutput('body', (issue.body || '').slice(0, 8000));",
    "",
    "      - name: Run CodeSentinel",
    "        env:",
    "          GITHUB_BASE_REF: ${{ steps.pr.outputs.base_ref }}",
    "          INPUT_ISSUE_TITLE: ${{ steps.issue_info.outputs.title }}",
    "          INPUT_ISSUE_BODY: ${{ steps.issue_info.outputs.body }}",
    "        run: |",
    "          ASK_QUESTION='${{ steps.cmd.outputs.question }}'",
    "          MODE='${{ steps.cmd.outputs.mode }}'",
    "          if [ -n \"$ASK_QUESTION\" ]; then",
    "            node codesentinel/dist/index.js \"$MODE\" --ask \"$ASK_QUESTION\" 2>&1 | tee /tmp/cs-out.txt || true",
    "          else",
    "            node codesentinel/dist/index.js \"$MODE\" 2>&1 | tee /tmp/cs-out.txt || true",
    "          fi",
    "",
    "      - name: Update comment",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const fs = require('fs');",
    "            let out = ''; try { out = fs.readFileSync('/tmp/cs-out.txt','utf8'); } catch {}",
    "            const mode = '${{ steps.cmd.outputs.mode }}';",
    "            const planSuffix = mode === 'plan' ? '\\n\\nReply with `/fix` to start implementation.' : '';",
    "            const body = '### CodeSentinel \\u2014 ' + mode + '\\n\\n```\\n' + out + '\\n```' + planSuffix;",
    "            await github.rest.issues.updateComment({",
    "              owner: context.repo.owner, repo: context.repo.repo,",
    "              comment_id: ${{ steps.loading.outputs.comment_id }},",
    "              body: body",
    "            });",
].join("\n");
const BUILD_WORKFLOW_CONTENT = [
    "name: CodeSentinel Build Fix",
    "",
    "on:",
    "  push:",
    "    branches: [main, master, develop]",
    "  workflow_dispatch:",
    "",
    "permissions:",
    "  contents: write",
    "  pull-requests: write",
    "",
    "jobs:",
    "  build-fix:",
    "    if: ${{ github.actor != 'CodeSentinel Bot' && !contains(github.event.head_commit.message, '[skip ci]') }}",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
    "          token: ${{ secrets.GITHUB_TOKEN }}",
    "",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 20",
    "",
    "      - name: Install dependencies",
    "        run: npm ci 2>/dev/null || npm install",
    "",
    "      - name: Build and auto-fix loop",
    "        env:",
    '          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}',
    '          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}',
    '          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}',
    '          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}',
    '          OPENCODE_BASE_URL: ${{ secrets.OPENCODE_BASE_URL }}',
    '          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
    "        run: |",
    "          MAX_ITER=${MAX_ITERATIONS:-5}",
    '          echo "::group::Build-Fix Loop"',
    "          for i in $(seq 1 $MAX_ITER); do",
    '            echo "=== Iteration $i/$MAX_ITER ==="',
    "",
    "            FAILED=0",
    "            npm run build 2>&1 || FAILED=1",
    "            npm run typecheck 2>&1 || FAILED=1",
    "",
    "            if [ $FAILED -eq 0 ]; then",
    '              echo "✅ Build succeeded on iteration $i"',
    "              echo \"::endgroup::\"",
    "              exit 0",
    "            fi",
    "",
    '            echo "❌ Build failed. Running auto-fix..."',
    "",
    "            if [ ! -d \"codesentinel\" ]; then",
    '              echo "Cloning CodeSentinel..."',
    "              git clone --depth 1 https://github.com/Dharmik-Lathiya/CodeSentinel_AI.git codesentinel",
    '              cd codesentinel && npm install --ignore-scripts 2>&1 && npm run build 2>&1 && cd ..',
    "            fi",
    "",
    '            node codesentinel/dist/index.js fix --auto-fix 2>&1 || echo "Fix step completed with warnings"',
    "",
    "            git add -A",
    "            if git diff --cached --quiet; then",
    '              echo "⚠️ No changes produced by fix — continuing"',
    "              continue",
    "            fi",
    "",
    '            git config user.email "bot@codesentinel.ai"',
    '            git config user.name "CodeSentinel Bot"',
    '            git commit -m "CodeSentinel: auto-fix build errors [skip ci]"',
    "            git pull --rebase origin ${{ github.ref_name }} 2>&1 || true",
    "            git push origin HEAD:${{ github.ref_name }} 2>&1",
    '            echo "✅ Fix pushed to ${{ github.ref_name }}"',
    "          done",
    "",
    '          echo "❌ Build failed after $MAX_ITER iterations"',
    "          echo \"::endgroup::\"",
    "          exit 1",
    "",
    "      - name: Notify failure",
    "        if: failure()",
    "        uses: actions/github-script@v7",
    "        with:",
    "          script: |",
    "            const { data: prs } = await github.rest.pulls.list({",
    "              owner: context.repo.owner,",
    "              repo: context.repo.repo,",
    '              state: "open",',
    "              head: context.ref.replace('refs/heads/', ''),",
    "            });",
    "            if (prs.length > 0) {",
    '              await github.rest.issues.createComment({',
    "                owner: context.repo.owner,",
    "                repo: context.repo.repo,",
    "                issue_number: prs[0].number,",
    '                body: "❌ **CodeSentinel Build Fix** failed after auto-fix attempts.\\n\\nThe build could not be fixed automatically. Please check the [workflow run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }})."',
    "              });",
    "            }",
].join("\n");
function runSetup() {
    const cwd = process.cwd();
    const workflowDir = join(cwd, ".github", "workflows");
    const workflowPath = join(workflowDir, "codesentinel.yml");
    const buildWorkflowPath = join(workflowDir, "codesentinel-build.yml");
    if (existsSync(workflowPath)) {
        process.stdout.write(`Overwriting existing workflow...\n`);
    }
    mkdirSync(workflowDir, { recursive: true });
    writeFileSync(workflowPath, WORKFLOW_CONTENT, "utf8");
    process.stdout.write(`\n✅ Created .github/workflows/codesentinel.yml\n`);
    if (existsSync(buildWorkflowPath)) {
        process.stdout.write(`Overwriting existing build-fix workflow...\n`);
    }
    writeFileSync(buildWorkflowPath, BUILD_WORKFLOW_CONTENT, "utf8");
    process.stdout.write(`✅ Created .github/workflows/codesentinel-build.yml\n\n`);
    process.stdout.write("Next steps:\n");
    process.stdout.write("  git add .github/workflows/\n");
    process.stdout.write('  git commit -m "Add CodeSentinel AI workflows"\n');
    process.stdout.write("  git push\n\n");
    process.stdout.write("Slash commands (on PR/issue comments):\n");
    process.stdout.write("  /review    — AI code review\n");
    process.stdout.write("  /fix       — propose fixes\n");
    process.stdout.write("  /audit     — full repo audit\n");
    process.stdout.write("  /score     — quality score\n");
    process.stdout.write("  /testgen   — generate tests\n");
    process.stdout.write("  /gate      — quality gate check\n");
    process.stdout.write("  /deadcode  — detect unused exports\n");
    process.stdout.write("  /describe  — generate PR description\n");
    process.stdout.write("  /plan      — generate implementation plan from issue\n");
    process.stdout.write("  /ask       — ask a question\n\n");
    process.stdout.write("Auto-analyze: When a new issue is opened, CodeSentinel automatically\n");
    process.stdout.write("  generates an implementation plan and asks clarifying questions.\n");
    process.stdout.write("  Reply with /fix to start implementation.\n\n");
    process.stdout.write("Build-Fix (auto-fixes on push):\n");
    process.stdout.write("  The build-fix workflow triggers on push to main/master/develop.\n");
    process.stdout.write("  If the build fails, CodeSentinel auto-fixes and pushes the fix.\n");
    process.stdout.write("  Set these secrets in your repo for AI provider access:\n");
    process.stdout.write("    OPENAI_APIKEY / ANTHROPIC_API_KEY / GEMINI_API_KEY\n");
    process.stdout.write("    OPENCODE_API_KEY / OPENCODE_BASE_URL\n");
}
function showHelp() {
    let pkg;
    try {
        pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    }
    catch {
        pkg = { version: "unknown" };
    }
    process.stdout.write(`CodeSentinel AI v${pkg.version}
AI-powered code review, fix, audit, scoring, and test generation.

Usage:
  codesentinel [mode] [options]
  codesentinel setup

Commands:
  setup               Create GitHub Actions workflow in current project
  init-hook           Install git hook (add --type post-commit for build-fix loop)
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
  --jsonl                     Output AI review results in JSONL format
  --mcp                       Enable MCP server integration for library docs
  --learning-db <path>        Enable self-learning store at path
  --yaml-config               Enable YAML config file discovery (.opencode-reviewer.yml)
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
  codesentinel init-hook --type post-commit
  codesentinel dashboard
  codesentinel deadcode
  codesentinel describe
`);
}
function showVersion() {
    let pkg;
    try {
        pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
    }
    catch {
        pkg = { version: "unknown" };
    }
    process.stdout.write(`${pkg.version}\n`);
}
/**
 * Command-line interface. Usage:
 *   codesentinel --mode review --config ./codesentinel.config.json
 *   codesentinel score --provider opencode
 *   codesentinel chat --ask "How does auth work?"
 */
async function main() {
    const args = process.argv.slice(2);
    // Handle top-level commands
    if (args[0] === "setup") {
        runSetup();
        return;
    }
    if (args[0] === "init-hook") {
        const root = process.cwd();
        const typeIdx = args.indexOf("--type");
        const hookType = typeIdx >= 0 && args[typeIdx + 1] === "post-commit" ? "post-commit" : "pre-commit";
        const hookPath = installHook(root, hookType);
        process.stdout.write(`✅ ${hookType} hook installed at ${hookPath}\n`);
        if (hookType === "post-commit") {
            process.stdout.write("This hook will run build + typecheck after every commit and auto-fix failures.\n");
        }
        return;
    }
    if (args[0] === "dashboard") {
        const secrets = {
            github_token: process.env.GITHUB_TOKEN,
            openai_api_key: process.env.OPENAI_API_KEY,
            anthropic_api_key: process.env.ANTHROPIC_API_KEY,
            gemini_api_key: process.env.GEMINI_API_KEY,
            opencode_api_key: process.env.OPENCODE_API_KEY,
            opencode_base_url: process.env.OPENCODE_BASE_URL,
        };
        const engine = Engine.fromInputs({ secrets });
        const dash = engine.getDashboard();
        if (dash) {
            dash.start();
            process.stdout.write(`Dashboard running at http://localhost:${engine.config.dashboard.port}\n`);
        }
        else {
            process.stdout.write("Dashboard is not available.\n");
        }
        process.stdout.write("Press Ctrl+C to stop.\n");
        await new Promise(() => { });
        return;
    }
    if (args[0] === "dismiss") {
        const secrets = {
            github_token: process.env.GITHUB_TOKEN,
            openai_api_key: process.env.OPENAI_API_KEY,
            anthropic_api_key: process.env.ANTHROPIC_API_KEY,
            gemini_api_key: process.env.GEMINI_API_KEY,
            opencode_api_key: process.env.OPENCODE_API_KEY,
            opencode_base_url: process.env.OPENCODE_BASE_URL,
        };
        const engine = Engine.fromInputs({ secrets });
        const dismissArgs = args.slice(1);
        const reasonIdx = dismissArgs.findIndex((a) => !a.startsWith("--"));
        const reason = reasonIdx >= 0 ? dismissArgs.slice(reasonIdx).join(" ") : "dismissed by user";
        if (dismissArgs.includes("--rule")) {
            const ruleIdx = dismissArgs.indexOf("--rule");
            const ruleId = dismissArgs[ruleIdx + 1];
            if (!ruleId) {
                process.stdout.write("Usage: codesentinel dismiss --rule <ruleId> [reason]\n");
                return;
            }
            await engine.dismissByRule(ruleId, reason);
            process.stdout.write(`✅ Dismissed rule: ${ruleId}\n`);
        }
        else if (dismissArgs.includes("--file")) {
            const fileIdx = dismissArgs.indexOf("--file");
            const filePath = dismissArgs[fileIdx + 1];
            const lineIdx = dismissArgs.indexOf("--line");
            const lineNum = lineIdx >= 0 ? Number(dismissArgs[lineIdx + 1]) : null;
            if (!filePath) {
                process.stdout.write("Usage: codesentinel dismiss --file <path> --line <n> [reason]\n");
                return;
            }
            const ruleIdArg = dismissArgs.includes("--rule-id") ? dismissArgs[dismissArgs.indexOf("--rule-id") + 1] : `${filePath}:${lineNum ?? "all"}`;
            await engine.dismissByFinding(filePath, lineNum, ruleIdArg, reason);
            process.stdout.write(`✅ Dismissed finding: ${filePath}${lineNum ? `:${lineNum}` : ""}\n`);
        }
        else {
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
            json: { type: "boolean", default: false },
            sarif: { type: "boolean", default: false },
            "min-score": { type: "string" },
            "max-critical": { type: "string" },
            "max-high": { type: "string" },
            help: { type: "boolean", default: false },
            version: { type: "boolean", default: false },
            "jsonl": { type: "boolean", default: false },
            "mcp": { type: "boolean", default: false },
            "learning-db": { type: "string" },
            "yaml-config": { type: "boolean", default: false },
            "improve-type": { type: "string" },
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
        logger.level = values["log-level"];
    }
    if (values.json) {
        logger.setJsonMode(true);
    }
    const secrets = {
        github_token: process.env.GITHUB_TOKEN,
        openai_api_key: process.env.OPENAI_API_KEY,
        anthropic_api_key: process.env.ANTHROPIC_API_KEY,
        gemini_api_key: process.env.GEMINI_API_KEY,
        opencode_api_key: process.env.OPENCODE_API_KEY,
        opencode_base_url: process.env.OPENCODE_BASE_URL,
    };
    const overrides = {};
    if (modeArg)
        overrides.mode = modeArg;
    if (values["max-iterations"])
        overrides.max_iterations = Number(values["max-iterations"]);
    if (values["auto-fix"])
        overrides.enable_auto_fix = true;
    if (values.scoring !== undefined)
        overrides.enable_scoring = values.scoring;
    if (values["test-gen"])
        overrides.enable_test_generation = true;
    if (values.context)
        overrides.project_context = values.context;
    if (values["improve-type"])
        overrides.improve_type = values["improve-type"];
    // Issue plan mode — read from env (set by GitHub Actions workflow)
    const issueTitle = process.env.INPUT_ISSUE_TITLE;
    const issueBody = process.env.INPUT_ISSUE_BODY;
    if (issueTitle)
        overrides.issue_title = issueTitle;
    if (issueBody)
        overrides.issue_body = issueBody;
    if (values["min-score"]) {
        overrides.gate = { ...(overrides.gate || {}), minScore: Number(values["min-score"]) };
    }
    if (values["max-critical"]) {
        overrides.gate = { ...(overrides.gate || {}), maxCritical: Number(values["max-critical"]) };
    }
    if (values["max-high"]) {
        overrides.gate = { ...(overrides.gate || {}), maxHigh: Number(values["max-high"]) };
    }
    if (values.provider) {
        const providerModel = { provider: values.provider, model: "default" };
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
    if (values["dry-run"])
        overrides.enable_auto_fix = false;
    if (values.jsonl)
        overrides.jsonl_output = true;
    if (values.mcp)
        overrides.mcp = { ...(overrides.mcp || {}), enabled: true };
    if (values["learning-db"]) {
        overrides.learning = { ...(overrides.learning || {}), enabled: true, dbPath: values["learning-db"] };
    }
    if (values["yaml-config"]) {
        const searchPaths = [".opencode-reviewer.yml", ".codesentinel.yml", "codesentinel.config.yml"];
        for (const p of searchPaths) {
            if (existsSync(resolve(process.cwd(), p))) {
                overrides.configFile = p;
                break;
            }
        }
    }
    const engine = Engine.fromInputs({
        configPath: values.config,
        overrides: overrides,
        secrets,
    });
    const runMode = modeArg ?? engine.config.mode;
    process.stdout.write(`[codesentinel:info] Starting mode: ${runMode}\n`);
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
        }
        else {
            process.stdout.write(`\n=== CodeSentinel [deadcode] ===\n`);
            process.stdout.write(`Unused exports (${findings.length}):\n`);
            for (const f of findings) {
                process.stdout.write(`  [${f.severity}] ${f.file}:${f.line} — ${f.comment}\n`);
            }
        }
        return;
    }
    const report = await engine.run();
    // JSON output mode
    if (values.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        if (report.mode === "gate" && report.gatePassed === false) {
            throw new Error("Gate check failed");
        }
        return;
    }
    // SARIF output mode
    if (values.sarif) {
        process.stdout.write(renderSarif(report) + "\n");
        if (report.mode === "gate" && report.gatePassed === false) {
            process.exit(1);
        }
        return;
    }
    // Human-readable console output.
    process.stdout.write(`\n=== CodeSentinel [${report.mode}] ===\n`);
    if (values["dry-run"] && report.mode === "fix") {
        process.stdout.write("[DRY RUN] No files were modified.\n");
    }
    process.stdout.write(report.summary + "\n");
    if (report.score) {
        process.stdout.write(`Score: ${report.score.overall}/100 ` +
            `(readability ${report.score.readability}, ` +
            `maintainability ${report.score.maintainability}, ` +
            `security ${report.score.security}, ` +
            `coverage ${report.score.test_coverage})\n`);
    }
    if (report.findings.length && (report.mode !== "review" && report.mode !== "fix")) {
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
    // Exit non-zero if gate fails
    if (report.mode === "gate" && report.gatePassed === false) {
        process.exit(1);
    }
}
main().catch((err) => {
    logger.error("Fatal:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map