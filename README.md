# CodeSentinel AI

AI-powered code quality orchestrator. Review PRs, auto-fix issues, audit entire repos, score quality (0–100), generate tests, enforce quality gates, detect dead code, and answer questions — all through a single CLI, GitHub Action, or Probot app.

Supports **OpenCode**, **OpenAI**, **Anthropic**, and **Gemini** — each task can use a different model.

---

## Quick start

```bash
# Install
npm install @dharmiklathiya/codesentinel_ai
npm run build

# Set up GitHub Actions workflow (run once in your project)
npx @dharmiklathiya/codesentinel_ai@latest setup

# Run a review
node dist/index.js review

# Score your project
node dist/index.js score --provider opencode
```

Then comment on any PR:
```
/review   /fix   /audit   /score   /testgen   /gate   /deadcode   /ask ...
```

---

## Modes

| Mode | CLI | Description |
|------|-----|-------------|
| **review** | `review` | Analyze PR diff for bugs, security, performance, and code smells. Posts inline PR comments. |
| **fix** | `fix` | Auto-fix issues in a loop; runs lint + tests after each attempt. Detects regressions. |
| **audit** | `audit` | Full repository scan — security, performance, architecture, secrets. Optionally opens GitHub Issues. |
| **score** | `score` | Computes a 0–100 quality score across readability, maintainability, security, and test coverage. |
| **testgen** | `testgen` | Finds untested functions and generates Jest/Vitest unit tests. |
| **chat** | `chat --ask <question>` | Answers questions using the codebase as context. |
| **gate** | `gate` | Quality gate — exits non-zero if score below threshold or findings exceed limits. |
| **describe** | `describe` | Generates structured PR description (title, summary, type, breaking changes, highlights). |

---

## CLI usage

```bash
codesentinel [mode] [options]
codesentinel setup
codesentinel init-hook
codesentinel dashboard
codesentinel dismiss --file <path> --line <n> [reason]
codesentinel dismiss --rule <ruleId> [reason]
```

### Options

| Flag | Description |
|------|-------------|
| `-m, --mode <mode>` | Mode: review, fix, audit, score, testgen, chat, gate, describe |
| `-c, --config <path>` | Path to `codesentinel.config.json` or `.opencode-reviewer.yml` |
| `--provider <name>` | AI provider (opencode, openai, anthropic, gemini) — overrides all tasks |
| `--max-iterations <n>` | Max fix iterations (default: 5) |
| `--auto-fix` | Apply fixes automatically |
| `--scoring / --no-scoring` | Enable/disable scoring (default: enabled) |
| `--test-gen` | Enable test generation |
| `--ask <question>` | Ask a question (chat mode) |
| `--context <text>` | Free-form project context for prompts |
| `--dry-run` | Show what would be changed without writing (fix mode) |
| `--log-level <level>` | Log level: debug, info, warn, error |
| `--json` | Output report as JSON |
| `--sarif` | Output findings in SARIF 2.1.0 format |
| `--jsonl` | Output AI review results in JSONL format |
| `--mcp` | Enable MCP server integration for library documentation |
| `--learning-db <path>` | Enable self-learning store at path (SQLite) |
| `--yaml-config` | Auto-discover `.opencode-reviewer.yml` config file |
| `--min-score <n>` | Minimum score to pass gate (0–100) |
| `--max-critical <n>` | Max critical findings allowed in gate |
| `--max-high <n>` | Max high findings allowed in gate |
| `--version` | Show version |
| `--help` | Show help |

### Examples

```bash
# Review with defaults
codesentinel review

# Score using OpenAI
codesentinel score --provider openai

# Auto-fix with Anthropic, cap at 3 iterations
codesentinel fix --auto-fix --max-iterations 3 --provider anthropic

# Quality gate: score ≥ 70, zero criticals, max 5 highs
codesentinel gate --min-score 70 --max-critical 0 --max-high 5

# JSON output (pipe to jq)
codesentinel review --json | jq '.findings'

# SARIF output (upload to GitHub Advanced Security)
codesentinel audit --sarif > results.sarif

# Chat about the codebase
codesentinel chat --ask "How does authentication work?"

# Dead code detection
codesentinel deadcode

# Start the web dashboard
codesentinel dashboard

# Setup GitHub Actions workflow in the current project
codesentinel setup

# Dismiss a false positive
codesentinel dismiss --file src/app.ts --line 42 --rule-id "security:hardcoded key" "Not a real key"

# JSONL output (for CI pipelines)
codesentinel review --jsonl

# Use YAML config file
codesentinel review --yaml-config

# Enable MCP servers for library documentation context
codesentinel review --mcp

# Enable self-learning store
codesentinel review --learning-db .codesentinel/learning.db
```

