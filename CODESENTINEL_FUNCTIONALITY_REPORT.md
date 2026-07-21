# CodeSentinel AI — Complete Functionality Report

> **Purpose**: This document is a exhaustive, line-by-line functionality reference for the CodeSentinel AI project. It is designed so that any AI or engineer can read it and independently analyze the project for bugs, enhancements, missing features, and architectural improvements.

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| **Name** | `@dharmiklathiya/codesentinel_ai` |
| **Version** | `0.1.6` |
| **License** | MIT |
| **Language** | TypeScript (ES2022, Node16 modules) |
| **Runtime** | Node.js >= 18 (ESM) |
| **Build** | `tsc` |
| **Test** | Vitest |
| **Author** | Dharmik Lathiya |

**Summary**: CodeSentinel AI is an AI-powered code quality orchestrator. It reviews PRs, proposes/applies fixes, audits repositories, scores code quality (0-100), generates tests, detects dead code, and answers questions — all via a single configurable engine. It runs as a **CLI**, **GitHub Action**, or **Probot GitHub App**.

---

## 2. Directory Structure

```
CodeSentinel_AI/
├── .codesentinel-cache/          # On-disk analysis cache
├── .github/workflows/
│   ├── codesentinel.yml          # Self-host workflow (reusable Action)
│   └── codesentinel-comment.yml  # Slash-command workflow
├── config/
│   └── codesentinel.config.json  # Example configuration
├── dist/                         # Compiled JS output
├── prompts/
│   ├── audit.md                  # Audit prompt template
│   ├── describe.md               # PR description prompt
│   ├── fix.md                    # Auto-fix prompt
│   ├── review.md                 # Code review prompt
│   ├── score.md                  # Quality scoring prompt
│   └── testgen.md                # Test generation prompt
├── scripts/
│   └── setup.sh                  # One-command setup script
├── src/
│   ├── ai/                       # AI provider implementations
│   ├── analyzer/                 # Static + enhanced analysis
│   ├── cache/                    # File-based AI response cache
│   ├── config/                   # Configuration types, defaults, loader
│   ├── dashboard/                # HTTP dashboard server
│   ├── deadcode/                 # Dead code detector
│   ├── dismiss/                  # False positive management
│   ├── engine/                   # Central orchestrator
│   ├── gate/                     # Quality gate evaluator
│   ├── github/                   # GitHub Action + Probot app
│   ├── hook/                     # Pre-commit hook installer
│   ├── index.ts                  # CLI entrypoint
│   ├── lib.ts                    # Library entrypoint
│   ├── linters/                  # External linter integrations
│   ├── plugins/                  # Plugin loader + lifecycle
│   ├── prompts/                  # Prompt template registry
│   ├── scorer/                   # Quality scorer
│   ├── scanners/                 # 3rd-party secret scanners
│   ├── secrets/                  # Built-in secret scanner
│   ├── suggestions/              # GitHub committable suggestions
│   ├── testgen/                  # Test generator
│   └── utils/                    # File, git, logger, retry, HTML report
├── tests/                        # 7 test files
├── action.yml                    # GitHub Action manifest
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Entry Points

### 3.1 CLI Entry Point (`src/index.ts`, 439 lines)

**Shebang**: `#!/usr/bin/env node`

**Argument Parsing**: Uses `node:util` `parseArgs` (no external dependency).

**Top-level Commands** (handled before `parseArgs`):

| Command | Behavior |
|---------|----------|
| `codesentinel setup` | Creates `.github/workflows/codesentinel.yml` with the slash-command workflow. Overwrites if exists. Prints next steps. |
| `codesentinel init-hook` | Installs a pre-commit git hook at `.git/hooks/pre-commit` that runs `codesentinel gate` on staged files. |
| `codesentinel dashboard` | Starts the HTTP dashboard server on configured port (default 4173). Blocks forever with `await new Promise(() => {})`. |
| `codesentinel dismiss --rule <id> [reason]` | Dismisses a rule by ruleId. |
| `codesentinel dismiss --file <path> --line <n> [reason]` | Dismisses a specific finding (documented in usage, but code only handles `--rule` path). |

