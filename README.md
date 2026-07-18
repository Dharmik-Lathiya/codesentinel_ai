# CodeSentinel AI

AI-powered code quality orchestrator. It reviews pull requests, proposes/auto-applies
fixes, audits entire repositories, scores code quality (0–100), generates missing unit
tests, and answers contextual questions — all through a single, configurable engine.

Built with clean, modular TypeScript. Supports multiple AI providers and is designed to
run as a CLI, a reusable **GitHub Action**, or a **Probot GitHub App**.

---

## ✨ Features

| Mode       | What it does |
|------------|--------------|
| `review`   | Analyze a PR diff, detect bugs/smells/bad practices, add inline comments, summarize. |
| `fix`      | Attempt automatic fixes in a loop, run lint/tests after each iteration. |
| `audit`    | Scan the whole repo for security / performance / architecture issues; optionally open issues. |
| `score`    | Output a 0–100 quality score with a breakdown (readability, maintainability, security, coverage). |
| `testgen`  | Detect functions without tests and generate Jest/Vitest unit tests. |
| `chat`     | Answer `/ask <question>` using the codebase as context. |

### AI providers
OpenAI, Anthropic, Gemini, and OpenCode — each capability (`review`, `fix`, `audit`,
`score`, `testgen`, `chat`) can use a different model via config.

### Bonus
- 🗄️ On-disk response **caching** for repeated analyses.
- 🔌 **Plugin system** for custom findings / scoring hooks.
- 🖥️ **CLI** interface for local use.

---

## 📦 Installation

```bash
npm install
npm run build
```

Optional provider SDKs are installed automatically, but you only need the one(s) you use.

---

## 📚 Use as a Library

Install in your project:
```bash
npm install codesentinel-ai
```

### Quick start
```ts
import { Engine } from "codesentinel-ai";

const engine = Engine.fromInputs({
  configPath: "./codesentinel.config.json",
  secrets: {
    opencode_api_key: process.env.OPENCODE_API_KEY,
    opencode_base_url: process.env.OPENCODE_BASE_URL, // optional
  },
  root: "/path/to/your/project",
});

// Run any mode
const report = await engine.run();
console.log(report.score?.overall); // 0-100
console.log(report.findings);       // Finding[]
```

### Chat mode
```ts
const answer = await engine.ask("How does authentication work?");
console.log(answer);
```

### Switch provider in code
```ts
import { Engine, mergeConfig, DEFAULT_CONFIG } from "codesentinel-ai";

const config = mergeConfig(DEFAULT_CONFIG, {
  default_model: { provider: "openai", model: "gpt-4o" },
  models: {
    review: { provider: "anthropic", model: "claude-3-5-sonnet" },
  },
});

const engine = new Engine(config, { openai_api_key: "..." });
const report = await engine.run();
```

### Custom plugin
```ts
import type { CodeSentinelPlugin, Finding } from "codesentinel-ai";

const myPlugin: CodeSentinelPlugin = {
  name: "no-console-log",
  analyze(files) {
    const findings: Finding[] = [];
    for (const f of files) {
      if (f.content.includes("console.log")) {
        findings.push({
          severity: "low",
          category: "smell",
          file: f.path,
          line: null,
          comment: "Avoid console.log in production",
          source: "static",
        });
      }
    }
    return findings;
  },
};
```

### Available exports
```ts
// Core
import { Engine } from "codesentinel-ai";
import { loadConfig, configFromInputs, DEFAULT_CONFIG, mergeConfig } from "codesentinel-ai";

// AI
import { AIHub, extractJson } from "codesentinel-ai";

// Types
import type {
  CodeSentinelConfig, EngineReport, Finding, ScoreBreakdown,
  ModelConfig, Provider, Mode, RuntimeSecrets, CodeSentinelPlugin,
} from "codesentinel-ai";
```

---

## ⚙️ Configuration

Create `codesentinel.config.json` (see [`config/codesentinel.config.json`](config/codesentinel.config.json)):

