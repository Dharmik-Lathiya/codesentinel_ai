# codesentinel_ai vs opencode-ai-reviewer — Feature Comparison

**codesentinel_ai** — `/home/denny/Documents/Projects/codesentinel_ai` (7521 src lines, 40 src files, 111 tests)
**opencode-ai-reviewer** — `github.com/nilesh32236/opencode-ai-reviewer` (15928 src lines, 39 src files across 3 packages, 19 test files)

---

## Shared Features (both projects have)

| Feature | codesentinel_ai | opencode-ai-reviewer |
|---------|:-:|:-:|
| PR review with AI findings | Yes | Yes |
| Auto-fix mode with verification loop | Yes (lint+tests) | Yes (configurable commands) |
| Codebase audit | Yes | Yes (with category selection) |
| GitHub Action | Yes (composite action.yml) | Yes (pnpm monorepo workspace) |
| Slash commands on PRs (/review, /fix, /audit, etc.) | Yes | Yes (+ /oc, /approve-rule) |
| Multi-provider AI (opencode, openai, anthropic, gemini) | Yes | Yes |
| Multi-model routing per task | Yes | Yes |
| Inline PR comments | Yes | Yes (with inline/fallback) |
| Config file (YAML/JSON) | JSON (codesentinel.config.json) | YAML (.opencode-reviewer.yml) |
| Config with default → file → CLI merge | Yes | Yes (+ path/branch overrides) |
| AI response caching | Yes (content-addressed, LRU) | No |
| Structured output (JSON) | Yes (EngineReport) | Yes (JSONL) |

---

## Unique to codesentinel_ai

| Feature | Description |
|---------|-------------|
| Quality scoring engine | 0–100 across 4 dimensions (readability, maintainability, security, test_coverage) with AI blending |
| Static analyzer (19 heuristics) | Built-in security, bug, smell, and style checks (secrets, eval, == vs ===, naming, etc.) |
| 19 built-in secret patterns | AWS, GitHub, JWT, DB connection strings, private keys, Slack, Google, Stripe, etc. |
| Content-addressed LRU cache | Disk-based, 24h TTL, 500 entries, stores in `.codesentinel-cache/` |
| Dashboard web server | Web UI at localhost:4173 with historical run data |
| Dismissal manager | Persist false-positive dismissals across runs (dismiss by rule or file+line) |
| HTML report rendering | Human-readable HTML output |
| SARIF output | Findings in SARIF 2.1.0 format (GitHub Advanced Security compatible) |
| Plugin system | `CodeSentinelPlugin` interface with `analyze()` and `score()` hooks |
| Pre-commit hook installer | `codesentinel init-hook` |
| Dead code detection | In-process, no AI call needed |
| Score blending strategies | `min` (conservative), `avg`, `static-only` |
| Enhanced analyzer | Progressive analysis, multi-file analysis, severity adjustment, confidence thresholds |
| Describe mode | Generate structured PR descriptions (title, summary, type, breaking changes) |
| Gate mode | CI quality gate with configurable thresholds |
| Chat mode | Ask questions about the codebase using AI |
| Dual CLI/library export | `codesentinel-ai` lib + `codesentinel-ai/cli` |
| Bunyan-style logger | JSON mode for structured logging |
| Regression test suite | 28 regression tests for edge cases |
| Custom prompt paths | Template overrides per mode |

---

## Unique to opencode-ai-reviewer

| # | Feature | Description | Complexity |
|---|---------|-------------|:----------:|
| 1 | **MCP server integration** | Context7 for live library docs + GitHub MCP for repo context. Uses `@modelcontextprotocol/sdk` with local (stdio) and remote (SSE) transports. Auto-detects libraries (React, Next.js, Express, etc.) | High |
| 2 | **Self-learning infrastructure** | Persistent LearningStore backed by SQLite/PostgreSQL/MySQL/JSON. Records findings, feedback, quality scores, custom rules, prompt overrides | High |
| 3 | **Meta-review engine** | Auto-evaluates review quality (actionability, accuracy, coverage, consistency). Triggers prompt overrides when FP rate > 30% | Medium |
| 4 | **Pattern detection** | Clusters similar findings via Jaccard similarity (>0.3 threshold), auto-creates pending custom rules | Medium |
| 5 | **Event bus with circuit breakers** | Pub/sub system with 10-worker concurrency, 120s deadline, circuit breaker per subscriber (5 failures → 30s cooldown → reset on 2 successes) | Medium |
| 6 | **Autonomous self-improvement** | Weekly workflow: creates branch, runs OpenCode on itself, verifies build/test/lint, opens PR with label `self-improvement` | Medium |
| 7 | **Probot GitHub App** | Full Probot webhook server with event routing, slash command handlers, learning store persistence | High |
| 8 | **Sub-agent batching** | Files grouped into batches (default 3) and reviewed by parallel sub-agents for context window management | Medium |
| 9 | **Path/branch-based overrides** | Glob patterns on file paths or branch names to customize review behavior per-directory | Low |
| 10 | **Command allowlisting** | Fix verification commands restricted to allowlist (`pnpm`/`npm`/`yarn`/`node`), shell injection prevention | Low |
| 11 | **OpenCode CLI auto-install** | Downloads OpenCode binary from GitHub releases, SHA256 checksum verification, cached via `@actions/tool-cache` | Medium |
| 12 | **Autofix loop with labels** | Full iteration history, timeout graceful handling, label management (`autofix:ready`, `autofix:needs-manual-review`), auto-merge | High |
| 13 | **Feedback subscriber** | Tracks dismissed reviews and disputed comments via `/approve-rule` command | Low |
| 14 | **Prompt override system** | Auto-injects conservative-bias instructions when false-positive rate exceeds threshold | Low |
| 15 | **JSONL output format** | Structured line-by-line AI output with strict Zod validation (summary, verdict, strength, issue types) | Low |
| 16 | **Library auto-detection** | Detects React, Next.js, Express, Prisma, Zod, Tailwind, Vue, Svelte, GraphQL, Vitest from file paths | Low |
| 17 | **Mergebot-style workflows** | 6-job self-review pipeline, reusable `review.yml`/`audit.yml`/`autofix.yml` workflows | Medium |
| 18 | **Git credential injection** | GIT_ASKPASS-based instead of shell credential helper | Low |
| 19 | **Release automation** | Conventional-commit version bump, CHANGELOG generation, GitHub releases | Low |
| 20 | **Docker Compose services** | Local PostgreSQL/MySQL for learning store dev | Low |