**CLI Flags**:

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--mode` | `-m` | string | "review" | Operational mode |
| `--config` | `-c` | string | — | Path to config file |
| `--max-iterations` | — | string | "5" | Max fix iterations |
| `--auto-fix` | — | boolean | false | Apply fixes automatically |
| `--scoring` / `--no-scoring` | — | boolean | true | Enable/disable scoring |
| `--test-gen` | — | boolean | false | Enable test generation |
| `--provider` | — | string | — | Override all task providers |
| `--ask` | — | string | — | Ask question (activates chat mode) |
| `--context` | — | string | — | Project context for prompts |
| `--dry-run` | — | boolean | false | Show fixes without writing |
| `--log-level` | — | string | "info" | debug/info/warn/error |
| `--min-score` | — | string | — | Gate min score |
| `--max-critical` | — | string | — | Gate max critical |
| `--max-high` | — | string | — | Gate max high |
| `--help` | — | boolean | false | Show help |
| `--version` | — | boolean | false | Show version |

**Positional arguments**: First positional is used as mode if `--mode` not provided.

**Provider override behavior**: When `--provider` is set, it creates a `providerModel` object and assigns it to ALL tasks (review, fix, audit, score, testgen, chat, describe).

**Dry-run behavior**: When `--dry-run` is set, `enable_auto_fix` is forced to `false`.

**Output formatting**: After engine run, prints:
1. Mode header: `=== CodeSentinel [mode] ===`
2. Dry-run notice (if applicable)
3. Summary string
4. Score breakdown (if present)
5. Findings list with severity, file, line, comment
6. Fix attempts with status (verified/applied/skipped)
7. Generated test files
8. Duration in ms

**Exit behavior**: Exits with code 1 if mode is "gate" and summary does not contain "PASSED".

**Fatal error handling**: `main().catch()` logs error and exits with code 1.

### 3.2 Library Entry Point (`src/lib.ts`, 37 lines)

Re-exports all public API:
- `Engine`, `configFromInputs`, `DEFAULT_CONFIG`, `mergeConfig`
- `loadConfig`, `AIHub`, `extractJson`, `ProviderUnavailableError`
- All key types: `Finding`, `ScoreBreakdown`, `CodeSentinelPlugin`, `EngineReport`, `Mode`, `Provider`, etc.

Package.json `main` field points to `dist/lib.js`.

### 3.3 GitHub Action Entry Point (`src/github/action.ts`, 108 lines)

**Input reading**: Reads `INPUT_*` environment variables (set by action.yml).

**Inputs processed**: `mode`, `max_iterations`, `enable_auto_fix`, `enable_scoring`, `enable_test_generation`, `project_context`, `test_runner`, `provider`, `config_path`.

**Output publishing** (`publishOutputs`):
1. Posts inline PR review comments via `GitHubReporter.postReviewComment()`
2. For audit mode: creates GitHub issues per finding
3. Writes `GITHUB_STEP_SUMMARY` (markdown summary)
4. Writes `GITHUB_OUTPUT` with `score` and `findings` count

**Summary format**: Markdown with mode header, summary, score breakdown, findings list.

### 3.4 Probot GitHub App (`src/github/app.ts`, 90 lines)

**Event handlers**:
- `pull_request.opened`: Logs PR number (no action)
- `issue_comment.created`: Parses slash commands, runs engine, posts reply

**Supported slash commands**: `/review`, `/fix`, `/audit`, `/score`, `/testgen`, `/ask <question>`

**Command parsing**: Regex `^\/(review|fix|audit|score|testgen|ask)\b\s*([\s\S]*)$`

**Response formatting**: Markdown with mode header, summary, score, comments list.

**Factory function** (`createApp()`): Requires `APP_ID` and `PRIVATE_KEY` env vars, creates Probot instance.

---

## 4. Engine (Core Orchestrator) (`src/engine/index.ts`, 904 lines)

### 4.1 Class: `Engine`

**Constructor parameters**:
1. `config: CodeSentinelConfig` — Full configuration
2. `secrets: RuntimeSecrets` — API keys and tokens
3. `root: string` — Working directory (default: `process.cwd()`)
4. `aiOverride?: Pick<AIHub, "complete" | "modelForTask">` — Optional AI mock (for tests)

**Internal components initialized**:
1. `AIHub` — AI provider router
2. `PromptRegistry` — Prompt template loader
3. `StaticAnalyzer` — 19 heuristic checks
4. `Scorer` — Quality scorer
5. `FileCache` — AI response cache
6. `PluginManager` — Plugin lifecycle
7. `DismissalManager` — False positive persistence
8. `DashboardServer` — HTTP dashboard

**Custom rules wiring**: Iterates `config.analyzer.customRules` and calls `this.analyzer.addCustomRule()` for each.

**AI provider health check** (`checkAIProvider`):
- For OpenCode: Fetches `${baseUrl}/v1/models` with 3s timeout. Logs REACHABLE/NOT REACHABLE.
- For others: Checks if API key env var is set. Logs SET/NOT SET.

**Factory method** (`Engine.fromInputs`):
- Takes `configPath`, `overrides`, `secrets`, `root`
- Calls `loadConfig()` then `new Engine()`

### 4.2 Report Interface

```typescript
interface EngineReport {
  mode: Mode;
  summary: string;
  findings: Finding[];
  score: ScoreBreakdown | null;
  comments: ReviewComment[];
  generatedTests: GeneratedTest[];
  fixAttempts: FixAttempt[];
  metrics: {
    filesAnalyzed: number;
    findingsBySeverity: Record<string, number>;
    durationMs: number;
  };
}
```

### 4.3 Mode Dispatch (`run()`)

1. Calls `this.init()` to load plugins
2. Records start time
3. Dispatches to mode-specific runner via switch
4. Sets `report.metrics.durationMs`
5. Calls `finalizeReport()` (tallies severity counts)
6. Writes report file if `output.writeReportFile` is true
7. Returns report

### 4.4 File Collection (`collectedFiles()`)

- **Review/Fix modes**: Uses `collectDiff()` to get only changed files (PR diffs). Filters out deleted files. Returns path, content, diff.
- **All other modes**: Uses `collectFiles()` with include/exclude globs. Returns path, content (no diff).

### 4.5 Shared Analysis Pass (`analyzeFiles()`)

Merges findings from 5 sources:
1. **Static analysis**: `this.analyzer.analyzeMany()` — 19 heuristic checks
2. **Plugin analysis**: `this.plugins.runAnalyze()` — custom plugin findings
3. **Secret scanning**: `scanSecrets()` — 11 built-in regex patterns
4. **External linters**: `runLinters()` — ESLint, Biome, Pylint (if enabled)
5. **3rd-party scanners**: `runThirdPartySecrets()` — gitleaks, trufflehog (if enabled)

Then filters through `this.dismissals.filterDismissed()`.

### 4.6 Mode: Review (`runReview()`)

1. Collects files (PR diffs)
2. Runs static + plugin + secret + linter + scanner analysis
3. Runs AI review per file (with caching)
4. Merges static and AI findings
5. Builds review comments (filtered by `include_positive_feedback` for praise)
6. Optionally computes score
7. Returns report

**AI review per file** (`aiReview`):
- For each file, checks cache (if enabled)
- Calls `callAI("review", "review", file)`
- Maps findings, adding `source: "ai"` and defaulting `file` to the file path
- Caches results on success

**`callAI()` method**:
- Prefers `file.diff` over `file.content` if diff is non-empty
- Renders prompt with: project_context, language, code, positive_feedback_instruction
- System message: "You are an expert code reviewer."
- Parses JSON from AI response via `extractJson()`

### 4.7 Mode: Fix (`runFix()`)

1. Collects files and runs analysis (same as review)
2. Filters actionable findings (excludes "praise")
3. Limits iterations to `min(max_iterations, actionable.length)`
4. For each iteration:
   - Calls `applyFix(finding, iteration)`
   - In dry-run or non-auto-fix mode: breaks after first iteration
5. Builds summary with fix success count

**`applyFix()` method**:
1. Reads file content from disk
2. Renders fix prompt with: severity, category, file, line, comment, suggestion, language, code, project_context
3. System message: "You apply minimal, safe code fixes."
4. Parses JSON: `{ fixed: boolean, explanation: string, content: string }`
5. If `fixed && enable_auto_fix && !dry_run`:
   - Writes fixed content to file
   - Runs verification (lint + test)

**Verification** (`runVerification`):
- For Jest: `npx jest --passWithNoTests`
- For Vitest: `npx vitest run`
- Returns true if command succeeds, false otherwise

### 4.8 Mode: Audit (`runAudit()`)

1. Collects all files (not just diffs)
2. Runs static analysis
3. Builds a repository snapshot (markdown format, truncated to 60,000 chars)
4. Renders audit prompt with: project_context, repository_snapshot
5. System message: "You are a principal engineer doing a repo audit."
6. Parses findings with: title, description, recommendation
7. Merges static + AI findings
8. Uses AI-provided summary or falls back to `buildSummary()`

### 4.9 Mode: Score (`runScoreMode()`)

1. Collects all files
2. Runs static analysis
3. Computes score via `computeScore()`

**`computeScore()` method**:
1. Computes static baseline via `scorer.scoreStatic()`
2. Checks cache for AI score
3. If not cached, calls `callScoreAI()`
4. Blends static + AI via `scorer.blendWithAI()`
5. On AI failure, returns static baseline only

**`callScoreAI()` method**:
- Concatenates all file contents (truncated to 40,000 chars)
- Renders score prompt
- System message: "You score code quality objectively."
- Returns: readability, maintainability, security, test_coverage, rationale

### 4.10 Mode: TestGen (`runTestgen()`)

1. Collects all files
2. Creates `TestGenerator` with config, AI, prompts
3. Calls `gen.generate(root, files)`
4. Returns report with generated tests

### 4.11 Mode: Chat (`runChat()`)

1. Collects all files
2. Builds context (truncated to 40,000 chars)
3. System message: "You are a helpful senior engineer answering questions about this codebase."
4. Returns AI response as summary

**Public `ask()` method**: Wrapper for `runChat()`, returns summary string directly.

### 4.12 Mode: Gate (`runGate()`)

1. Collects all files
2. Runs static analysis
3. Optionally computes score
4. Calls `evaluateGate(findings, score, config.gate)`
5. Returns PASSED/FAILED with reason
6. Records dashboard run

### 4.13 Mode: Describe (`runDescribe()`)

1. Collects files (with diffs)
2. Builds diff string (truncated to 60,000 chars)
3. Renders describe prompt
4. System message: "You write concise, structured PR descriptions."
5. Parses: title, description, type, breakingChanges, highlights, todo
6. Formats as markdown summary

### 4.14 Mode: Dead Code (`runDeadCode()`)

- Called directly from CLI (not through `run()`)
- Takes pre-collected files
- Calls `detectDeadCode(files)`

### 4.15 Report Writing (`writeReportFile()`)

- Creates report directory if needed
- Filename: `score.json` for score mode, `codesentinel-{mode}.json` otherwise
- Writes JSON report
- If `writeHtmlReport` is true, also writes HTML report via `renderHtmlReport()`

### 4.16 Enhanced Analysis Methods (Public)

| Method | Description |
|--------|-------------|
| `analyzeProgressive()` | Quick scan → deep analysis with staged escalation |
| `analyzeMultiFile()` | Cross-file dependency/import/pattern analysis |
| `compareAnalyses(prev, curr)` | Compare findings between two runs |
| `addCustomRule(rule)` | Add regex-based custom rule |
| `removeCustomRule(ruleId)` | Remove custom rule by ID |
| `updateConfidenceThresholds(thresholds)` | Update per-category confidence |
| `updateSeverityConfig(config)` | Update severity adjustment config |
| `getAnalyzerConfig()` | Get current analyzer config |
| `getAnalysisCacheStats()` | Get cache memory/disk/size stats |
| `clearAnalysisCache()` | Clear all cached analysis |

---

## 5. AI Provider System

### 5.1 Provider Interface (`src/ai/provider.ts`, 62 lines)

```typescript
interface AIProvider {
  name: string;
  complete(messages: ChatMessage[]): Promise<CompletionResult>;
}
```

**`ChatMessage`**: `{ role: "system" | "user" | "assistant"; content: string }`

**`CompletionResult`**: `{ content: string; provider: string; model: string; usage?: { promptTokens: number; completionTokens: number } }`

**`ProviderUnavailableError`**: Thrown when API key is missing.

**`extractJson()` utility**: Parses JSON from model responses. Handles:
- Direct JSON
- Markdown code fences (` ```json ... ``` `)
- Trimming whitespace

### 5.2 AIHub (`src/ai/index.ts`, 82 lines)

- Central router mapping tasks to providers
- Lazy initialization (providers created on first use)
- Caches provider instances
- Wraps calls with `retry()` for transient errors
- `modelForTask(task)`: Returns per-task model config (falls back to default)
- `complete(task, messages)`: Gets provider, calls complete, returns result

### 5.3 OpenCode Provider (`src/ai/opencode.ts`, 74 lines) — **DEFAULT**

- Uses native `fetch()` (no SDK)
- Default base URL: `http://localhost:4096`
- Custom URL via `OPENCODE_BASE_URL` env var
- API: OpenAI-compatible `/v1/chat/completions`
- Temperature: 0.2, Max tokens: 2048
- Detailed request/response logging
- Factory returns null if `OPENCODE_API_KEY` is missing