```jsonc
{
  "mode": "review",
  "max_iterations": 5,
  "enable_auto_fix": false,
  "enable_scoring": true,
  "enable_test_generation": false,
  "include_positive_feedback": true,
  "project_context": "TypeScript monorepo. Keep functions pure.",
  "default_model": { "provider": "opencode", "model": "opencode/default" },
  "models": {
    "review": { "provider": "opencode", "model": "opencode/default" },
    "fix":    { "provider": "opencode", "model": "opencode/default" }
  },
  "test_runner": "vitest",
  "include": ["**/*.{ts,tsx,js,jsx}"],
  "exclude": ["node_modules/**", "dist/**", "**/*.test.*"],
  "output": { "postGithubComments": true, "createGithubIssues": false, "writeReportFile": true, "reportDir": "codesentinel-reports" },
  "enable_cache": true,
  "cache_dir": ".codesentinel-cache",
  "plugins": []
}
```

Config is resolved by layering: **defaults → config file → overrides** (CLI flags / Action inputs).

### Switching providers

OpenCode is the **default provider** for all tasks. To switch:

**CLI** — use `--provider` to override all tasks at once:
```bash
codesentinel review --provider openai
codesentinel fix --provider anthropic
```

**Config file** — set `default_model` or override per-task:
```jsonc
{
  "default_model": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
  "models": {
    "review": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
    "fix":    { "provider": "openai", "model": "gpt-4o" }
  }
}
```

**Environment variables**:
```bash
export OPENCODE_API_KEY=...    # for opencode (default)
export OPENAI_API_KEY=...      # for openai
export ANTHROPIC_API_KEY=...   # for anthropic
export GEMINI_API_KEY=...      # for gemini
```

---

## 🖥️ CLI usage

```bash
# Review using default opencode provider
node dist/index.js --mode review --config ./codesentinel.config.json

# Score the whole repo using OpenAI
node dist/index.js --mode score --provider openai

# Switch all tasks to Anthropic
node dist/index.js fix --auto-fix --provider anthropic

# Ask a question (chat mode)
node dist/index.js chat --ask "How does authentication work?" --context "Node service"

# Generate tests
node dist/index.js --mode testgen --test-gen
```

Environment variables (API keys): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`, `OPENCODE_API_KEY`, `OPENCODE_BASE_URL`, `GITHUB_TOKEN`.

---

## 🤖 GitHub Action

### Option 1: Use in other projects via PR comments

Other projects can use CodeSentinel by commenting slash commands on PRs:

```
/review   → AI code review + report posted as PR comment
/fix      → propose fixes + post report as PR comment
/audit    → full repo audit
/score    → quality score (0-100)
/testgen  → generate missing tests
```

**Setup for other projects — copy this workflow to `.github/workflows/codesentinel.yml`:**

```yaml
name: CodeSentinel PR Command

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    if: |
      github.event.issue.pull_request &&
      startsWith(github.event.comment.body, '/review') ||
      startsWith(github.event.comment.body, '/fix') ||
      startsWith(github.event.comment.body, '/audit') ||
      startsWith(github.event.comment.body, '/score') ||
      startsWith(github.event.comment.body, '/testgen')
    runs-on: self-hosted
    steps:
      - name: Extract command
        id: cmd
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.comment.body.trim();
            const match = body.match(/^\/(review|fix|audit|score|testgen)\b/i);
            if (!match) {
              core.setFailed('No valid command found');
              return;
            }
            core.setOutput('mode', match[1].toLowerCase());

      - name: Checkout PR
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.issue.pull_request.head.ref }}
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install CodeSentinel
        run: npm install -g @dharmiklathiya/codesentinel_ai

      - name: Run CodeSentinel
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          npx codesentinel ${{ steps.cmd.outputs.mode }} \
            --provider opencode \
            2>&1 | tee /tmp/codesentinel-output.txt || true

      - name: Post review comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let output = '';
            try {
              output = fs.readFileSync('/tmp/codesentinel-output.txt', 'utf8');
            } catch {
              output = 'CodeSentinel ran but produced no output.';
            }
            const mode = '${{ steps.cmd.outputs.mode }}';
            const body = `### CodeSentinel — ${mode}\n\n\`\`\`\n${output}\n\`\`\``;
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body,
            });

      - name: Cleanup
        if: always()
        run: rm -f /tmp/codesentinel-output.txt
