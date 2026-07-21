<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:00c6ff,100:0072ff&height=200&section=header&text=CodeSentinel%20AI&fontSize=70&fontColor=fff&animation=fadeIn&fontAlignY=38">
    <img alt="CodeSentinel AI" src="https://capsule-render.vercel.app/api?type=waving&color=0:00c6ff,100:0072ff&height=200&section=header&text=CodeSentinel%20AI&fontSize=70&fontColor=fff&animation=fadeIn&fontAlignY=38" width="100%">
  </picture>
</p>

<p align="center">
  <strong>AI-Powered Code Quality Orchestrator</strong><br>
  Review PRs · Auto-fix Issues · Audit Repos · Score Quality · Generate Tests · Enforce Gates
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/🚀-Quick_Start-00c6ff?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-modes"><img src="https://img.shields.io/badge/🎯-Modes-7c3aed?style=for-the-badge" alt="Modes"></a>
  <a href="#-cli-usage"><img src="https://img.shields.io/badge/💻-CLI-10b981?style=for-the-badge" alt="CLI"></a>
  <a href="#-configuration"><img src="https://img.shields.io/badge/⚙️-Config-f59e0b?style=for-the-badge" alt="Config"></a>
  <a href="#-ai-providers"><img src="https://img.shields.io/badge/🤖-AI_Providers-ef4444?style=for-the-badge" alt="AI"></a>
  <a href="#-github-action"><img src="https://img.shields.io/badge/🔄-GitHub_Action-6366f1?style=for-the-badge" alt="Action"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TS">
  <img src="https://img.shields.io/badge/ESM-Module-ffd700" alt="ESM">
  <img src="https://img.shields.io/badge/Tests-111_Passing-22c55e" alt="Tests">
  <img src="https://img.shields.io/badge/License-MIT-22c55e" alt="License">
  <img src="https://img.shields.io/badge/PRs-Welcome-8b5cf6" alt="PRs Welcome">
</p>

---

## 📡 The Signal

```ascii
  ╔══════════════════════════════════════════════════════════════╗
  ║   ██████╗ ██████╗ ██████╗ ███████╗███████╗███╗   ██╗████████╗ ║
  ║  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝████╗  ██║╚══██╔══╝ ║
  ║  ██║     ██║   ██║██║  ██║█████╗  █████╗  ██╔██╗ ██║   ██║    ║
  ║  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║╚██╗██║   ██║    ║
  ║  ╚██████╗╚██████╔╝██████╔╝███████╗███████╗██║ ╚████║   ██║    ║
  ║   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝    ║
  ║                                                              ║
  ║     █████╗ ██╗         ██████╗ ██╗   ██╗ █████╗ ██╗         ║
  ║    ██╔══██╗██║         ██╔══██╗╚██╗ ██╔╝██╔══██╗██║         ║
  ║    ███████║██║         ██████╔╝ ╚████╔╝ ███████║██║         ║
  ║    ██╔══██║██║         ██╔══██╗  ╚██╔╝  ██╔══██║██║         ║
  ║    ██║  ██║███████╗    ██████╔╝   ██║   ██║  ██║███████╗    ║
  ║    ╚═╝  ╚═╝╚══════╝    ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚══════╝    ║
  ╚══════════════════════════════════════════════════════════════╝
```

**One CLI to review them all.** Drop it in any repo. Comment `/review` on a PR. Watch the AI burn through your code like a senior engineer with 3 espressos and something to prove.

|                                                                                                                           |                                                                                                                           |                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 🕵️ **Code Review** — catches bugs, security holes, perf crimes, and code smells before they hit production                | 🔧 **Auto-Fix** — AI writes the fix, lints it, tests it, loops until green (or gives up dramatically)                    | 🏆 **Quality Score** — 0-100 across 4 dimensions with AI-blended precision                                              |
| 🔬 **Full Audit** — deep scans security, architecture, secrets, and performance across your entire repo                   | 🧪 **Test Generation** — finds untested functions and spits out Jest/Vitest tests on autopilot                            | 🚦 **Quality Gate** — CI gate that slams shut when score drops or findings pile up                                      |
| 💀 **Dead Code** — sniffs out unused exports like a truffle pig for orphaned functions                                    | 💬 **Chat** — ask questions about your codebase, get answers with file references                                         | 📝 **PR Description** — generates structured PR summaries so your team stops writing ✨ war and peace ✨ in every PR body |