### 5.4 OpenAI Provider (`src/ai/openai.ts`, 61 lines)

- Lazy imports `openai` SDK
- Maps to chat completions API
- Temperature: 0.2, Max tokens: 2048
- Factory returns null if `OPENAI_API_KEY` is missing

### 5.5 Anthropic Provider (`src/ai/anthropic.ts`, 70 lines)

- Lazy imports `@anthropic-ai/sdk`
- Maps system messages to top-level `system` field
- Maps user/assistant roles to Anthropic format
- Handles content arrays
- Factory returns null if `ANTHROPIC_API_KEY` is missing

### 5.6 Gemini Provider (`src/ai/gemini.ts`, 56 lines)

- Lazy imports `@google/generative-ai`
- Concatenates all messages into a single prompt string
- Uses `generateContent` API
- Factory returns null if `GEMINI_API_KEY` is missing

---

## 6. Static Analyzer

### 6.1 Basic Analyzer (`src/analyzer/index.ts`, 562 lines)

**19 Heuristic Checks** (per line unless noted):

| # | Check | Severity | Category | Regex/Logic |
|---|-------|----------|----------|-------------|
| 1 | Hardcoded API keys | high | security | `/api[_-]?key\s*=\s*["'][A-Za-z0-9_\-]{16,}/i` |
| 2 | console.log in source (not test files) | low | smell | `/\bconsole\.(log\|debug)\(/` |
| 3 | eval() usage | critical | security | `/\beval\s*\(/` |
| 4 | TODO/FIXME/XXX markers | info | smell | `/(TODO\|FIXME\|XXX)\b/` |
| 5 | Hardcoded passwords | high | security | `/password\s*=\s*["'][^"']+["']/i` |
| 6 | process.exit() | medium | smell | `/\bprocess\.exit\s*\(/` |
| 7 | Loose equality (==) | medium | bug | `/[^!=!]==[^=]/` (excludes `===`) |
| 8 | var usage | low | smell | `/\bvar\s+\w+/` |
| 9 | Incorrect typeof comparison | medium | bug | `/typeof\s+\w+\s*===?\s*[^"']undefined/` |
| 10 | JSON.parse without try/catch | medium | bug | Checks 3 lines above for `try` |
| 11 | parseInt without radix | low | bug | `/\bparseInt\s*\([^,)]+\)/` (no second arg) |
| 12 | setTimeout/setInterval with string | high | security | `/\b(setTimeout\|setInterval)\s*\(\s*["']/` |
| 13 | new Date() without args | low | smell | `/\bnew\s+Date\s*\(\s*\)/` |
| 14 | Math.random() in security context | high | security | `Math.random()` + security-related word |
| 15 | await inside forEach | high | bug | `await` within 2 lines of `.forEach(` or `.each(` |
| 16 | Deep nesting (>4 levels) | medium | smell | Indent depth > 4 * 2 = 8 spaces |
| 17 | Magic numbers (2+ digit, not 0,1,-1,2) | low | smell | Line not starting with `//`, `import`, `export` |
| 18 | Bare await without try/catch | low | smell | `await` outside try blocks |
| 19 | Long functions (>50 lines) | medium | smell | Tracks function start to closing brace |

