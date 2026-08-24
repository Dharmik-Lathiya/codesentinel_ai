# Continue Tomorrow — Autonomous Workflow Suite (Day 2)

> **Goal:** Finish the autonomous workflow suite implementation (started 2026-08-16).
> Main plan: `docs/superpowers/plans/2026-08-16-autonomous-workflows.md` (8 tasks).
> Spec: `docs/superpowers/specs/2026-08-16-autonomous-workflows-design.md`.

## Current State (as of 2026-08-16 end of day)

### Done + committed
- `77b87ff` — magic-number noise fixes (mask string literals, skip decimal fractions + data files). 260 tests pass. Verified on BoxArena: audit magic-number findings = 0.
- `9490542` — design spec committed.
- `b08c3eb` — implementation plan committed.
- `7c65cfe` — **Task 1 DONE**: GitHubReporter labeled + deduped issue creation (`createIssue(title, body, labels?)`, `findOpenIssueByTitle`, `createOrUpdateIssue`). 3 new I8 tests pass (13/13 in audit-fixes-i.test.ts).

### In progress (Task 2 — uncommitted, action.ts modified)
- `src/github/action.ts` has uncommitted changes:
  - inputs object: added `audit_create_issues`, `audit_auto_fix`, `audit_labels`, `audit_target_dirs`
  - `publishOutputs` call now passes `auditOpts` ({ createIssues, autoFix, labels })
  - `publishOutputs` signature updated with `auditOpts?` param
- **Still missing in Task 2:** the audit loop inside `publishOutputs` must be replaced to use `createOrUpdateIssue` + labels + autoFix flag. The old loop still calls `reporter.createIssue(...)` directly with 2 args.

## Tomorrow: First Actions (in order)

### 1. Finish Task 2 (action inputs)
- [ ] Replace the audit loop in `publishOutputs` (src/github/action.ts ~line 123):

```typescript
    if (report.mode === "audit" && auditOpts?.createIssues) {
      const labels = [...(auditOpts.labels ?? [])];
      if (auditOpts.autoFix) labels.push("autofix-trigger");
      for (const f of report.findings) {
        await reporter.createOrUpdateIssue(
          `[${f.severity}] ${f.file}`,
          f.comment,
          labels,
        );
      }
    }
```

- [ ] Add the 4 inputs to `action.yml` (after `ask:`, before `outputs:`): `audit_create_issues` (default "true"), `audit_auto_fix` (default "false"), `audit_labels` (default "audit"), `audit_target_dirs` (default "")
- [ ] Wire `audit_target_dirs` → engine: `src/config/types.ts` add `auditTargetDirs?: string[]` to `CodeSentinelConfig` (after `exclude: string[];`); `src/config/index.ts` `configFromInputs()` parse comma-separated; `src/engine/index.ts` `runAudit()` (~line 1303) filter `files` by target dirs (see plan Task 2 Step 5b for exact code)
- [ ] Run: `npm run typecheck && npm test` — all green (261+ tests)
- [ ] Commit: `git add src/github/action.ts action.yml src/config/types.ts src/config/index.ts src/engine/index.ts && git commit -m "feat: audit issue creation inputs (create/auto-fix/labels/target-dirs)"`

### 2. Tasks 3–8 from the main plan (same file)
- [ ] **Task 3:** create `.github/workflows/audit.yml` (reusable: verification suite → failure issue → labels → AI audit) + `examples/advanced/daily-audit.yml` wrapper (cron 0 2 * * *) + update `examples/advanced/ai-suite.yml` pins
- [ ] **Task 4:** create `.github/scripts/` — `setup-opencode.sh`, `post-or-update-comment.sh`, `find-or-create-autofix-pr.sh`, `gather-context.sh` (chmod +x, `bash -n` check)
- [ ] **Task 5:** create `.github/workflows/orchestrator.yml` (hourly: auto-merge PRs, AI conflict resolution via opencode, drive issues to /fix)
- [ ] **Task 6:** create `.github/workflows/self-improvement.yml` (weekly, human-reviewed PR, never auto-merged)
- [ ] **Task 7:** version pins `v0.11.1` → `v0.12.0` everywhere (src/index.ts ×2, review.yml, autofix.yml, examples/, AGENTS.md) + `npm run build && npm run build:action`
- [ ] **Task 8:** final verification (typecheck, tests, builds, bundle smoke) + `git pull --rebase origin main && git push`

## Open Items (do not forget)
- [ ] **npm publish v0.12.0** — still blocked on browser OTP (npm 2FA web auth). User must open the auth URL or run `npm publish` manually in the repo folder. Verify after: `npm view @dharmiklathiya/codesentinel_ai version` should show 0.12.0
- [ ] Tag `v0.12.0` on GitHub points at `169d373` (bot's release commit, WITHOUT latest fixes) — retag to latest commit or tag at next release

## Important Notes
- Bot workflows auto-commit to origin/main (auto-fix + auto-version). ALWAYS `git pull --rebase origin main` before pushing.
- Rebase conflicts to expect: `package.json` (bot bumps version), `src/utils/git.ts` (bot's version is broken — references undefined constants; our version is the superset, take ours).
- Bot's auto-fix has broken code before (deleted `engine` declaration in dismiss block in src/index.ts) — check for that if typecheck fails after rebase.
- Tests: `npm test` (vitest), typecheck: `npm run typecheck` (same as lint).
- Action bundle: `npm run build:action` → `dist/action-bundle/index.mjs` (committed; deterministic rebuild).
- AGENTS.md rule: NO code comments unless asked.
- User is non-native English speaker — keep answers simple.
- AI in user's BoxArena project needs `opencode` running at localhost:4096 or `--provider openai` with key (fix/audit AI modes fail without it).