---

## AI providers

Each capability uses a model defined in config. **OpenCode** is the default (runs locally).

```bash
# Environment variables
export OPENCODE_API_KEY=sk-...      # for opencode (default)
export OPENAI_API_KEY=sk-...        # for openai
export ANTHROPIC_API_KEY=sk-ant-... # for anthropic
export GEMINI_API_KEY=...           # for gemini

# Override all tasks from CLI
codesentinel review --provider anthropic

# Per-task models in config
```

```jsonc
{
  "default_model": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
  "models": {
    "review": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
    "fix":    { "provider": "openai", "model": "gpt-4o" },
    "score":  { "provider": "gemini", "model": "gemini-1.5-pro" }
  }
}
```

---

## Configuration

### JSON config

Create `codesentinel.config.json` in your project root:

```jsonc
{
  "mode": "review",
  "max_iterations": 5,
  "enable_auto_fix": false,
  "enable_scoring": true,
  "enable_test_generation": false,
  "include_positive_feedback": true,
  "jsonl_output": false,
  "project_context": "TypeScript monorepo. Keep functions pure.",
  "default_model": { "provider": "opencode", "model": "opencode/default" },
  "test_runner": "vitest",
  "include": ["**/*.{ts,tsx,js,jsx}"],
  "exclude": ["node_modules/**", "dist/**", "**/*.test.*"],
  "gate": {
    "minScore": 70,
    "maxCritical": 0,
    "maxHigh": 5,
    "blockOnSecurity": true,
    "blockOnBugs": false
  },
  "securityBlendStrategy": "min",
  "output": {
    "postGithubComments": true,
    "createGithubIssues": false,
    "writeReportFile": true,
    "reportDir": "codesentinel-reports"
  },
  "enable_cache": true,
  "cache_dir": ".codesentinel-cache",
  "plugins": [],
  "learning": {
    "enabled": false,
    "dbPath": ".codesentinel/learning.db",
    "metaReview": false,
    "patternDiscovery": false
  },
  "mcp": {
    "enabled": false,
    "servers": []
  },
  "batch": {
    "enabled": false,
    "batchSize": 3,
    "maxFilesPerBatch": 3,
    "maxLinesPerFile": 500
  }
}
```

### YAML config (alternative)

CodeSentinel also supports `.opencode-reviewer.yml` (canonical), `.opencode-reviewer.yaml`, or `codesentinel.config.yml`. Config discovery happens automatically when no `--config` is given:

```yaml
# .opencode-reviewer.yml
project:
  name: my-project
  description: TypeScript monorepo
  conventions:
    - "Keep functions pure"
    - "Use named exports"

review:
  inline: true
  customRules:
    - id: "no-console"
      pattern: "console\\."
      severity: "low"
      category: "smell"
      comment: "Avoid console.log"

fix:
  maxIterations: 3

learning:
  enabled: true
  metaReview: true
  patternDiscovery: true

mcpServers:
  - name: context7
    type: remote
    url: https://context7.example.com/sse

overrides:
  - path: "src/**/*.ts"
    review:
      inline: true
```

Config is resolved as: **defaults → config file → overrides** (CLI flags / Action inputs).

When using YAML, `overrides` support per-path and per-branch config overrides with glob matching.

### Security blend strategy

Controls how AI and static analysis security scores are combined:

| Strategy | Behavior |
|----------|----------|
| `min` (default) | Takes the lower (more conservative) score |
| `avg` | Averages static and AI scores |
| `static-only` | Ignores AI security score entirely |

### Quality gate (`codesentinel gate`)

The gate evaluates findings and score against configurable thresholds. It's designed for CI — exits non-zero on failure.

- `minScore` — overall score must be ≥ this value
- `maxCritical` / `maxHigh` — maximum allowed findings at each severity
- `blockOnSecurity` — fail if any security finding exists
- `blockOnBugs` — fail if any bug finding exists