**Comment detection**: Lines starting with `//`, `/*`, or `*` are considered comments and some checks are skipped.

**`analyzeMany()`**: Calls `analyze()` for each file, flattens results.

### 6.2 Enhanced Analyzer (`src/analyzer/enhanced.ts`, 624 lines)

**Dynamic Severity Adjustment**:
- High-risk patterns (`src/`, `lib/`, `app/`): 1.3x severity multiplier
- Low-risk patterns (`test/`, `tests/`, `__tests__/`, `.test.`, `.spec.`): 0.7x multiplier
- History-based adjustment: Frequently changed files get 1.5x multiplier

**Confidence Thresholds** (per category, 0-1):
- security: 0.7, bug: 0.6, performance: 0.5, smell: 0.4, style: 0.3
- Findings below threshold are filtered out

**Custom Rules**: User-defined regex patterns with:
- Unique ID, name, pattern (regex), severity, category, comment, suggestion
- Optional: filePatterns (glob), confidence threshold

**Analysis Context**: Tracks file histories for history-based adjustment.

### 6.3 Progressive Analyzer (`src/analyzer/progressive.ts`, 817 lines)

**Staged Analysis**:
1. **Quick scan**: Critical and high severity only
2. **Standard scan**: All rules except experimental (if quick scan findings exceed threshold)
3. **Deep scan**: All rules including experimental

**Auto-escalation**: If quick scan finds >5 issues (configurable), automatically escalates.

**Multi-File Analysis**:
1. **Dependency graph**: Detects circular dependencies, high fan-in/fan-out
2. **Import/export analysis**: Detects unused imports
3. **Pattern analysis**: Detects common patterns across files
4. **Duplicate code detection**: Line-based similarity comparison

### 6.4 Analysis Cache (`src/analyzer/cache.ts`, 417 lines)

**Two-tier cache**: Memory (Map) + Disk (JSON files)

**Cache key**: SHA-256 hash of file content + config hash

**Features**:
- TTL-based expiry (default 24 hours)
- Max entries: 1000
- LRU eviction
- `compare()` method: Computes new/fixed/unchanged/modified findings between runs
- `generateConfigHash()`: Deterministic hash from config objects

---

## 7. Scorer (`src/scorer/index.ts`, 161 lines)

### 7.1 Score Dimensions & Weights

| Dimension | Weight | How Computed |
|-----------|--------|--------------|
| Readability | 0.25 | Comment ratio bonus + long line penalty |
| Maintainability | 0.30 | 100 - (smell/style penalty / 2) |
| Security | 0.25 | 100 - (security finding penalties) |
| Test Coverage | 0.20 | Fraction of source files with sibling test files |

### 7.2 Severity Penalties

| Severity | Penalty |
|----------|---------|
| critical | 30 |
| high | 16 |
| medium | 8 |
| low | 4 |
| info | 2 |

### 7.3 Readability Heuristic

- Counts comment lines (starting with `//`, `#`, `/*`, `*`)
- Counts lines >120 chars
- Score: `100 - (longLines * 2) + (commentRatio * 20)`
- Clamped to minimum 20

### 7.4 Coverage Heuristic

- Identifies test files (`.test.` or `.spec.` in name)
- For each source file, checks if a test file with matching base name exists
- Returns `(covered / total_source_files) * 100`

### 7.5 AI Blending (`blendWithAI`)

- Readability: Uses AI score (subjective, AI is better)
- Maintainability: Uses AI score
- Security: Takes `Math.min(ai, baseline)` — static is more reliable
- Test coverage: Uses AI score

### 7.6 Overall Score

`overall = clamp(readability * 0.25 + maintainability * 0.30 + security * 0.25 + test_coverage * 0.20)`

All values clamped to 0-100.