---

## 🚀 Quick Start

```bash
# 1. Install & build
npm install @dharmiklathiya/codesentinel_ai
npm run build

# 2. Drop the GitHub Action into your project
npx @dharmiklathiya/codesentinel_ai@latest setup

# 3. Go nuts
node dist/index.js review
node dist/index.js score --provider opencode
```

Then comment on **any PR or issue**:

```
/review   /fix   /audit   /score   /testgen   /gate   /deadcode   /describe   /ask <question>
```

---

## 🎯 Modes

| Mode | ⚡ CLI | 🧠 What It Does |
|------|--------|-----------------|
| **review** | `review` | Dissects PR diffs for bugs, security holes, performance crimes & code smells. Posts inline PR comments that actually make sense. |
| **fix** | `fix` | AI writes the fix, runs linters, runs tests, iterates. No infinite loops — we have a max. |
| **audit** | `audit` | Full-repo cavity search. Security, performance, architecture, secrets. Can auto-file GitHub Issues. |
| **score** | `score` | Computes 0-100 quality score (readability, maintainability, security, test coverage). Bragging rights included. |
| **testgen** | `testgen` | Finds untested functions, generates Jest/Vitest tests. Because nobody _wants_ to write tests. |
| **chat** | `chat --ask <question>` | Ask questions about the codebase. Gets answers with file references. Like a senior dev who never sleeps. |
| **gate** | `gate` | CI quality gate. Exits non-zero if score < threshold or findings exceed limits. Pipeline guardian. |
| **describe** | `describe` | Generates structured PR descriptions (title, type, changes, highlights, todos). PR descriptions that don't suck. |

---

## 💻 CLI Usage

```bash
codesentinel [mode] [options]
codesentinel setup              # Generate .github/workflows/codesentinel.yml
codesentinel init-hook          # Install pre-commit git hook
codesentinel dashboard          # Launch web dashboard
codesentinel dismiss ...        # Dismiss false positives
```

### 🏁 Flags

| Flag | What It Does |
|------|-------------|
| `-m, --mode <mode>` | Pick your poison: review, fix, audit, score, testgen, chat, gate, describe |
| `-c, --config <path>` | Path to `codesentinel.config.json` or `.opencode-reviewer.yml` |
| `--provider <name>` | AI provider: `opencode` (default), `openai`, `anthropic`, `gemini` — nukes all task models |
| `--max-iterations <n>` | Max fix-attempt loops (default: 5). Prevents infinite oopsies. |
| `--auto-fix` | Greenlight the AI to actually modify files |
| `--scoring / --no-scoring` | Toggle scoring on/off (default: on) |
| `--test-gen` | Enable test generation |
| `--ask <question>` | Activate chat mode with your question |
| `--context <text>` | Extra project context injected into every prompt |
| `--dry-run` | Show what would change without touching files (fix mode) |
| `--log-level <level>` | `debug \| info \| warn \| error` |
| `--json` | Dump full `EngineReport` as JSON |
| `--sarif` | SARIF 2.1.0 output (GitHub Advanced Security compatible) |
| `--jsonl` | **NEW** — AI results in JSONL format, one typed entry per line |
| `--mcp` | **NEW** — Fire up MCP servers for library doc enrichment |
| `--learning-db <path>` | **NEW** — Enable the self-learning store (SQLite) |
| `--yaml-config` | **NEW** — Auto-discover `.opencode-reviewer.yml` config |
| `--min-score <n>` | Gate min score (0-100) |
| `--max-critical <n>` | Gate max critical findings |
| `--max-high <n>` | Gate max high findings |
| `--version` | Version flex |
| `--help` | You're looking at it |

### 🧪 Real Talk

```bash
codesentinel review                                              # Review with defaults
codesentinel score --provider openai                             # Score with OpenAI
codesentinel fix --auto-fix --max-iterations 3 --provider anthropic  # Auto-fix with Claude
codesentinel gate --min-score 70 --max-critical 0 --max-high 5   # Guard the gates
codesentinel review --json \| jq '.findings'                     # JSON pipeline fuel
codesentinel audit --sarif > results.sarif                       # SARIF for GitHub Advanced Security
codesentinel chat --ask "How does auth work?"                    # Ask the codebase anything
codesentinel review --jsonl                                      # JSONL output
codesentinel review --mcp                                        # With MCP library context
codesentinel review --learning-db .codesentinel/learning.db      # Self-learning mode
```