---

## Output formats

### Human-readable (default)
```
=== CodeSentinel [review] ===
Found 3 issues (1 critical, 1 warning, 1 praise)
Score: 78/100 (readability 85, maintainability 70, security 90, coverage 65)

Findings (3):
  [critical] src/auth.ts:42 — Hardcoded API key detected
  [medium]   src/utils.ts:15 — Possible null dereference
  [praise]   src/app.ts:1 — Good test coverage
```

### JSON (`--json`)
Full `EngineReport` as JSON — includes findings, score, fix attempts, generated tests, metrics.

### SARIF (`--sarif`)
Findings in SARIF 2.1.0 format — compatible with GitHub Advanced Security and other SARIF viewers.

### JSONL (`--jsonl`)
AI review output in JSONL (newline-delimited JSON) format. Each line is a typed entry:

```jsonl
{"type":"summary","summary":"Found 3 issues"}
{"type":"verdict","verdict":"changes_requested"}
{"type":"issue","file":"src/auth.ts","line":42,"severity":"critical","category":"security","message":"Hardcoded API key","suggestion":"Use environment variables"}
{"type":"strength","title":"Clean architecture","description":"Well-structured dependency injection"}
```

Parse programmatically:

```ts
import { parseJsonlString, buildReviewBody, buildInlineComments } from "codesentinel-ai";

const entries = parseJsonlString(rawJsonl);
const body = buildReviewBody(entries);
const comments = buildInlineComments(entries);
```

---

## GitHub Action

### Setup (one command)

```bash
npx @dharmiklathiya/codesentinel_ai@latest setup
```

This creates `.github/workflows/codesentinel.yml`. Commit and push it.

### Slash commands on PRs

Comment on any PR:

| Command | Action |
|---------|--------|
| `/review` | AI code review — inline PR comments |
| `/fix` | Propose and auto-fix issues |
| `/audit` | Full repository audit |
| `/score` | Quality score (0–100) |
| `/testgen` | Generate missing tests |
| `/gate` | Quality gate check |
| `/deadcode` | Detect unused exports |
| `/ask <question>` | Ask a question about the codebase |

### Reusable Action

```yaml
- uses: your-org/codesentinel-ai@v1
  with:
    mode: review
    enable_scoring: "true"
    opencode_api_key: ${{ secrets.OPENCODE_API_KEY }}
```

The Action:
- Posts inline PR comments for findings
- Creates Check Runs with annotations (`gate` mode)
- Sets commit status (`codesentinel/gate` context)
- Outputs `score` and `findings` for downstream steps

---

## GitHub App (Probot)

Run the bundled Probot app:

```bash
node dist/github/app.js
```

Then comment any slash command on a PR. The app:
- Handles `issue_comment.created` and `issue_comment.edited` events
- Deduplicates repeated comments
- Responds with the analysis result as a comment

---

## Dashboard

Start the web dashboard to view historical run data:

```bash
codesentinel dashboard
```

Opens at `http://localhost:4173` (configurable via `config.dashboard.port`). Gracefully shuts down on Ctrl+C.

---

## Pre-commit hook

```bash
codesentinel init-hook
```

Installs a pre-commit git hook that runs a quick scan on staged files.

---

## Dismissing false positives

```bash
# Dismiss by rule (all occurrences)
codesentinel dismiss --rule "security:eval" "False positive — input is sanitized"

# Dismiss a specific file+line
codesentinel dismiss --file src/app.ts --line 42 "Reviewed and approved"
```

Dismissals are stored in a JSON file (configurable via `dismissalsFile`) and are persisted across runs.

---

## Dead code detection

```bash
codesentinel deadcode
```

Analyzes all source files and reports unused exports (functions, variables, types that are exported but never imported elsewhere).

---

## Caching

AI responses are cached on disk (default: `.codesentinel-cache`, 24h TTL, 500 entry max). Cache is content-addressed — unchanged files skip AI re-analysis entirely.

---

## MCP server integration

CodeSentinel can connect to MCP servers to enrich AI prompts with library documentation and context.

```bash
codesentinel review --mcp
```

Configure MCP servers in `codesentinel.config.json`:

