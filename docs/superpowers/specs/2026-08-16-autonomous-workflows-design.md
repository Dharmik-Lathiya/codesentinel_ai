# Autonomous Workflow Suite Design

Date: 2026-08-16
Status: Approved

## Goal

Give CodeSentinel the same autonomous-agent workflow suite as the competitor
(opencode-ai-reviewer): a daily scheduled audit that runs the verification suite
and files labeled, deduplicated GitHub issues for AI-audit findings; an hourly
orchestrator that auto-merges ready PRs and drives open issues to fix; and a
weekly self-improvement workflow. Supported by reusable bash helper scripts and
engine-level support for labeled, deduped issue creation.

## Reference

The competitor pattern (from `opencode-ai-reviewer-main`):
- `.github/workflows/scheduled-audit.yml` — daily cron audit with
  `audit_create_issues: true`, `audit_auto_fix: true`, `audit_labels`, and a
  label-ensure step
- `.github/workflows/hourly-orchestrator.yml` — hourly: merge mergeable PRs,
  AI-resolve conflicts, drive issues to `/fix`
- `.github/workflows/self-improvement.yml` — weekly AI self-improvement PR
- `.github/scripts/` — `setup-opencode.sh`, `post-or-update-comment.sh`,
  `find-or-create-autofix-pr.sh`, `gather-context.sh`

## Components

### 1. `audit.yml` — Daily codebase audit (reusable workflow)

- Triggers: `schedule` cron `0 2 * * *` + `workflow_dispatch` (with
  `audit_category` string input)
- Permissions: `contents: write`, `pull-requests: write`, `issues: write`,
  `actions: read`
- Concurrency guard (group `codesentinel-audit`, `cancel-in-progress: false`)
- Steps:
  1. Checkout (fetch-depth 0)
  2. Setup Node (node-version-file `.nvmrc` fallback 22) + `npm ci || npm install`
  3. **Verification suite**: run `npm run lint`, `npm test`, `npm run build`;
     each records pass/fail to `$GITHUB_ENV`; failures create/update issue
     `[Audit] Daily verification failed — YYYY-MM-DD` with a status table and
     log tails (via `post-or-update-comment.sh` pattern using a marker)
  4. **AI audit**: `uses: <owner>/<repo>@<version>` with `mode: audit`,
     `audit_create_issues: true`, `audit_auto_fix: true`,
     `audit_labels: audit,autofix-trigger`, `audit_target_dirs` input,
     `github_token`, `git_user_name/email`
  5. Ensure labels exist (`gh label create ... --force || true`)
- Accepts `GH_PAT || GITHUB_TOKEN` secrets

### 2. Engine changes — labeled, deduped audit issues

- `src/github/reporter.ts`:
  - `createIssue(title, body, labels?)` — POST `/issues` with `labels`
  - New `findOpenIssueByTitle(title)` — GET `/issues?state=open` and match by
    title; if found, PATCH body instead of creating a duplicate
- `src/github/action.ts` (audit mode): skip issues already open with the same
  title (dedup), pass labels from input
- Action inputs (`action.yml` + config loader + types):
  - `audit_create_issues` (bool, default false)
  - `audit_auto_fix` (bool, default false)
  - `audit_labels` (string, default `audit`)
  - `audit_target_dirs` (string, optional — passed to audit mode)
- Config: `config/codesentinel.config.json` schema gains `audit` block with
  `createIssues`, `autoFix`, `labels`, `targetDirs` (loader already partially
  has `audit` shape in `src/config/loader.ts`)

### 3. `orchestrator.yml` — Hourly autonomous cycle

- Triggers: `schedule` cron `0 * * * *` + `workflow_dispatch`
- Steps:
  1. Checkout (fetch-depth 0), Setup Node, `npm ci && npm run build`
  2. List open PRs excluding `autofix:skipped` / `autofix:needs-manual-review`:
     - mergeable + up to date → `gh pr merge --merge --auto`
     - `DIRTY` or behind main → attempt `git merge origin/main`; on conflict,
       resolve via CodeSentinel CLI `fix` mode on the conflict branch; verify
       with build+tests; else label `autofix:skipped`
  3. If no open PRs: pick oldest open issue; if AI can answer questions, post
     answer; then comment `/fix` to trigger the fix loop (issue-analyze flow
     already exists in engine)
- Uses helper scripts from `.github/scripts/`

### 4. `self-improvement.yml` — Weekly AI self-improvement

- Triggers: `schedule` cron `0 0 * * 0` + `workflow_dispatch`
- Creates `improvement/` branch, runs `fix --auto-fix` with verification loop,
  opens PR labeled `self-improvement` (human-reviewed, never auto-merged)

### 5. Helper scripts in `.github/scripts/`

- `setup-opencode.sh` — install opencode binary (reuse installer logic from
  `src/opencode/installer.ts` concepts; standalone for CI)
- `post-or-update-comment.sh` — post or PATCH a comment by HTML marker
- `find-or-create-autofix-pr.sh` — reuse open PR for issue or create one
- `gather-context.sh` — collect repo context (git log, file tree, recent
  findings) for prompts

### 6. Version alignment

- Bump `CODESENTINEL_VERSION` in `src/index.ts` and workflow/example pins from
  v0.11.1 → v0.12.0 (package.json already 0.12.0)

## Verification

- Engine tests: extend `tests/audit-fixes-i.test.ts` or new
  `tests/audit-issues.test.ts` for dedup + labels (mock GitHubReporter or use
  existing test fixtures)
- Workflows: YAML syntax check via `npx actionlint` if available (else manual
  review); smoke-run `audit.yml` via `workflow_dispatch` once pushed
- `npm test` full suite green; `npm run typecheck` clean