---

## 🤖 AI Providers

Each task can ride a different model. **OpenCode** (local, `http://localhost:4096`) is the default.

```bash
# Set your keys — pick your fighter
export OPENCODE_API_KEY=sk-...       # local, no key needed
export OPENAI_API_KEY=sk-...         # the OG
export ANTHROPIC_API_KEY=sk-ant-...  # Claude nation
export GEMINI_API_KEY=...            # Google's contender

# CLI override — one flag to rule them all
codesentinel review --provider anthropic
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

## ⚙️ Configuration

### JSON Config (`codesentinel.config.json`)

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

Config is resolved as: **defaults → config file → overrides** (CLI / Action inputs).

### 🟡 YAML Config (NEW)

Drop a `.opencode-reviewer.yml` in your project root. Auto-discovered. No `--config` needed.

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
      comment: "Avoid console.log in production"

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
  - path: "legacy/**"
    branch: "main"
    fix:
      maxIterations: 1
```

**Per-path & per-branch overrides** with glob matching. Yes, you can have different rules for `src/` vs `legacy/`. We don't judge.

Also supported: `.opencode-reviewer.yaml`, `codesentinel.config.yml`, `codesentinel.config.yaml`, `codesentinel.config.json`.

### 🛡️ Security Blend Strategy

| Strategy | Behavior |
|----------|----------|
| `min` (default) | Conservative — takes the lower score |
| `avg` | Averages static and AI scores |
| `static-only` | Ignores AI security opinions |

### 🚦 Quality Gate

| Option | What It Does |
|--------|-------------|
| `minScore` | Overall score must be >= this (0-100) |
| `maxCritical` | Max critical findings before the gate slams |
| `maxHigh` | Max high findings before the gate slams |
| `blockOnSecurity` | **Any** security finding = fail |
| `blockOnBugs` | **Any** bug finding = fail |

---

## 📤 Output Formats

### 👤 Human-readable (default)

```
=== CodeSentinel [review] ===
Found 3 issues (1 critical, 1 warning, 1 praise)
Score: 78/100 (readability 85, maintainability 70, security 90, coverage 65)

Findings (3):
  [critical] src/auth.ts:42 — Hardcoded API key detected
  [medium]   src/utils.ts:15 — Possible null dereference
  [praise]   src/app.ts:1 — Good test coverage
```

### 📦 JSON (`--json`)

Full `EngineReport` — findings, score, fix attempts, generated tests, metrics. Pipe to `jq`, feed dashboards, whatever.

### 📋 SARIF (`--sarif`)

SARIF 2.1.0 — GitHub Advanced Security compatible. Upload to your security tab.

### 📃 JSONL (`--jsonl`) — NEW

One typed entry per line. Perfect for streaming pipelines:

```jsonl
{"type":"summary","summary":"Found 3 issues"}
{"type":"verdict","verdict":"changes_requested"}
{"type":"issue","file":"src/auth.ts","line":42,"severity":"critical","category":"security","message":"Hardcoded API key","suggestion":"Use environment variables"}
{"type":"strength","title":"Clean architecture","description":"Well-structured dependency injection"}
```

```ts
import { parseJsonlString, buildReviewBody, buildInlineComments } from "codesentinel-ai";

const entries = parseJsonlString(rawJsonl);
const body = buildReviewBody(entries);
const comments = buildInlineComments(entries);
```

---

## 🔄 GitHub Action

### Setup (one shot, zero thought)

```bash
npx @dharmiklathiya/codesentinel_ai@latest setup
```

Boom — `.github/workflows/codesentinel.yml` appears. Commit & push.

### Slash Commands on PRs & Issues

Works on **both PRs and issues**. On issues it runs against the default branch; on PRs it runs against the PR diff.

| Command | Action |
|---------|--------|
| `/review` | AI code review with inline PR comments |
| `/fix` | Propose & auto-fix issues |
| `/audit` | Full repo audit |
| `/score` | Quality score |
| `/testgen` | Generate tests |
| `/gate` | Quality gate |
| `/deadcode` | Find unused exports |
| `/describe` | Generate PR description |
| `/ask <question>` | Chat with the codebase |

### Reusable Action

```yaml
- uses: your-org/codesentinel-ai@v1
  with:
    mode: review
    enable_scoring: "true"
    opencode_api_key: ${{ secrets.OPENCODE_API_KEY }}
```

