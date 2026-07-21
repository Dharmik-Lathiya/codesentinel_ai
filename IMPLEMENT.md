# Implementation Plan — Features to Add to codesentinel_ai

Priorities: **P0** (must-have for production parity), **P1** (high value), **P2** (nice to have)

---

## P0 — Core Pipeline Enhancements

### P0-1: JSONL Output Format

Replace/minimize ad-hoc JSON parsing with a structured JSONL pipeline for AI responses, similar to opencode-ai-reviewer's approach.

**Files to create/modify:**
- `src/jsonl-parser.ts` — Parse + validate JSONL output line-by-line with Zod schemas
- `src/types/jsonl.ts` — Discriminated union types (SummaryEntry, VerdictEntry, IssueEntry, StrengthEntry)
- `src/engine/index.ts` — Wire JSONL parser into review/fix/audit pipelines

**Why:** Structured output reduces parsing bugs, enables strict validation, and aligns with the proven opencode-ai-reviewer pattern.

### P0-2: Config Overhaul (YAML + Path/Branch Overrides)

Add YAML config support with glob-based per-path/per-branch overrides.

**Files to create/modify:**
- `src/config/loader.ts` — Add YAML loading via `js-yaml`, support `.opencode-reviewer.yml`
- `src/config/types.ts` — Add `OverrideConfig[]` with `path`/`branch` patterns
- `src/config/index.ts` — Merge override logic applied per-file during review

**Why:** YAML is more ergonomic than JSON for config. Path/branch overrides are essential for monorepo support.

### P0-3: Sub-Agent Batching for Large PRs

Group files into batches and review them via parallel sub-agents (using `task` tool) to handle large PRs without exceeding context windows.

**Files to create/modify:**
- `src/engine/batcher.ts` — File grouping logic with configurable batch size
- `src/engine/index.ts` — Dispatch sub-agent tasks per batch, aggregate results

**Why:** Without this, large PRs will hit context limits. Necessary for production use at scale.

---

## P1 — High-Value Features

### P1-1: MCP Server Integration

Connect to MCP servers (Context7, GitHub MCP) for live library documentation and repository context enrichment during reviews.

**Files to create/modify:**
- `src/mcp/client.ts` — MCPManager class (connect/disconnect/query, local + remote transports)
- `src/mcp/servers.ts` — Pre-built configs for Context7 + GitHub MCP
- `src/engine/index.ts` — Integrate MCP context into review/audit prompts
- `package.json` — Add `@modelcontextprotocol/sdk`, `@upstash/context7-mcp`

**Why:** Significantly reduces false positives from stale API knowledge. The single highest-impact improvement from opencode-ai-reviewer.

### P1-2: Self-Learning Infrastructure

Persistent storage for findings, feedback, patterns, and rules that improves over time.

**Files to create/modify:**
- `src/learning/store.ts` — LearningStore with SQLite (via `better-sqlite3`) + JSON fallback
- `src/learning/schema.ts` — Schema migration (findings, feedback, patterns, custom_rules)
- `src/learning/db.ts` — DB adapters (SQLite + optional PostgreSQL/MySQL)
- `src/config/types.ts` — Add `LearningConfig` options
- `src/engine/index.ts` — Record findings, inject lessons into prompts
- `package.json` — Add `better-sqlite3`, `pg`, `mysql2`

**Why:** Continuous improvement without human intervention. The self-learning loop is the key differentiator of opencode-ai-reviewer.

### P1-3: Probot GitHub App

Run codesentinel as a hosted GitHub App (Probot) that listens for webhooks.

**Files to create/modify:**
- `src/github/app.ts` (exists) — Enhance with full event routing, slash command handlers
- `src/github/handlers/` — 4 handler files (pr-review, commands, audit, autofix)
- `app.yml` — GitHub App manifest (permissions, events, webhooks)
- `src/event-bus/` — Pub/sub with circuit breakers
- `package.json` — Add `probot`, `smee-client`

**Why:** A hosted app is more scalable than per-repo Actions and enables the learning store to persist across all repos.

### P1-4: OpenCode CLI Auto-Install

Auto-download and cache the OpenCode binary for environments where it's not pre-installed.

**Files to create/modify:**
- `src/opcode/installer.ts` — Download from GitHub releases, SHA256 verification, cache via `@actions/tool-cache`
- `src/opencode/index.ts` — Refactor to optionally manage binary lifecycle
- `src/utils/checksum.ts` — SHA256 utilities

**Why:** Removes a manual setup step for users. Required for the GitHub Action to work seamlessly.

---

## P2 — Nice-to-Have Improvements

### P2-1: Library Auto-Detection

Detect frameworks (React, Next.js, Express, Prisma, Zod, etc.) from file paths to tailor prompts.

**Files to create/modify:**
- `src/analyzer/detector.ts` — `detectLibraries()` scanning file paths
- `src/engine/index.ts` — Inject library context into prompts

**Why:** Better prompt context reduces irrelevant findings and improves accuracy.

### P2-2: Autofix Labels & Auto-Merge

Add label management (`autofix:ready`, `autofix:needs-manual-review`) and auto-merge for approved autofixes.

**Files to create/modify:**
- `src/github/labels.ts` — Label management utilities
- `src/github/merge.ts` — Auto-merge with squash strategy
- `src/engine/fix.ts` — Label assignment during fix loop

**Why:** Fully automated fix-to-merge workflow reduces manual toil.

### P2-3: Reusable Workflows

Ship `.github/workflows/review.yml`, `audit.yml`, `autofix.yml` as reusable workflows.

**Files to create/modify:**
- `.github/workflows/review.yml` — Reusable PR review
- `.github/workflows/audit.yml` — Reusable codebase audit
- `.github/workflows/autofix.yml` — Review → fix → auto-merge pipeline

**Why:** Users can consume the action with a single `uses:` line — no config files needed.

### P2-4: Self-Review Workflow

Dogfood codesentinel on its own PRs via a scheduled workflow.

**Files to create/modify:**
- `.github/workflows/self-review.yml` — Run review on self-PRs
- `.github/workflows/self-improvement.yml` — Weekly autonomous improvement

**Why:** Catches regressions in the tool itself. Demonstrates confidence in the product.

### P2-5: Meta-Review Engine

Auto-evaluate the quality of reviews (actionability, accuracy, coverage, consistency) and auto-adjust prompts when quality drops.

**Files to create/modify:**
- `src/meta-review/engine.ts` — Quality evaluator
- `src/meta-review/prompts.ts` — Meta-review prompt template
- `src/config/types.ts` — `MetaReviewConfig`

**Why:** Ensures review quality doesn't degrade over time. Advanced differentiator.

### P2-6: Pattern Detection

Cluster similar findings using Jaccard similarity to discover recurring issues and auto-create custom rules.

**Files to create/modify:**
- `src/pattern-detector/engine.ts` — Pattern discovery
- `src/pattern-detector/cluster.ts` — Jaccard similarity clustering
- `src/pattern-detector/rule-approval.ts` — `/approve-rule` command handler

**Why:** Evolves the static analyzer automatically from real review data.