---

## 8. Test Generator (`src/testgen/index.ts`, 149 lines)

### 8.1 Function Detection (`detectFunctions`)

- Regex: `/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm`
- Skips test/spec files
- For each source file, checks if a test file with matching base name exists
- Returns: `{ name, line, file, hasTest }`

### 8.2 Test Generation

- For each file with untested functions:
  - Renders testgen prompt with: test_runner, test_framework, file, language, code, project_context
  - System message: "You generate precise unit tests."
  - Parses JSON: `{ test_file_path?, content }`
  - Writes test file to disk
  - Returns: `{ file, testFilePath, content }`

### 8.3 Test Path Conventions

- **Jest**: `__tests__/<filename>.test.ts`
- **Vitest**: `<filename>.test.ts` (co-located)

### 8.4 `testExists()` utility

Checks if a `.test.ts` file exists for a given source path.

---

## 9. Configuration System

### 9.1 Types (`src/config/types.ts`, 278 lines)

**Modes**: `review`, `fix`, `audit`, `score`, `testgen`, `chat`, `gate`, `describe`

**Providers**: `openai`, `anthropic`, `gemini`, `opencode`

**Test runners**: `jest`, `vitest`

**Severities**: `info`, `low`, `medium`, `high`, `critical`

**Finding categories**: `bug`, `security`, `performance`, `smell`, `style`, `praise`

**Finding sources**: `static`, `ai`, `linter`, `scanner`

**Key interfaces**:
- `CodeSentinelConfig` — 20+ fields covering all configuration
- `ModelConfig` — `{ provider, model }`
- `OutputConfig` — GitHub comments, issues, report file, HTML report, report dir
- `AnalyzerConfig` — Enhanced analysis, severity adjustment, confidence, custom rules, progressive, multi-file
- `GateConfig` — minScore, maxCritical, maxHigh, blockOnSecurity, blockOnBugs
- `SecretPattern` — id, name, regex, severity, message, suggestion
- `Dismissal` — file, line, ruleId, reason, dismissedAt
- `LinterConfig` — enabled, tools, args
- `DashboardConfig` — port, dataDir
- `RuntimeSecrets` — All API keys (never logged)

### 9.2 Defaults (`src/config/defaults.ts`, 228 lines)

**Default config**:
- Mode: `review`
- Max iterations: 5
- Auto-fix: disabled
- Scoring: enabled
- Test generation: disabled
- Positive feedback: included
- Provider: `opencode` for all tasks
- Test runner: `vitest`
- Include: `**/*.{ts,tsx,js,jsx,py,go,java,rb}`
- Exclude: `node_modules/**`, `dist/**`, `build/**`, `coverage/**`, `.git/**`, `**/*.test.*`, `**/*.spec.*`
- Report dir: `codesentinel-reports`
- Cache: enabled, dir: `.codesentinel-cache`
- Secret scanner: disabled
- Dashboard port: 4173
- Linters: ESLint, Biome, Pylint (enabled by default)

**11 built-in secret patterns**: AWS key, AWS secret, GitHub token, Slack token, SSH key, JWT, PostgreSQL conn, Redis conn, private key header, npm token, generic API key.

**Gate defaults**: minScore: 0, maxCritical: 10, maxHigh: 50, blockOnSecurity: false, blockOnBugs: false.

### 9.3 Config Loader (`src/config/index.ts`, 215 lines)

**`loadConfig()`**:
1. Starts with `DEFAULT_CONFIG`
2. If configPath provided, reads and parses JSONC file
3. Merges config file with overrides via `mergeConfig()`
4. Validates with Zod

**`configFromInputs()`**: Normalizes string-typed GitHub Action inputs to config type.

**JSONC parser**: Strips single-line (`//`) and multi-line (`/* */`) comments outside of strings.

**`mergeConfig()`**: Deep-merges two configs:
- Top-level: shallow spread
- Nested objects: spread per key
- Arrays (include, exclude, plugins): concatenated
- Secret patterns: override (not merge)
- Custom rules: concatenated

---

## 10. GitHub Reporter (`src/github/reporter.ts`, 75 lines)

**Minimal REST client** using `fetch()` (no SDK dependency).

**Methods**:
1. `postReviewComment({ body, file?, line?, commitId? })`: Posts inline PR comment with file/line/commit, or falls back to issue comment
2. `postIssueComment(body)`: Posts top-level PR/issue comment
3. `createIssue(title, body)`: Creates a GitHub issue

**Auth**: Bearer token, API version 2022-11-28.

---

## 11. Utilities

### 11.1 File Utilities (`src/utils/files.ts`, 140 lines)

| Function | Description |
|----------|-------------|
| `globToRegExp(pattern)` | Converts glob patterns to RegExp. Supports `**`, `*`, `?`, `{a,b}` |
| `walk(dir)` | Recursively lists files (non-recursive for node_modules, .git) |
| `readIgnoreFile(dir)` | Reads `.codesentinelignore` (gitignore-style) |
| `collectFiles(root, include, exclude)` | Filters files by include/exclude globs + ignore patterns |
| `readText(path)` | Reads UTF-8 file, returns empty string on error |
| `languageOf(path)` | Maps extensions to language labels: ts→TypeScript, js→JavaScript, py→Python, go→Go, java→Java, rb→Ruby, etc. |
| `ensureDir(dir)` | Creates directories recursively (`recursive: true`) |

### 11.2 Git Utilities (`src/utils/git.ts`, 106 lines)

| Function | Description |
|----------|-------------|
| `git(args, cwd?)` | Runs git commands via `child_process.execFile` |
| `collectDiff(sha?, root?)` | Collects changed files for a PR/branch. Uses `GITHUB_BASE_REF` env, falls back to `origin/main`, `origin/master`, or `HEAD`. Returns `DiffFile[]` with path, diff, content, status. |

**Diff status detection**: Checks `git diff --name-status` for added/modified/deleted/renamed.

### 11.3 Logger (`src/utils/logger.ts`, 38 lines)

- Levels: debug, info, warn, error
- Format: `[codesentinel:level] message`
- Default level: info
- Override via `CODESENTINEL_LOG_LEVEL` env var