```jsonc
{
  "mcp": {
    "enabled": true,
    "servers": [
      {
        "name": "context7",
        "type": "remote",
        "url": "https://context7.example.com/sse"
      },
      {
        "name": "docs-server",
        "type": "local",
        "command": ["npx", "-y", "@modelcontextprotocol/server-docs"],
        "environment": {
          "DOCS_DIR": "./docs"
        }
      }
    ]
  }
}
```

Built-in presets (used when no servers are configured):
- **context7** (remote) — general library documentation
- **GitHub context** (local) — GitHub API / Actions docs

When MCP is enabled, the engine queries connected servers for relevant library docs before each AI review call and injects the context into the prompt.

---

## Self-learning store

CodeSentinel can record past findings to detect patterns, reduce false positives, and improve review quality over time.

```bash
codesentinel review --learning-db .codesentinel/learning.db
```

```jsonc
{
  "learning": {
    "enabled": true,
    "dbPath": ".codesentinel/learning.db",
    "metaReview": true,
    "patternDiscovery": true,
    "metaReviewInterval": 10
  }
}
```

| Option | Description |
|--------|-------------|
| `enabled` | Enable the learning store |
| `dbPath` | Path to SQLite database (fallback to `:memory:`) |
| `metaReview` | Review past decisions to suggest rule adjustments |
| `patternDiscovery` | Detect recurring issue patterns automatically |
| `metaReviewInterval` | Runs of learning data before auto-review |

Supports PostgreSQL (`postgres://`) and MySQL (`mysql://`) via connection URL. Falls back to SQLite when no URL is given.

---

## File batching

Group files into batches to manage token budgets and prevent context window overflow.

```jsonc
{
  "batch": {
    "enabled": true,
    "batchSize": 3,
    "maxFilesPerBatch": 3,
    "maxLinesPerFile": 500
  }
}
```

When enabled, the review pipeline groups files into batches before sending to the AI model, respecting per-batch and per-file limits.

---

## Event bus

CodeSentinel exposes an internal event bus for extensibility and integration with Probot / webhook workflows.

```ts
import { EventBus } from "codesentinel-ai";

const bus = new EventBus();
bus.register({
  name: "log-events",
  eventTypes: ["review.complete", "fix.complete"],
  handler: async (event) => {
    console.log(`Event: ${event.type}`, event.payload);
  },
});

bus.emit({
  type: "review.complete",
  payload: { findings: 5, score: 85 },
});
```

Features:
- Pub/sub with named subscribers and event type filtering
- Circuit breaker: after 5 consecutive failures, a subscriber enters 30s cooldown
- Concurrency limit (configurable, default 10)
- Subscriber timeout (default 120s)
- Event history for debugging

---

## OpenCode CLI auto-install

CodeSentinel can download and cache the OpenCode CLI binary automatically:

```ts
import { setupOpenCode, runOpenCode } from "codesentinel-ai";

const { binaryPath, version, cached } = await setupOpenCode("latest");
console.log(`OpenCode ${version} at ${binaryPath} (cached: ${cached})`);

const output = runOpenCode(binaryPath, ["review", "--json"]);
```

The binary is cached at `~/.codesentinel/opencode/` and reused across runs. Falls back to system PATH if download fails.

---

## 19 static analysis checks

| Category | Checks |
|----------|--------|
| Security | Secrets (API keys, tokens, connection strings, private keys), `eval()`, `child_process`, `Function()`, `exec`, regex DoS |
| Bugs | `==` vs `===`, `debugger;`, `console.log`, TODO/FIXME, empty catch, `any` casts, unused vars |
| Smells | Long functions (>100 lines), deep nesting (>4 levels), magic numbers, large files (>500 lines) |
| Style | Naming conventions (camelCase, PascalCase) |

---

## Secrets scanning