The Action:
- Posts inline PR comments
- Creates Check Runs with annotations (`gate` mode)
- Sets commit status (`codesentinel/gate`)
- Outputs `score` + `findings` for downstream steps

---

## 🐙 GitHub App (Probot)

```bash
node dist/github/app.js
```

Comment any slash command on a PR. The app handles `issue_comment.created` and `issue_comment.edited`, deduplicates, and responds.

---

## 📊 Dashboard

```bash
codesentinel dashboard
```

Opens at `http://localhost:4173` (configurable). Historical run data. Graceful Ctrl+C shutdown.

---

## 🔗 Pre-commit Hook

```bash
codesentinel init-hook
```

Installs a pre-commit hook that quick-scans staged files. Because fixing things before they leave your machine is a life skill.

---

## 🙅 Dismissing False Positives

```bash
# Dismiss by rule
codesentinel dismiss --rule "security:eval" "False positive — input is sanitized"

# Dismiss a specific file+line
codesentinel dismiss --file src/app.ts --line 42 "Reviewed and approved"
```

Stored in JSON file (`dismissalsFile` config). Persisted across runs. Your word is law.

---

## 💀 Dead Code Detection

```bash
codesentinel deadcode
```

Sniffs out exported functions, variables, and types that nothing imports. In-process, zero AI calls.

---

## 🧠 Self-Learning Store (NEW)

CodeSentinel records every finding it makes. Over time it spots patterns, suggests rule adjustments, and gets smarter.

```bash
codesentinel review --learning-db .codesentinel/learning.db
```

| Option | What It Does |
|--------|-------------|
| `enabled` | Turn the learning brain on |
| `dbPath` | SQLite path (or `postgres://` / `mysql://` URL) |
| `metaReview` | Reviews past decisions to suggest rule tweaks |
| `patternDiscovery` | Auto-discovers recurring issue patterns |
| `metaReviewInterval` | How many runs before auto-review |

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

SQLite by default. Drop in a `postgres://` or `mysql://` URL and it switches engines. We don't discriminate.

---

## 🔌 MCP Server Integration (NEW)

CodeSentinel connects to MCP servers to pull in library docs and context before every AI review. Smarter reviews, less hallucination.

```bash
codesentinel review --mcp
```

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
        "environment": { "DOCS_DIR": "./docs" }
      }
    ]
  }
}
```

**Built-in presets** (auto-loaded when servers is empty):
- **context7** (remote) — general library docs
- **GitHub context** (local) — GitHub API / Actions docs

When MCP fires up, it queries servers for relevant docs and stuffs them into the AI prompt. Context window goes 🚀.

---

## 📦 File Batching (NEW)

Prevents context window overflow by grouping files into manageable batches.

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

---

## 📡 Event Bus (NEW)

Internal pub/sub for extensibility. Powers Probot integration. Has a circuit breaker because bad subscribers don't get to bring down the party.

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

| Feature | What |
|---------|------|
| Pub/sub | Named subscribers with event type filtering |
| Circuit breaker | 5 consecutive failures → 30s cooldown |
| Concurrency limit | Configurable, default 10 |
| Timeout | Subscribers get 120s, then they're out |
| History | Full event history for debugging |

---

## ⚡ OpenCode CLI Auto-Install (NEW)

CodeSentinel can download, verify, and cache the OpenCode CLI binary. No manual install needed.

```ts
import { setupOpenCode, runOpenCode } from "codesentinel-ai";

const { binaryPath, version, cached } = await setupOpenCode("latest");
console.log(`OpenCode ${version} at ${binaryPath} (cached: ${cached})`);

