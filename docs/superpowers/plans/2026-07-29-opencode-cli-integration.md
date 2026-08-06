# OpenCode CLI Integration Plan

## Objective
Integrate the opencode CLI binary as an alternative execution backend for CodeSentinel AI, matching competitor's architecture: pre-built binary, JSONL output, meta-verification, delta context, learning cache.

## Global Constraints
- All new source files go in `src/opencode/`
- All new tests go in `tests/` with filename `opencode-*.test.ts`
- ESM module format (`import`/`export`, no `require`)
- Strict TypeScript, no `any` types
- Config additions go in `src/config/types.ts` with defaults in `src/config/default.ts`
- Must not break existing 152 tests
- New code must pass `tsc --noEmit` and `vitest run`
- Engine must gracefully fall back to existing AI provider if opencode is not available

---

### Task 1: Installer and Runner (`src/opencode/installer.ts` + `src/opencode/runner.ts`)
- `installer.ts`: Auto-download opencode binary at runtime. Detect platform (linux/darwin, x64/arm64), fetch latest release from GitHub, verify checksum, cache in `~/.codesentinel/bin/opencode`.
- `runner.ts`: Execute `opencode run --auto --format jsonl <args>`, capture stdout, handle exit codes, stream output for progress.

### Task 2: JSONL Parser (`src/opencode/jsonl-parser.ts`)
- Parse opencode JSONL output lines into typed structures: `ReviewSummary`, `Verdict`, `Strength`, `Issue`, `Suggestion`.
- Each line: `{type: "summary"|"verdict"|"strength"|"issue"|"suggestion", data: {...}}`
- Export types + parser function `parseOpencodeOutput(lines: string[]): OpencodeResult`

### Task 3: Meta-Verifier (`src/opencode/verifier.ts`)
- After getting issues from JSONL, run a lightweight verification pass to filter false positives.
- Uses a cheap AI call (or rule-based heuristics) to confirm each issue is real.
- Export `verifyFindings(findings: Issue[]): Promise<Issue[]>` — returns only confirmed findings.

### Task 4: Delta Context (`src/opencode/delta.ts`)
- For fix loops: track previous iteration's diff and AI response.
- Build a delta prompt section: "Previous attempt: [diff]. Previous result: [result]. Avoid repeating these mistakes."
- Export `buildDeltaContext(history: FixIteration[]): string`

### Task 5: Learning Cache (`src/opencode/cache.ts`)
- Persistently store past review learnings using `@actions/cache` (fallback: filesystem).
- Keyed by file path hash + issue pattern, values are "lessons learned" stored as JSON.
- Export `LearningCache` class with `get(key): Promise<Lesson[]>` and `set(key, lesson): Promise<void>`.

### Task 6: Wire into Engine (`src/engine/index.ts`)
- In `Engine.run()`, check config flag `use_opencode_cli` (default false).
- If true, dispatch to `OpencodeProvider` in `src/ai/providers/opencode-cli.ts` instead of the AIHub.
- `OpencodeProvider` uses installer+runner, parser, verifier, delta, and cache.
- Graceful fallback: if opencode binary download fails, fall through to existing AI provider.

### Task 7: Workflow Integration (`action.yml` + `src/github/action.ts`)
- Add `opencode_version` input to `action.yml` (default "latest").
- In `src/github/action.ts`, call installer before running engine.
- Ensure `~/.codesentinel/bin` is in PATH for the action.
- Handle `use_opencode_cli: true` in the default workflow template (`codesentinel.yml`).