### 11.4 Retry (`src/utils/retry.ts`, 59 lines)

- Default: 3 attempts, 1s base delay
- Exponential backoff: `delay * 2^attempt`
- Retries on: rate limit, 429, 502, 503, timeout, ECONNRESET, overloaded
- Custom `shouldRetry` predicate supported

### 11.5 HTML Report (`src/utils/html-report.ts`, 206 lines)

**Self-contained HTML** with inline CSS. Sections:
1. Summary cards: findings count, quality score ring, fix attempts, generated tests
2. Severity distribution bar chart
3. Category breakdown bar chart
4. Findings table (severity, category, file, comment, suggestion)
5. Fix attempts table (iteration, file, status, explanation)
6. Generated tests table (source, test file)

**Score color coding**: >=80 green, >=60 amber, >=60 orange, <40 red.

**XSS prevention**: `escapeHtml()` escapes `&`, `<`, `>`, `"`.

---

## 12. Feature Modules

### 12.1 Secret Scanner (`src/secrets/index.ts`, 43 lines)

- Applies configurable regex patterns per line
- Skips comment lines
- Supports case-insensitive via `(?i)` prefix in regex
- Returns findings with pattern's severity and message

### 12.2 External Linters (`src/linters/index.ts`, 130 lines)

**Supported tools**:
| Tool | Detection | Output Format |
|------|-----------|---------------|
| ESLint | `which eslint` | JSON (`--format json`) |
| Biome | `which biome` | JSON diagnostics |
| Pylint | `which pylint` | JSON (`--output-format=json`) |

Each tool runs via `execSync`, parses JSON output, maps to `Finding[]` with `source: "linter"`.

**Configuration**: Per-tool extra CLI args via `config.linters.args`.

### 12.3 3rd-Party Secret Scanners (`src/scanners/index.ts`, 102 lines)

| Tool | Command | Detection |
|------|---------|-----------|
| gitleaks | `gitleaks detect --no-git --report-format json` | `which gitleaks` |
| trufflehog | `trufflehog filesystem --json` | `which trufflehog` |

Parses JSON output, maps to `Finding[]` with `source: "scanner"`.

### 12.4 Quality Gate (`src/gate/index.ts`, 37 lines)

**`evaluateGate(findings, score, config)`**:
- Checks: critical count <= maxCritical
- Checks: high count <= maxHigh
- If blockOnSecurity: fails on any security finding
- If blockOnBugs: fails on any bug finding
- If minScore > 0: checks score.overall >= minScore
- Returns: `{ passed: boolean, reason: string }`

### 12.5 Committable Suggestions (`src/suggestions/index.ts`, 40 lines)

- `formatSuggestion()`: Wraps finding + code into GitHub suggestion code fence
- `buildSuggestionsComment()`: Formats up to 10 findings with context lines

### 12.6 Dead Code Detector (`src/deadcode/index.ts`, 96 lines)

- Parses all exports: function, const, let, var, class, interface, type, enum, named exports
- Parses all imports across files
- Reports exports never imported by any other file
- Skips default exports

### 12.7 Dismissal Manager (`src/dismiss/index.ts`, 74 lines)

- Persists dismissals to JSON file
- `dismissByFinding(file, line, ruleId, reason)`: Dismiss specific finding
- `dismissByRule(ruleId, reason)`: Dismiss all findings for a rule
- `filterDismissed(findings)`: Removes dismissed findings from results
- `isDismissed(finding)`: Checks if a finding is dismissed

### 12.8 Dashboard Server (`src/dashboard/index.ts`, 148 lines)

- HTTP server using `node:http` `createServer`
- Embedded single-page HTML dashboard
- Chart.js visualizations:
  - Severity bar chart
  - Category doughnut chart
  - Score trend line chart
  - Recent runs table
- Data persisted to `.codesentinel-dashboard/dashboard.json`
- API endpoint: `GET /api/data`
- `recordRun()`: Saves run data (timestamp, mode, findings, score, duration)

### 12.9 Pre-Commit Hook (`src/hook/index.ts`, 42 lines)

- Writes shell script to `.git/hooks/pre-commit`
- Runs `codesentinel gate` on staged files
- Configurable thresholds

### 12.10 Plugin System (`src/plugins/index.ts`, 91 lines)

- Dynamically imports plugin modules from `config.plugins`
- Each plugin must export `CodeSentinelPlugin`:
  - `name: string`
  - `init?()`: Called on load
  - `analyze?(files)`: Returns `Finding[]`
  - `score?(findings)`: Returns score adjustments
- `runAnalyze()`: Collects findings from all plugins in parallel
- `runScore()`: Chains score adjustments sequentially

### 12.11 Prompt Registry (`src/prompts/index.ts`)

- Loads prompt templates from `prompts/` directory
- Supports custom prompt paths via `config.custom_prompt_paths`
- Renders prompts with `{{variable}}` syntax
- 6 prompt templates: review, fix, audit, score, testgen, describe

---

## 13. Prompt Templates

### 13.1 Review Prompt (`prompts/review.md`)

**Variables**: `{{project_context}}`, `{{positive_feedback_instruction}}`, `{{language}}`, `{{code}}`

**Output**: JSON with `summary` + `findings` array (severity, category, file, line, comment, suggestion)

**Priority**: bugs > security > performance > smells

### 13.2 Fix Prompt (`prompts/fix.md`)

**Variables**: `{{project_context}}`, `{{severity}}`, `{{category}}`, `{{file}}`, `{{line}}`, `{{comment}}`, `{{suggestion}}`, `{{language}}`, `{{code}}`

**Output**: JSON with `fixed` boolean, `explanation`, full updated `content`

### 13.3 Audit Prompt (`prompts/audit.md`)

**Variables**: `{{project_context}}`, `{{repository_snapshot}}`

**Output**: JSON with `summary` + `findings` (title, description, recommendation)

### 13.4 Score Prompt (`prompts/score.md`)

**Variables**: `{{project_context}}`, `{{language}}`, `{{code}}`

**Output**: JSON with readability, maintainability, security, test_coverage (0-100), rationale

### 13.5 TestGen Prompt (`prompts/testgen.md`)

