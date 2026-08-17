# CodeSentinel AI

AI-powered code quality orchestrator. Review PRs, auto-fix issues, audit repos, score quality (0–100), generate tests, enforce quality gates.

## Commands
- `npm run build` — `tsc`, emits to `dist/`
- `npm run build:action` — `tsc` + `ncc` bundle → `dist/action-bundle/` (ESM, `index.mjs` entry) + `scripts/postbundle.mjs` renames entry/prunes zod test bloat
- `npm run typecheck` / `npm run lint` — both are `tsc --noEmit` (identical)
- `npm test` — `vitest run`, tests in `tests/` dir
- `npm run start` — `node dist/index.js` (requires build first)
- `node dist/index.js <mode>` — CLI entrypoint. Modes: `review`, `fix`, `audit`, `score`, `testgen`, `chat`, `gate`, `deadcode`, `describe`
- `codesentinel setup` — generates `.github/workflows/codesentinel.yml` in current project
- `codesentinel plan` — generates implementation plan from issue (reads `INPUT_ISSUE_TITLE` / `INPUT_ISSUE_BODY` from env)
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
- Runtime env: `OPENCODE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GITHUB_TOKEN`, `OPENCODE_BASE_URL`, `OPENCODE_CLI_TIMEOUT_MINUTES` (opencode run CLI timeout, default 20), `CODESENTINEL_GIT_NAME`/`CODESENTINEL_GIT_EMAIL` (git identity for auto-fix commits; default "Dharmik Lathiya <dharmiklathiya.it@gmail.com>" in this repo's workflows, "CodeSentinel Bot" fallback in engine/templates)

## GitHub Action
- `action.yml` — pre-built JS action (NOT composite): `using: node20`, `main: dist/action-bundle/index.mjs`, outputs `score` + `findings`
  - Zero setup: no `npm ci`, no build at runtime — runs the committed ncc bundle directly (~0s vs ~30s before)
  - Build: `npm run build:action`; committed to the repo (action references it by path)
  - Bundle notes: `better-sqlite3` is a native module — keep its import computed (`"better-" + "sqlite3"` in `src/learning/db.ts`) so ncc doesn't inline 17MB of prebuilds; avoid `resolve(root, x.test.ts)` in bundler-reachable code (ncc rewrites it to a bundle-relative path — use `join`)
- Reusable workflows shipped in `.github/workflows/` (`review.yml`, `autofix.yml`): users wire with 5 lines — `uses: Dharmik-Lathiya/CodeSentinel_AI/.github/workflows/review.yml@v0.12.1` + `secrets: inherit`. Ready-to-copy templates in `examples/`
- Slash commands on PRs/issues (via `codesentinel.yml`): `/review`, `/fix`, `/audit`, `/score`, `/testgen`, `/gate`, `/deadcode`, `/describe`, `/plan`, `/ask`
- Auto-analyzes new issues: posts implementation plan + clarifying questions, then `Reply with /fix to start implementation`
- PR comment posting needs `GITHUB_PR_NUMBER` env — set from `github.event.pull_request.number || github.event.issue.number` (issue_comment events carry the PR number in `issue.number`)
- Secret `CODESENTINEL_GITHUB_TOKEN`: optional PAT for git push (higher permissions, overrides GITHUB_TOKEN)
- Probot app entrypoint: `node dist/github/app.js`

### Performance (why ~20min vs competitor's ~60min)
1. **Pre-built bundle committed** — no `npm ci`, no tsc in CI (JS action `main: dist/action-bundle/index.mjs`), saves ~30s/run
2. **Single AI pass** — batched file reviews instead of per-file loops where possible
3. **No pnpm** — works with npm, no version compatibility issues
4. **GitHub token** — `CODESENTINEL_GITHUB_TOKEN` PAT avoids rate limits on protected branches

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