Built-in patterns for:
- AWS keys, GitHub tokens, JWT tokens
- Private keys (RSA, EC, DSA, OpenSSH, PKCS#8)
- Generic API keys, npm tokens
- PostgreSQL, Redis, MongoDB connection strings
- Slack tokens, Google API keys

Custom patterns can be added via `config.secretPatterns`.

---

## Plugins

Extend analysis with custom checks:

```ts
import type { CodeSentinelPlugin } from "codesentinel-ai";

const plugin: CodeSentinelPlugin = {
  name: "no-console-log",
  analyze(files) {
    return files
      .filter(f => f.content.includes("console.log"))
      .map(f => ({
        severity: "low",
        category: "smell",
        file: f.path,
        line: null,
        comment: "Avoid console.log in production",
        source: "static",
      }));
  },
  score(breakdown) {
    breakdown.readability = Math.max(0, breakdown.readability - 5);
    return breakdown;
  },
};

export default plugin;
```

List plugins in `config.plugins`.

---

## Library usage

```ts
import { Engine, mergeConfig, DEFAULT_CONFIG } from "codesentinel-ai";

const engine = Engine.fromInputs({
  configPath: "./codesentinel.config.json",
  secrets: {
    opencode_api_key: process.env.OPENCODE_API_KEY,
  },
  root: "/path/to/project",
});

const report = await engine.run();
console.log(report.score?.overall);  // 0–100
console.log(report.gatePassed);      // boolean (gate mode)

// Chat
const answer = await engine.ask("How does auth work?");
```

### Available exports

```ts
// Core
import { Engine, loadConfig, configFromInputs, DEFAULT_CONFIG, mergeConfig } from "codesentinel-ai";

// AI
import { AIHub, extractJson, ProviderUnavailableError } from "codesentinel-ai";

// Utilities
import { concurrentMap, renderSarif, renderHtmlReport } from "codesentinel-ai";

// JSONL parser
import { parseJsonlString, parseJsonlFile, validateAndNormalize, buildReviewBody, buildInlineComments } from "codesentinel-ai";

// MCP integration
import { MCPManager, getDefaultMCPServers } from "codesentinel-ai";
import type { MCPServerConfig, MCPContextEntry } from "codesentinel-ai";

// Learning store
import { LearningStore } from "codesentinel-ai";
import type { FindingRecord, PatternRecord, CustomRuleRecord } from "codesentinel-ai";

// Event bus
import { EventBus } from "codesentinel-ai";
import type { GitHubEvent, Subscriber } from "codesentinel-ai";

// OpenCode CLI installer
import { setupOpenCode, runOpenCode } from "codesentinel-ai";

// Types
import type {
  CodeSentinelConfig, EngineReport, Finding, ScoreBreakdown,
  ModelConfig, Provider, Mode, RuntimeSecrets, CodeSentinelPlugin,
  SecurityBlendStrategy, GateConfig, FixAttempt, ReviewComment,
  LearningConfig, MCPConfig, BatchConfig,
} from "codesentinel-ai";
```

---

## Testing

```bash
npm test          # Vitest — 110+ tests
npm run typecheck # tsc --noEmit
npm run build     # Compile to dist/
```

---

## Project structure

```
src/
  config/      Types, defaults, JSONC/YAML config loader, validation
  prompts/     Prompt templates with {{variable}} rendering
  ai/          Provider abstraction: openai, anthropic, gemini, opencode
  analyzer/    19 static heuristics + progressive analysis + severity adjustment
  scorer/      Weighted quality score (0–100) with AI blending
  testgen/     Untested function detection + test generation
  cache/       File-based LRU cache with content-addressable keys
  gate/        Quality gate evaluation against thresholds
  plugins/     Plugin loader / lifecycle hooks
  dismiss/     False-positive dismissal manager
  secrets/     Secret pattern scanner (19 built-in patterns)
  linters/     External linter runner (ESLint, Biome, Pylint)
  scanners/    3rd-party secret scanner integration
  deadcode/    Unused export detection
  suggestions/ Committable suggestion builder
  github/      Action entrypoint, Probot app, GitHub reporter
  engine/      Central orchestrator — mode dispatch, fix loop, verification, batching
  dashboard/   Web dashboard server
  mcp/         MCP client manager + server presets for library context enrichment
  learning/    Self-learning store (SQLite/PostgreSQL/MySQL) for pattern detection
  event-bus/   Pub/sub event bus with circuit breaker, cooldown, concurrency limits
  opencode/    OpenCode CLI auto-installer (download, verify, cache)
  types/       Zod schemas for JSONL review format
  utils/       Logger (JSON mode), git diff, file globbing, concurrency, SARIF, retry, JSONC parser
  index.ts     CLI entrypoint
  lib.ts       Public API exports
```

---

## License

MIT
