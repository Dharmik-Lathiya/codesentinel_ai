# Design: Auto-resolve conflicts on `codesentinel/fix-*` PRs

**Date:** 2026-08-06
**Status:** Approved
**Scope:** New engine mode `syncfix`, GitHubReporter API additions, new scheduled workflow

## Problem

CodeSentinel auto-fix PRs (head branch `codesentinel/fix-*`) accumulate merge
conflicts as `main` moves forward (e.g. PR #28: `src/index.ts`,
`src/utils/git.ts`, `src/utils/retry.ts`). The existing `enableAutoMerge`
(`src/engine/index.ts:900`) uses a direct `PUT /pulls/{n}/merge`, which silently
fails on conflicted PRs. There is no automatic conflict resolution, so fix PRs
stall open and must be resolved by hand.

## Goal

A scheduled job (once per day) that finds conflicted open fix PRs, resolves them
by merging latest `main` and re-applying the AI fixes onto fresh `main`, then
enables native GitHub auto-merge so the PR merges when checks pass.

## Architecture

New engine mode `syncfix`, dispatched from `Engine.run()` like the other modes.
It reuses the existing fix pipeline (`runFix` internals: `analyzeFiles`,
`applyFix`, verification loop) scoped to a specific file list, plus new
GitHubReporter methods for listing/merging PRs.

### Components

1. **`Engine.runSyncFix()`** (`src/engine/index.ts`)
   - Lists open PRs via `GitHubReporter.listOpenPRs()` (per_page 100).
   - Filters: `head.ref.startsWith("codesentinel/fix-")` AND `mergeable === false`.
   - For each PR (up to `maxSyncfixPRs`, default 1 per run):
     a. Fetch PR details (`getPR`) for head sha + base ref.
     b. Checkout the fix branch locally, `git fetch origin`, `git merge origin/<base>`.
     c. For each conflicted file: `git checkout --theirs -- <file>`, `git add`.
     d. Commit the merge (`Merge main into <branch> [skip ci]`).
     e. Re-run the fix pipeline scoped to the conflicted files only
        (see `--files` below) — re-applies AI fixes onto fresh main. The
        pipeline's internal `pushFixes()` commits and pushes to the branch
        (`GITHUB_REF_NAME` is the checked-out fix branch in CI), so no
        separate push is needed.
     f. `enableNativeAutoMerge(prNumber, "squash")`.
   - Logs every step; never force-pushes; never touches non-`codesentinel/fix-*`
     branches.

2. **`--files <globs>` option** (`src/config/types.ts`, `src/config/index.ts`,
   CLI parse in `src/index.ts`)
   - Comma-separated glob list. When set, `collectedFiles()` returns only
     matching files instead of the git-diff result.
   - Needed because after conflict resolution the conflicted files are identical
     to `main`, so `collectDiff` returns nothing for them and the normal fix
     pipeline would skip them.
   - Applies to `fix` mode generally (harmless, useful for CI).

3. **GitHubReporter additions** (`src/github/reporter.ts`)
   - `listOpenPRs(): Promise<Array<{ number, title, head: { ref, sha }, base: { ref }, mergeable: boolean | null, mergeable_state: string }>>`
     — `GET /repos/{o}/{r}/pulls?state=open&per_page=100`.
   - `getPR(number)` — single PR with the same shape.
   - `enableNativeAutoMerge(number, method)` — `PATCH /repos/{o}/{r}/pulls/{n}`
     with `{ auto_merge: { enabled: true, merge_method: method } }`. On 422
     (repo has auto-merge disabled) log a warning and fall back to
     `mergePR` when `mergeable_state === "clean"`.
   - `mergePR(number, method)` — `PUT /repos/{o}/{r}/pulls/{n}/merge` (existing
     `enableAutoMerge` body; kept for the fallback path).

4. **Workflow** `.github/workflows/fix-pr-sync.yml`
   - `on: schedule: [{ cron: "0 0 * * *" }]` (once daily) + `workflow_dispatch`.
   - `permissions: contents: write, pull-requests: write`.
   - Steps: checkout (fetch-depth 0, token `GITHUB_TOKEN`), setup Node 22,
     `npm ci && npm run build`, run `node dist/index.js syncfix` with
     `GITHUB_TOKEN`.

### Data flow

```
workflow (daily cron)
  -> node dist/index.js syncfix
  -> listOpenPRs()                    # open PRs, head=codesentinel/fix-*
  -> mergeable == false?              # skip if clean
  -> git merge origin/main            # conflict markers appear
  -> git checkout --theirs per file   # keep main's version of conflicted files
  -> commit merge
  -> runFix loop scoped via --files   # AI re-applies fixes on fresh main;
                                      # pushFixes() commits + pushes branch
  -> enableNativeAutoMerge()          # GitHub merges when checks pass
```

### Error handling

- Non-fix branches, `mergeable === null` (unknown state): skipped with a log.
- Merge step failing to start (no conflicts yet / network): logged, skipped.
- AI fix step failing (no provider, no API key): branch is left in the
  resolved-but-unfixed state, PR stays open, warning logged — next daily run
  re-processes it.
- `enableNativeAutoMerge` 422: warning + fallback direct merge only when
  `mergeable_state === "clean"` (all checks passed).
- No force-push anywhere; only fast-forward-safe pushes of the resolved branch.

### Testing

- **Reporter unit tests** (`tests/github-reporter.test.ts`): mocked `fetch` for
  `listOpenPRs`, `getPR`, `enableNativeAutoMerge` (incl. 422 fallback),
  `mergePR`.
- **`--files` scoping test** (`tests/engine.test.ts` or new
  `tests/syncfix.test.ts`): config with `files` glob returns only matching
  files from `collectedFiles()` (via `aiOverride` fake AI, no network).
- **Syncfix engine test**: tmp git repo fixture with `main` + conflicting
  `codesentinel/fix-*` branch; run `syncfix` with a fake reporter (stubbed
  GitHubReporter via constructor injection or mock module) asserting:
  conflict resolved (no `<<<<<<<` markers in working tree), merge commit made,
  branch pushed, auto-merge enabled. Uses `aiOverride` for the fix step.

## Out of scope

- Resolving conflicts on manually created PRs.
- Rebase-based resolution (merge is used — preserves the PR's commit history).
- Polling inside the engine for checks (native auto-merge handles it; the daily
  run's fallback covers repos without auto-merge).