**Variables**: `{{test_runner}}`, `{{test_framework}}`, `{{project_context}}`, `{{file}}`, `{{language}}`, `{{code}}`

**Output**: JSON with `test_file_path` and `content`

### 13.6 Describe Prompt (`prompts/describe.md`)

**Variables**: `{{project_context}}`, `{{diff}}`

**Output**: JSON with title, description, type, breakingChanges, highlights, todo

---

## 14. GitHub Workflows

### 14.1 Self-Host Workflow (`codesentinel.yml`)

**Triggers**: PR opened/synced/reopened, issue comments, manual dispatch

**Steps**:
1. Checkout repo
2. Setup Node 20
3. Run CodeSentinel Action

### 14.2 Slash-Command Workflow (`codesentinel-comment.yml`)

**Triggers**: Issue comment matching `/review`, `/fix`, `/audit`, `/score`, `/testgen`

**Steps**:
1. Extract command from comment
2. Get PR info (base ref, head SHA)
3. Checkout PR head
4. Checkout CodeSentinel repo
5. Build CodeSentinel
6. Post loading comment
7. Run CodeSentinel CLI
8. Update loading comment with results

---

## 15. Test Coverage

### 15.1 Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `analyzer.test.ts` | 12 | Basic static analyzer: all 19 checks |
| `analyzer-enhanced.test.ts` | 30 | Enhanced analyzer, cache, progressive, multi-file |
| `scorer.test.ts` | 5 | Score range, penalties, blending, clamping |
| `engine.test.ts` | 6 | Config loading, score mode, review, audit, fix |
| `files.test.ts` | 6 | Ignore files, exclusion, config merging |
| `retry.test.ts` | 5 | Success, retry on transient, exhaustion, no retry, custom predicate |
| `html-report.test.ts` | 9 | HTML output, score card, empty findings, escaping, tables |

### 15.2 Test Infrastructure

- **Framework**: Vitest with globals
- **Environment**: Node
- **Mock strategy**: `fakeAI()` function for engine tests (avoids network calls)
- **Git tests**: `engine.test.ts` creates real git repos with branches

---

## 16. Dependencies

### Runtime
- `zod` ^3.23.8 — Config validation

### Optional (peer dependencies)
- `openai` ^4.56.0 — OpenAI SDK
- `@anthropic-ai/sdk` ^0.27.0 — Anthropic SDK
- `@google/generative-ai` ^0.21.0 — Gemini SDK
- `probot` ^13.3.0 — GitHub App framework

### Dev
- `typescript` ^5.5.0
- `vitest` ^2.0.0
- `@types/node` ^22.0.0

---

## 17. Known Limitations & Potential Issues

> This section documents observable issues and limitations found during code review. An AI analyzing this project should verify and expand on these.

### 17.1 CLI / Entry Point Issues

1. **`dismiss --file --line` not implemented**: Help text shows `--file <path> --line <n>` syntax but code only handles `--rule`.
2. **Gate exit check is fragile**: `!report.summary.includes("PASSED")` — could break if summary text changes.
3. **`--provider` override doesn't set `default_model`**: Only sets `models.*` but `default_model` stays as opencode.
4. **No `deadcode` in slash-command workflow**: The workflow template doesn't include `/deadcode`.
5. **Dashboard command blocks with `await new Promise(() => {})`**: No graceful shutdown on SIGINT.

### 17.2 Engine Issues

1. **`collectedFiles()` for review/fix uses `collectDiff(undefined, root)`**: The first argument (sha) is always undefined, relying on env vars or defaults.
2. **AI review is sequential**: `aiReview()` processes files one at a time, no parallelism.
3. **Fix mode writes files but doesn't re-analyze**: After applying a fix, doesn't re-run analysis to verify the fix didn't introduce new issues.
4. **`runVerification()` only runs tests, not linting**: Despite the comment saying "lint + tests".
5. **Report `findingsBySeverity` is set in `finalizeReport()` but also set during mode runners**: The mode runners set it to `{}` initially, then `finalizeReport()` overwrites.

### 17.3 Analyzer Issues

1. **Deep nesting detection**: Uses `Math.floor(indent / 2)` which assumes 2-space indentation. Won't work for 4-space or tab-based indentation.
2. **Magic number regex**: `(?<![a-zA-Z_])\b(?!0\b|1\b|-1\b|2\b)\d{2,}\b(?![a-zA-Z_])` — might flag version numbers, port numbers, etc.
3. **JSON.parse try/catch detection**: Only checks 3 lines above, might miss try blocks further up.
4. **await in forEach detection**: Checks 2 lines above, might miss patterns.
5. **Long function detection**: Regex `/(?:function|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))\s+(\w+)?/` won't catch arrow functions assigned to variables without explicit function keyword.
6. **Enhanced analyzer default is disabled**: `enableEnhancedAnalysis: false` by default, so enhanced features are never used unless explicitly configured.

### 17.4 Scorer Issues

1. **Coverage heuristic**: Only checks `.test.ts` extension, not `.test.js`, `.spec.ts`, etc.
2. **Readability heuristic**: Rewards comment ratio but doesn't check comment quality (e.g., commented-out code).
3. **Security blending**: Takes `Math.min(ai, baseline)` which always favors the lower score, even if AI is more accurate.

### 17.5 Test Generator Issues

1. **Function detection is regex-only**: Won't detect arrow functions, class methods, or exported constants.
2. **Test path for Vitest**: Always uses `.test.ts` regardless of source file extension.
3. **No error handling for AI failures**: If AI returns invalid JSON, `extractJson` might throw.

### 17.6 Configuration Issues

1. **JSONC parser is minimal**: Doesn't handle multi-line strings, escaped quotes in comments, or strings containing `//`.
2. **mergeConfig for secretPatterns**: Completely overrides instead of merging — intentional but could surprise users.
3. **Config validation**: Zod validation exists but error messages might be cryptic.

### 17.7 GitHub Integration Issues

1. **Reporter doesn't handle pagination**: If there are many comments, only first page is processed.
2. **Action doesn't pass `GITHUB_PR_NUMBER`**: The workflow template doesn't set this env var.
3. **App doesn't handle edited comments**: Only responds to `created` events.
4. **No rate limiting**: Reporter makes API calls without throttling.