```

**Required repository secrets:**
- None required for OpenCode (default) — it runs locally on your machine
- If using OpenAI/Anthropic/Gemini: set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`

**Then comment on any PR:**
```
/review   → runs code review, posts report
/fix      → proposes fixes, posts report
/audit    → full repo audit
/score    → quality score
/testgen  → generates missing tests
```

### Option 2: Use as a reusable Action

See [`action.yml`](action.yml) and the example workflow in
[`.github/workflows/codesentinel.yml`](.github/workflows/codesentinel.yml).

```yaml
- uses: your-org/codesentinel-ai@v1
  with:
    mode: review
    enable_scoring: "true"
    opencode_api_key: ${{ secrets.OPENCODE_API_KEY }}
```

The Action posts PR comments, writes a job summary, and outputs metrics
(`score`, `findings`).

---

## 🔌 GitHub App (Probot)

Run the bundled Probot app (`src/github/app.ts`) and comment slash commands on a PR:

```
/review
/fix
/audit
/score
/testgen
/ask How is rate limiting implemented?
```

The app runs the engine for the requested mode and posts the result back as a comment.

---

## 🧪 Testing

```bash
npm test          # run vitest suite (scorer, analyzer, engine flow)
npm run typecheck # type-check the whole project
npm run build     # compile to dist/
```

---

## 🔌 Plugins

A plugin is a module that default-exports a `CodeSentinelPlugin`:

```ts
import type { CodeSentinelPlugin } from "codesentinel-ai";

const plugin: CodeSentinelPlugin = {
  name: "no-fetch",
  analyze(files) {
    // return extra Finding[] based on files
    return [];
  },
  score(breakdown, files) {
    // adjust the ScoreBreakdown and return it
    return breakdown;
  },
};

export default plugin;
```

List plugin module paths in `config.plugins` to activate them.

---

## 🗂️ Project structure

```
src/
  config/      configuration types, defaults, loader (JSONC + overrides)
  prompts/     PromptRegistry + variable rendering ({{var}})
  ai/          provider abstraction: openai, anthropic, gemini, opencode
  analyzer/    static heuristics (secrets, eval, console, TODO)
  scorer/      weighted quality score with breakdown + AI blend
  testgen/     untested-function detection + test generation
  cache/       file-based response cache
  plugins/     plugin loader / lifecycle hooks
  github/      Action entrypoint, Probot app, GitHub reporter
  engine/      central orchestrator (mode dispatch + fix loop)
  utils/       logger, git diff collection, file globbing
  index.ts     CLI
prompts/        markdown prompt templates (overridable)
config/         example configuration
tests/          vitest suites
```

---

## 🚀 Publish to npm

### 1. Login to npm
```bash
npm login
```

### 2. Update repository URLs
Edit `package.json` — replace `your-org/codesentinel-ai` with your actual GitHub repo.

### 3. Build and test
```bash
npm run build
npm test
```

### 4. Dry run (preview what gets published)
```bash
npm pack --dry-run
```

### 5. Publish
```bash
# First time
npm publish

# Subsequent (bump version first)
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.0 → 0.2.0
npm version major   # 0.1.0 → 1.0.0
npm publish
```

### 6. Install in other projects
```bash
npm install codesentinel-ai
```

Or use directly without installing:
```bash
npx codesentinel-ai review --provider opencode
```

### What gets published
Only these files are included in the npm package:
- `dist/` — compiled JS + type declarations
- `action.yml` — GitHub Action manifest
- `prompts/` — prompt templates

Source code, tests, and config files are excluded via `.npmignore`.

---

## 📄 License

MIT
