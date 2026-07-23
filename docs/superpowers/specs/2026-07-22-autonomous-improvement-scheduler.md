# Autonomous Improvement Scheduler

## Overview

A GitHub Actions cron-based scheduler that continuously improves the codebase on a fixed interval:
- Every 10 minutes: auto-fix all detected issues
- Every 30 minutes: generate new functionality (tests, utilities, or docs)

## Architecture

### Workflow: `.github/workflows/codesentinel-autonomous.yml`

```yaml
Triggers:
  - schedule: cron '*/10 * * * *'
  - workflow_dispatch: manual trigger

Jobs:
  1. auto-fix (always runs)
     - Checkout repo
     - Setup Node 20
     - Install deps
     - Build
     - Run: node dist/index.js review (enable_auto_fix: true by default)
     - Commit + push fixes directly to main

  2. feature-gen (runs when minute % 30 == 0)
     - Same checkout + build steps
     - Determine type: (day_of_year + hour) % 3
     - Run appropriate generation
     - Create branch + PR for user review
```

### Feature Generation Types

| Value | Mode | What it does |
|-------|------|-------------|
| 0 | `testgen` | Runs `codesentinel testgen` to generate unit tests for uncovered functions |
| 1 | `utilities` | AI analyzes codebase, identifies missing utility functions, generates them |
| 2 | `docs` | AI adds JSDoc/TSDoc to undocumented functions, improves existing docs |

### Rotation

Deterministic — no persistent state required:
```
type_index = (day_of_year + current_hour) % 3
```

This rotates predictably across the day and changes daily.

### Key Behaviors

- **Auto-fix** commits directly to `main` — fixes are small, safe, and verified
- **Feature-gen** always creates a PR (never commits directly) — user reviews before merge
- **Conflict prevention**: both jobs run sequentially in the same workflow, auto-fix first
- **Skip if clean**: auto-fix skips if `codesentinel review` finds zero actionable issues
- **Logging**: all output captured to workflow logs for debugging

## Files

### New files
- `.github/workflows/codesentinel-autonomous.yml`

### Modified files
- None — auto-fix is already `enable_auto_fix: true` by default, and existing modes handle the feature generation

## Error Handling

- If auto-fix fails (network error, build failure), the workflow logs the error and exits cleanly — no partial commits
- If feature-gen fails, the error is logged and the workflow exits — no partial PR created
- All AI calls are wrapped with `aiAvailable` flag — if AI is unreachable, the job skips gracefully

## Testing

- Deploy the workflow to a test repo first
- Use `workflow_dispatch` to verify each job independently
- Verify that auto-fix creates commits when issues exist
- Verify that feature-gen creates branches + PRs with correct content
