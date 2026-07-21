# CodeSentinel AI

AI-powered code quality orchestrator. Review PRs, auto-fix issues, audit repos, score quality (0–100), generate tests, enforce quality gates.

## Commands
- `npm run build` — `tsc`, emits to `dist/`
- `npm run typecheck` / `npm run lint` — both are `tsc --noEmit` (identical)
- `npm test` — `vitest run`, tests in `tests/` dir
- `npm run start` — `node dist/index.js` (requires build first)
- `node dist/index.js <mode>` — CLI entrypoint. Modes: `review`, `fix`, `audit`, `score`, `testgen`, `chat`, `gate`, `deadcode`, `describe`
- `codesentinel setup` — generates `.github/workflows/codesentinel.yml` in current project
- `codesentinel deadcode` — runs in-process, no AI call
- `--provider openai` — overrides ALL task models at once (sets default_model + all tasks)

## Architecture
- `Engine.fromInputs({configPath, overrides, secrets})` — CLI/Action entrypoint (factory at `src/engine/index.ts:142`)
- `new Engine(config, secrets, root, aiOverride?)` — programmatic entrypoint; `aiOverride` used to mock AI in tests
- `Engine.run()` dispatches by `config.mode` (review/fix/audit/score/testgen/chat/gate/describe)
- Fix-loop: after each attempt runs lint + tests to verify; bounded by `max_iterations` (default 5)
- Config resolution: `DEFAULT_CONFIG` → file (`codesentinel.config.json`) → CLI overrides. Merge via `mergeConfig()`.
- AIHub: factory pattern with lazy caching (`src/ai/index.ts:28-34`). Providers registered by name; unknown provider throws at runtime.
- AI retry: exponential backoff via `src/utils/retry.ts`. Transient errors (rate limits, 5xx) retried.

## Package
- Name: `@dharmiklathiya/codesentinel_ai` (npm), ESM (`"type": "module"`), Node >=18
- Dual export: `"."` for library (`dist/lib.js`), `"./cli"` for CLI (`dist/index.js`)
- Optional deps: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `probot` — only install what you use
- Runtime env: `OPENCODE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `OPENCODE_BASE_URL`

## GitHub Action
- `action.yml` — reusable composite action, `node20` runtime, outputs `score` + `findings`
- Slash commands on PRs (via `codesentinel-comment.yml`): `/review`, `/fix`, `/audit`, `/score`, `/testgen`, `/gate`, `/deadcode`
- Comment workflow checks out this repo separately into `codesentinel/` dir, builds it, then runs `node codesentinel/dist/index.js <mode>`
- Probot app entrypoint: `node dist/github/app.js`

## Testing
- Engine tests use `aiOverride` param to inject fake AI — no network required
- Tests are in `tests/*.test.ts`, vitest with `globals: true`
- `npm test` runs all; no special flags needed
- Analyzer tests use inline fixture files (not separate fixture dirs)

## Specs
- Default provider: opencode at `http://localhost:4096` (no key needed for local)
- Config file: `config/codesentinel.config.json` in this repo; users create their own in their project
- Cache: content-addressed LRU, 24h TTL, 500 entries, stored in `.codesentinel-cache/`
- Scoring: 4 dimensions (readability, maintainability, security, test_coverage), 0-100 each, weighted blend
- Security blend strategy: `min` (conservative), `avg`, `static-only`
- 19 built-in secret patterns (AWS, GitHub, JWT, DB connection strings, etc.) + custom via `config.secretPatterns`