const output = runOpenCode(binaryPath, ["review", "--json"]);
```

Cached at `~/.codesentinel/opencode/`. Fallback to system PATH if download fails. SHA checksum verification included because we're not savages.

---

## 🔒 Caching

AI responses cached on disk at `.codesentinel-cache`. 24h TTL, 500 entry max, content-addressed. Unchanged files skip AI re-analysis entirely. Your API budget says thanks.

---

## 🗂️ 19 Static Analysis Checks

| Category | 🔍 What We Catch |
|----------|-----------------|
| 🛡️ **Security** | Secrets (API keys, tokens, connection strings, private keys), `eval()`, `child_process`, `Function()`, `exec`, regex DoS |
| 🐛 **Bugs** | `==` vs `===`, `debugger;`, `console.log`, TODO/FIXME, empty catch, `any` casts, unused vars |
| 🤢 **Smells** | Long functions (>100 lines), deep nesting (>4 levels), magic numbers, large files (>500 lines) |
| ✨ **Style** | Naming conventions (camelCase, PascalCase) |

## 🔐 Secrets Scanning

19 built-in patterns + custom via `config.secretPatterns`:

```
AWS keys  ·  GitHub tokens  ·  JWT tokens  ·  RSA/EC/DSA/OpenSSH/PKCS#8 private keys
Generic API keys  ·  npm tokens  ·  PostgreSQL/Redis/MongoDB connection strings
Slack tokens  ·  Google API keys  ·  and 9 more...
```

---

## 🧩 Plugins

Extend analysis with your own checks.

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

List in `config.plugins`.

---

## 📚 Library Usage

```ts
import { Engine, mergeConfig, DEFAULT_CONFIG } from "codesentinel-ai";

const engine = Engine.fromInputs({
  configPath: "./codesentinel.config.json",
  secrets: { opencode_api_key: process.env.OPENCODE_API_KEY },
  root: "/path/to/project",
});

const report = await engine.run();
console.log(report.score?.overall);  // 0–100
console.log(report.gatePassed);      // boolean (gate mode)
const answer = await engine.ask("How does auth work?");
```

### 📦 Full Export Map

```ts
// Core
import { Engine, loadConfig, configFromInputs, DEFAULT_CONFIG, mergeConfig } from "codesentinel-ai";

// AI
import { AIHub, extractJson, ProviderUnavailableError } from "codesentinel-ai";

// Utilities
import { concurrentMap, renderSarif, renderHtmlReport } from "codesentinel-ai";

// JSONL (NEW)
import { parseJsonlString, parseJsonlFile, validateAndNormalize, buildReviewBody, buildInlineComments } from "codesentinel-ai";

// MCP (NEW)
import { MCPManager, getDefaultMCPServers } from "codesentinel-ai";
import type { MCPServerConfig, MCPContextEntry } from "codesentinel-ai";

// Learning Store (NEW)
import { LearningStore } from "codesentinel-ai";
import type { FindingRecord, PatternRecord, CustomRuleRecord } from "codesentinel-ai";

// Event Bus (NEW)
import { EventBus } from "codesentinel-ai";
import type { GitHubEvent, Subscriber } from "codesentinel-ai";

// OpenCode CLI (NEW)
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

## 🧪 Testing

```bash
npm test          # Vitest — 111 tests and counting
npm run typecheck # tsc --noEmit
npm run build     # Compile to dist/
```

---

## 🏗️ Project Structure

```
src/
├── config/        Types, defaults, JSONC/YAML config loader, validation
├── prompts/       Prompt templates with {{variable}} rendering
├── ai/            Provider abstraction: openai, anthropic, gemini, opencode
├── analyzer/      19 static heuristics + progressive analysis + severity
├── scorer/        Weighted quality score (0-100) with AI blending
├── testgen/       Untested function detection + test generation
├── cache/         File-based LRU cache, content-addressable, 24h TTL
├── gate/          Quality gate evaluation
├── plugins/       Plugin loader / lifecycle hooks
├── dismiss/       False-positive dismissal manager
├── secrets/       Secret pattern scanner (19 built-in)
├── linters/       External linter runner (ESLint, Biome, Pylint)
├── scanners/      3rd-party secret scanner integration
├── deadcode/      Unused export detection
├── suggestions/   Committable suggestion builder
├── github/        Action entrypoint, Probot app, reporter
├── engine/        Central orchestrator — dispatch, fix loop, batching
├── dashboard/     Web dashboard server
├── mcp/           MCP client + server presets (NEW)
├── learning/      Self-learning store: SQLite/PostgreSQL/MySQL (NEW)
├── event-bus/     Pub/sub with circuit breaker (NEW)
├── opencode/      CLI auto-installer (NEW)
├── types/         Zod schemas for JSONL (NEW)
├── utils/         Logger, git, glob, concurrency, SARIF, retry, JSONC
├── index.ts       CLI entrypoint
└── lib.ts         Public API exports
```

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0072ff,100:00c6ff&height=120&section=footer" width="100%">
</p>

<p align="center">
  <strong>MIT</strong> · Built with rage and caffeine<br>
  <sub>PRs welcome. Issues welcome. Existential questions about AI code review also welcome.</sub>
</p>