### 17.8 Caching Issues

1. **FileCache TTL is 24 hours**: No way to invalidate cache when code changes significantly.
2. **AnalysisCache key includes config hash**: Any config change invalidates all cache entries.
3. **No cache size limit for FileCache**: Could grow unbounded on disk.

### 17.9 Security Concerns

1. **Secret patterns regex**: The `private-key-header` pattern uses `——` (em dashes) instead of `--` (double hyphens), so it will never match.
2. **Eval check**: Only checks for `eval(`, not `new Function(` or `setTimeout` with variable (not string).
3. **Hardcoded password check**: Simple regex might miss obfuscated passwords.

### 17.10 Missing Features

1. **No `--fix` flag in slash-command workflow**: Only `/review`, `/fix`, `/audit`, `/score`, `/testgen` are supported, not `/gate` or `/deadcode`.
2. **No incremental analysis**: Always analyzes all files from scratch.
3. **No SARIF output**: Common format for code scanning tools.
4. **No GitHub check runs**: Only posts comments, doesn't create check runs with annotations.
5. **No PR status checks**: Doesn't set commit status based on gate results.
6. **No multi-language prompt optimization**: Same prompt template for all languages.
7. **No streaming AI responses**: Waits for full response before processing.
8. **No parallel file analysis**: Files are processed sequentially.
9. **No fix confidence scoring**: All fixes are treated equally.
10. **No learning from dismissed findings**: Dismissals don't improve future analysis.

---

## 18. Data Flow Diagram

```
User Input (CLI/Action/App)
    │
    ▼
Engine.fromInputs()
    │
    ▼
loadConfig() → DEFAULT_CONFIG → config file → overrides → mergeConfig()
    │
    ▼
Engine Constructor
    ├── AIHub (provider router)
    ├── PromptRegistry (template loader)
    ├── StaticAnalyzer (19 checks + enhanced)
    ├── Scorer (weighted scoring)
    ├── FileCache (AI response cache)
    ├── PluginManager (lifecycle)
    ├── DismissalManager (false positives)
    └── DashboardServer (HTTP)
    │
    ▼
engine.run()
    │
    ├── init() → load plugins
    ├── dispatch to mode runner
    │   ├── Review: collectDiff → analyzeFiles → aiReview → merge → score
    │   ├── Fix: collectDiff → analyzeFiles → aiReview → loop applyFix → verify
    │   ├── Audit: collectFiles → analyzeFiles → AI snapshot analysis
    │   ├── Score: collectFiles → analyzeFiles → computeScore
    │   ├── TestGen: collectFiles → detectFunctions → AI generate
    │   ├── Chat: collectFiles → AI answer
    │   ├── Gate: collectFiles → analyzeFiles → evaluateGate
    │   └── Describe: collectFiles → AI describe
    ├── finalizeReport()
    ├── writeReportFile() (JSON + optional HTML)
    └── return EngineReport
```

---

## 19. Configuration Hierarchy

```
DEFAULT_CONFIG (hardcoded)
    │
    ▼
Config file (codesentinel.config.json, JSONC)
    │
    ▼
CLI overrides (--mode, --provider, --auto-fix, etc.)
    │
    ▼
mergeConfig() (deep merge with special handling)
    │
    ▼
Final CodeSentinelConfig
```

---

## 20. File Manifest (All Source Files)

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | 439 | CLI entrypoint |
| `src/lib.ts` | 37 | Library exports |
| `src/engine/index.ts` | 904 | Central orchestrator |
| `src/config/types.ts` | 278 | Type definitions |
| `src/config/defaults.ts` | 228 | Defaults + mergeConfig |
| `src/config/index.ts` | 215 | Config loader + JSONC parser |
| `src/ai/provider.ts` | 62 | Provider interface + extractJson |
| `src/ai/index.ts` | 82 | AIHub router |
| `src/ai/opencode.ts` | 74 | OpenCode provider |
| `src/ai/openai.ts` | 61 | OpenAI provider |
| `src/ai/anthropic.ts` | 70 | Anthropic provider |
| `src/ai/gemini.ts` | 56 | Gemini provider |
| `src/analyzer/index.ts` | 562 | StaticAnalyzer (19 checks) |
| `src/analyzer/enhanced.ts` | 624 | EnhancedAnalyzer |
| `src/analyzer/progressive.ts` | 817 | ProgressiveAnalyzer |
| `src/analyzer/cache.ts` | 417 | AnalysisCache |
| `src/scorer/index.ts` | 161 | Quality scorer |
| `src/testgen/index.ts` | 149 | Test generator |
| `src/cache/index.ts` | 51 | FileCache |
| `src/plugins/index.ts` | 91 | Plugin manager |
| `src/github/action.ts` | 108 | GitHub Action entrypoint |
| `src/github/app.ts` | 90 | Probot GitHub App |
| `src/github/reporter.ts` | 75 | GitHub REST client |
| `src/secrets/index.ts` | 43 | Built-in secret scanner |
| `src/linters/index.ts` | 130 | External linter integrations |
| `src/scanners/index.ts` | 102 | 3rd-party secret scanners |
| `src/gate/index.ts` | 37 | Quality gate evaluator |
| `src/suggestions/index.ts` | 40 | Committable suggestions |
| `src/deadcode/index.ts` | 96 | Dead code detector |
| `src/dismiss/index.ts` | 74 | Dismissal manager |
| `src/dashboard/index.ts` | 148 | Dashboard server |
| `src/hook/index.ts` | 42 | Pre-commit hook installer |
| `src/prompts/index.ts` | — | Prompt registry |
| `src/utils/files.ts` | 140 | File utilities |
| `src/utils/git.ts` | 106 | Git utilities |
| `src/utils/logger.ts` | 38 | Logger |
| `src/utils/retry.ts` | 59 | Retry utility |
| `src/utils/html-report.ts` | 206 | HTML report generator |
| **Total** | **~6,500+** | |

---

*Report generated for CodeSentinel AI v0.1.6. This document is intended for analysis by AI systems and human reviewers to identify bugs, propose enhancements, and plan new features.*
