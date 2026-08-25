# Zero-Secrets Consumption Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Target repositories consume CodeSentinel with a 5-line workflow and **zero per-repo secrets/env setup** — AI provider credentials live once at the GitHub org level and flow through `secrets: inherit` into the shipped reusable workflows.

**Architecture:** Keep execution in the caller's runner via the existing reusable workflows (`review.yml`, `autofix.yml`, `audit.yml`). All provider keys resolve through inherited org-level secrets; the only required input from a target repo is the workflow file itself. Rejected alternative: `repository_dispatch` into CodeSentinel_AI's own runners (GitHub still requires a credential in the caller to trigger cross-repo, so complexity without benefit).

**Tech Stack:** GitHub Actions `workflow_call`, org-level encrypted secrets, TypeScript CLI (`src/index.ts` setup generator), npm publish.

## Global Constraints

- GitHub limitation (hard): a reusable workflow CANNOT read the callee repo's (`CodeSentinel_AI`) secrets — it executes in the caller's context. Zero-config = org-level secret, not callee-side secret.
- `GITHUB_TOKEN` is always available in the caller; never require it as a declared input.
- `CODESENTINEL_GITHUB_TOKEN` stays optional everywhere (falls back to `secrets.GITHUB_TOKEN`).
- Generated workflow templates must pin released tags only (`v0.14.0` exists on remote); never default-branch refs.
- Node >=18, ESM, strict TS. Tests in `tests/*.test.ts` via vitest.
- Every generated `.yml` must parse with `js-yaml` before shipping.

---

### Task 1: Fix invalid YAML in the build-fix template (already edited — validate & commit)

The `permissions:` block contained a stray job-level `if:` (invalid mapping nesting), which broke `codesentinel setup` output in consumer repos (GH error: "Invalid workflow file ... line 10").

**Files:**
- Modify: `src/index.ts:347-352` (`BUILD_WORKFLOW_CONTENT`)

**Interfaces:**
- Produces: valid `BUILD_WORKFLOW_CONTENT` string array consumed by `setupCommand()` → `.github/workflows/codesentinel-build.yml`

- [x] **Step 1: Remove the bogus `if:` line under `permissions:`**

Current state (applied in working tree):

```ts
  "permissions:",
  "  contents: write",
  "",
```

(The skip-ci guard already exists correctly at job level: `"    if: ${{ github.event_name === 'push' && github.actor != 'CodeSentinel Bot' && !contains(github.event.head_commit.message, '[skip ci]') }}",`)

- [x] **Step 2: Pin `CODESENTINEL_VERSION: v0.14.0`** in both templates (`src/index.ts:129`, `src/index.ts:353`) — tag verified present on remote via `git ls-remote --tags origin`.

- [x] **Step 3: Validate both rendered templates parse as YAML**

Run:

```bash
npm run build && node -e "
import('js-yaml').then(async ({load}) => {
  const { WORKFLOW_CONTENT, BUILD_WORKFLOW_CONTENT } = await import('./dist/index.js');
  load(WORKFLOW_CONTENT.join('\n'));
  load(BUILD_WORKFLOW_CONTENT.join('\n'));
  console.log('YAML OK');
});"
```

Expected: `YAML OK`

- [x] **Step 4: Run test suite**

Run: `npm test`
Expected: 263 passed (setup tests may assert template content — update expectations if they reference the removed line).

> 2026-08-25 (update): RESOLVED — downgraded `better-sqlite3` 13.0.1 → 11.10.0, which ships a prebuilt binary compatible with Node 20.20.2/win32. Full suite now passes locally: 24/24 files, 263/263 tests.

- [x] **Step 5: Commit**

```bash
git add src/index.ts dist
git commit -m "fix: codesentinel-build.yml template — drop invalid permissions.if, pin v0.14.0"
```

---

### Task 2: Guard reusable workflows against missing inherited secrets

If a user forgets the org-level key, jobs should fail with a clear message instead of opaque provider errors.

**Files:**
- Modify: `.github/workflows/review.yml` (add preflight step after install)
- Modify: `.github/workflows/autofix.yml` (same step)
- Modify: `.github/workflows/audit.yml` (same step)

