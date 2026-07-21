# Changelog

All notable changes to CodeSentinel AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

### Fixed
- **P0-1**: Fixed `private-key-header` secret pattern regex that used em-dash (`——`) instead of double hyphen (`-----`), preventing detection of real PEM private keys.
- **P0-2**: Implemented `codesentinel dismiss --file <path> --line <n>` which was documented in help text but not wired up.
- **P0-3**: Gate mode now returns a typed `gatePassed: boolean` in `EngineReport` instead of relying on fragile string matching of the summary text.
- **P0-4**: Fix mode now re-analyzes files after applying a fix to detect new issues introduced by the fix. Reports `newIssuesIntroduced` in `FixAttempt`.
- **P0-5**: `runVerification()` now actually runs linters (ESLint/Biome/Pylint) in addition to tests, matching its documented behavior.
- **P1-6**: AI provider factories now surface clear, actionable error messages when API keys are missing (e.g., "Ensure OPENAI_API_KEY is set").
- **P1-7**: `extractJson()` now returns `null` instead of throwing on malformed AI responses, with graceful fallback in all callers.
- **P1-9**: Fixed `findingsBySeverity` being initialized to `{}` in mode runners then overwritten by `finalizeReport()`.

### Added
- **P0-6**: Configurable `securityBlendStrategy` option (`"min"` | `"avg"` | `"static-only"`) for blending AI security scores with static baseline.
- **P1-1**: GitHub Reporter now includes rate limiting with exponential backoff and respects `X-RateLimit-Remaining` / `Retry-After` headers.
- **P1-2**: Added `listIssueComments()` with pagination support (handles `Link` header for large comment sets).
- **P1-3**: Probot app now handles `issue_comment.edited` events and deduplicates by comment ID.
- **P1-8**: Dashboard server now handles `SIGINT`/`SIGTERM` for graceful shutdown.
- **P2-1**: Slash-command workflow and setup command now support `/gate` and `/deadcode` commands.
- **P2-2**: GitHub Action now creates Check Runs with annotations for gate mode results.
- **P2-3**: GitHub Action now sets commit status after gate mode (`codesentinel/gate` context).
- **P2-4**: Added SARIF output format (`--sarif` CLI flag) for integration with GitHub Code Scanning.
- **P2-5**: Coverage heuristic now checks `.test.ts`, `.test.js`, `.spec.ts`, `.spec.js`, and `__tests__/` directory patterns.
- **P2-6**: Test generator now derives test file extension from source file (`.test.js` for `.js`, etc.) instead of hardcoding `.test.ts`.
- **P3-1**: AI review now runs with bounded concurrency (5 parallel requests) instead of sequential processing.
- **P3-4**: FileCache now has a maximum entries limit (500) with LRU eviction.
- **P4-1**: Added structured JSON logging mode (`logger.setJsonMode(true)` / `CODESENTINEL_LOG_FORMAT=json`).
- **P4-2**: Added `--json` CLI flag for machine-readable JSON output of `EngineReport`.
- **P4-3**: Added `--sarif` CLI flag for SARIF format output.

## [0.1.6] - 2024-01-01

### Added
- Initial release with 8 operational modes (review, fix, audit, score, testgen, chat, gate, describe).
- 4 AI providers (OpenCode, OpenAI, Anthropic, Gemini) with per-task model routing.
- 19 static analysis heuristic checks.
- Enhanced analyzer with dynamic severity adjustment, custom rules, confidence thresholds.
- Progressive analysis (quick → standard → deep scan).
- Multi-file analysis (dependency graph, import/export, duplicate detection).
- Weighted quality scoring (0-100) across readability, maintainability, security, test coverage.
- Test generation for Jest and Vitest.
- Quality gate evaluator with configurable thresholds.
- Dead code detector.
- Plugin system with analyze/score lifecycle hooks.
- GitHub Action and Probot GitHub App integration.
- Web dashboard with Chart.js visualizations.
- Pre-commit hook installer.
- External linter integration (ESLint, Biome, Pylint).
- Third-party secret scanner integration (gitleaks, trufflehog).
- 11 built-in secret patterns.
- False positive dismissal system.
- On-disk AI response caching.
- Self-contained HTML report generator.
- CLI with comprehensive flag support.
