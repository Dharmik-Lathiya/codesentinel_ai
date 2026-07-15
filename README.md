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
    "review": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
    "fix":    { "provider": "openai",   "model": "gpt-4o" }
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

---

## 🖥️ CLI usage

```bash
# Review the current branch's diff
node dist/index.js --mode review --config ./codesentinel.config.json

# Score the whole repo
node dist/index.js --mode score --provider opencode

# Ask a question (chat mode)
node dist/index.js chat --ask "How does authentication work?" --context "Node service"

# Generate tests
node dist/index.js --mode testgen --test-gen
```

Environment variables (API keys): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY`, `OPENCODE_API_KEY`, `OPENCODE_BASE_URL`, `GITHUB_TOKEN`.

---

## 🤖 GitHub Action

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

## 📄 License

MIT