**Interfaces:**
- Consumes: `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENCODE_API_KEY` via `env:` (existing lines ~140)
- Produces: fail-fast step id `preflight`

- [x] **Step 1: Insert preflight step in each reusable workflow** (after the install step):

```yaml
      - name: Preflight — check provider credentials
        id: preflight
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
        run: |
          if [ -z "$OPENCODE_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
            echo "::error::No AI provider key found. Set OPENCODE_API_KEY (or another provider key) as an ORG-level secret so all repos inherit it — no per-repo setup needed."
            exit 1
          fi
```

- [x] **Step 2: Validate YAML**

Run: `node -e "const y=require('js-yaml');['review','autofix','audit'].forEach(n=>{y.load(require('fs').readFileSync('.github/workflows/'+n+'.yml','utf8'));console.log(n,'OK')})"`
Expected: three `OK` lines.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/{review,autofix,audit}.yml
git commit -m "feat: reusable workflows fail fast with guidance when no provider secret inherited"
```

---

### Task 3: Ship the 5-line consumer snippet

Restore a minimal example (removed earlier with `examples/`) documenting the zero-secret wiring.

**Files:**
- Create: `examples/basic/review.yml`

**Interfaces:**
- Consumes: `Dharmik-Lathiya/CodeSentinel_AI/.github/workflows/review.yml@v0.14.0`
- Produces: copy-paste template referenced by README ("Ready-to-copy templates in `examples/`")

- [x] **Step 1: Create `examples/basic/review.yml`:**

```yaml
name: CodeSentinel Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  review:
    uses: Dharmik-Lathiya/CodeSentinel_AI/.github/workflows/review.yml@v0.14.0
    secrets: inherit   # pulls ORG-level OPENCODE_API_KEY — nothing to configure here
    permissions:
      contents: write
      pull-requests: write
```

- [x] **Step 2: Commit**

```bash
git add examples/basic/review.yml
git commit -m "docs: restore minimal 5-line consumer example (org-secret based)"
```

---

### Task 4: Document the one-time org setup

**Files:**
- Modify: `README.md` (Quick Start section)

**Interfaces:**
- Produces: user-facing instructions matching the shipped behavior

- [x] **Step 1: Add to README Quick Start:**

````markdown
## Quick Start (zero per-repo secrets)

One-time (org owner): Settings → Secrets and variables → Actions → New **organization** secret
- Name: `OPENCODE_API_KEY` — value: your Zen key — Repos access: *All repositories*

Per repo — create `.github/workflows/codesentinel.yml`:

```yaml
name: CodeSentinel Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  review:
    uses: Dharmik-Lathiya/CodeSentinel_AI/.github/workflows/review.yml@v0.14.0
    secrets: inherit
    permissions:
      contents: write
      pull-requests: write
```

Done. Slash commands (`/fix`, `/audit`, …) work automatically via the same inherited secret.
````

- [x] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: quick start with org-level secret + 5-line reusable workflow wiring"
```

---

### Task 5: Release v0.14.1

**Files:**
- Modify: `package.json` (version)

- [x] **Step 1:** `npm version patch` → `0.14.1`
- [x] **Step 2:** Full gate: `npm run typecheck && npm test && npm run build && npm run build:action`
- [x] **Step 3:** Commit + tag + push:

```bash
git push origin main --follow-tags
```

- [x] **Step 4:** Publish (requires account 2FA code):

```bash
npm publish --userconfig /tmp/opencode/.npmrc --access public --otp=<code>
```

> 2026-08-25: Skipped per user decision — no 2FA OTP / .npmrc available in this session. Run manually: `npm publish --access public --otp=<code>`

- [x] **Step 5:** Verify: `npm view @dharmiklathiya/codesentinel_ai version` → `0.14.1`; smoke-test in a scratch repo: `npx @dharmiklathiya/codesentinel_ai@0.14.1 setup` → generated `codesentinel-build.yml` parses (`js-yaml` load) and contains no `permissions:\n    if:` pattern.

> 2026-08-25: Local smoke-test done against freshly built CLI (`setup --force` in a scratch dir): generated workflows parse with js-yaml, no `permissions:`+`if:` pattern, pinned v0.14.0. Remote `npm view` check pending until Step 4 is run.
