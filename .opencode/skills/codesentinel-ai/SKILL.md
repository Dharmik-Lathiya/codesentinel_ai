---
name: codesentinel-ai
description: Use when working on the codesentinel_ai project — AI-powered code review, fix, audit, scoring, and test generation engine with multi-provider model support
license: MIT
compatibility: opencode
metadata:
  audience: developers
  project: codesentinel-ai
---

## Project Overview

CodeSentinel AI is a modular, multi-capability AI code review and analysis engine. It supports review, fix, audit, score, test generation, chat, gate (CI gating), and describe modes. Each task routes to a configurable AI provider (OpenAI, Anthropic, Gemini, OpenCode).

## Architecture

- **Facade / Orchestrator**: `Engine` in `src/engine/index.ts` coordinates all subsystems
- **Strategy + Factory**: `AIHub` registers provider factories and lazily instantiates them
- **Configuration-driven routing**: `TaskName` maps to `ModelConfig` for per-task provider/model selection
- **Retry with backoff**: AI completions wrapped with `retry()` utility
- **Plugin system**: `PluginManager` and `CodeSentinelPlugin` type allow extensibility

## Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| Engine | `src/engine/index.ts` | Central orchestrator. Pulls together AI, analyzer, scorer, cache, plugins, testgen, git, secrets, dashboard, deadcode, linters, scanners, dismissals, gate, suggestions |
| AI Hub | `src/ai/index.ts` | Routes tasks to configured provider (opencode, openai, anthropic, gemini). Factory pattern with lazy caching |
| Config | `src/config/` | `loadConfig()`, `mergeConfig()`, `DEFAULT_CONFIG`. Runtime secrets, model routing per task |
| Analyzer | `src/analyzer/` | Static analysis, finding generation |
| Scorer | `src/scorer/` | 0–100 quality score computation |
| TestGen | `src/testgen/` | Vitest/Jest unit test generation |
| GitHub | `src/github/` | GitHub Action entry point, Probot app, PR comment posting |
| Gate | `src/gate/` | CI quality gate evaluation |
| Prompts | `src/prompts/` | Prompt templates per task mode |

## Provider Configuration

Default provider is `opencode` (local server at `http://localhost:4096`). All providers are optional — configure only what you need:

```typescript
type Provider = "openai" | "anthropic" | "gemini" | "opencode";
type TaskName = "review" | "fix" | "audit" | "score" | "testgen" | "chat" | "describe";
```

## Key Conventions

- **Functional purity**: Business logic lives in `src/domain/`. Keep functions pure.
- **TypeScript**: Strict mode, ESM (`"type": "module"` in package.json)
- **Testing**: Vitest. Tests in `tests/` directory.
- **Build**: `tsc -p tsconfig.json` — output to `dist/`
- **Linting**: `tsc -p tsconfig.json --noEmit` for type checking

## Development Workflow

1. Use test-driven-development — write failing test first
2. Run `npm run typecheck` to verify types
3. Run `npm test` to run the test suite
4. Run `npm run build` to compile
5. Test with `node dist/index.js review` (or score, fix, etc.)

## Superpowers Integration

This project has the Superpowers system installed. Always use the skill tool to load relevant skills before starting work:

- `skill({ name: "brainstorming" })` — for design discussions
- `skill({ name: "writing-plans" })` — before implementing features
- `skill({ name: "test-driven-development" })` — during implementation
- `skill({ name: "systematic-debugging" })` — when debugging issues
- `skill({ name: "requesting-code-review" })` — before submitting PRs
