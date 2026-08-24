# Autonomous Workflow Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the autonomous-agent suite: daily audit workflow (verification + AI audit → labeled, deduped issues → autofix loop), hourly orchestrator, weekly self-improvement, helper scripts, and engine support for labeled/deduped audit issues.

**Architecture:** Reusable `audit.yml` workflow (mirrors existing `review.yml`/`autofix.yml` conventions) with a scheduled `daily-audit.yml` wrapper example; `GitHubReporter.createIssue` gains labels + title-based dedup; `action.yml` gains `audit_create_issues`/`audit_auto_fix`/`audit_labels` inputs; two cron workflows (`orchestrator.yml`, `self-improvement.yml`) use the pre-built action; bash helpers live in `.github/scripts/`.

**Tech Stack:** TypeScript (strict, ESM), GitHub Actions (node20 JS action, pre-built bundle), GitHub REST API via fetch, bash scripts, vitest.

## Global Constraints

- Version pins: bump `v0.11.1` → `v0.12.0` everywhere (`src/index.ts` CODESENTINEL_VERSION ×2, `.github/workflows/review.yml`, `.github/workflows/autofix.yml`, `examples/`, `AGENTS.md`). `package.json` is already 0.12.0.
- Workflow conventions: `permissions: contents: write, pull-requests: write, issues: write`; `concurrency` groups; `timeout-minutes`; actions pinned to `@v4`/`@v6` matching existing files; token = `secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN`; git identity via `CODESENTINEL_GIT_NAME`/`CODESENTINEL_GIT_EMAIL` env.
- AGENTS.md user rule: no code comments unless asked (workflows/scripts may keep short `#` headers matching existing files).
- Action reads inputs from env as `INPUT_<NAME>` with `-` → `_` and uppercase (see `src/github/action.ts` `get()`).
- Deadcode rules: exported symbols from `.github/scripts/*.sh` and workflow YAML are not scanned by the TS analyzer.
- Tests: vitest, `tests/` dir; reporter tests mock `(reporter as any).request` (pattern in `tests/audit-fixes-i.test.ts` I2 test).

---

### Task 1: Reporter — labeled, deduped issue creation

**Files:**
- Modify: `src/github/reporter.ts:124-129` (`createIssue`)
- Test: `tests/audit-fixes-i.test.ts`

**Interfaces:**
- Produces: `createIssue(title: string, body: string, labels?: string[]): Promise<void>` — POSTs `/repos/{o}/{r}/issues` with `{title, body, labels}`; `findOpenIssueByTitle(title: string): Promise<number | null>` — GETs open issues, returns first with exact title match.

- [ ] **Step 1: Write the failing tests** (append to `tests/audit-fixes-i.test.ts`)

```typescript
describe("I8: audit issues are labeled and deduped", () => {
  it("passes labels when creating an issue", async () => {
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const reporter = new GitHubReporter({ token: "t", owner: "o", repo: "r" });
    (reporter as any).request = async (method: string, url: string, body?: Record<string, unknown>) => {
      calls.push({ method, url, body });
      return { number: 1 };
    };
    await reporter.createIssue("[high] src/a.ts", "msg", ["audit", "autofix-trigger"]);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("/issues");
    expect(calls[0].body).toMatchObject({ title: "[high] src/a.ts", body: "msg", labels: ["audit", "autofix-trigger"] });
  });

  it("creates an issue when no open issue has the same title", async () => {
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const reporter = new GitHubReporter({ token: "t", owner: "o", repo: "r" });
    (reporter as any).request = async (method: string, url: string, body?: Record<string, unknown>) => {
      calls.push({ method, url, body });
      if (method === "GET") return [{ number: 5, title: "[high] other.ts" }];
      return { number: 9 };
    };
    const num = await reporter.createOrUpdateIssue("[high] src/a.ts", "msg", ["audit"]);
    expect(calls.filter((c) => c.method === "POST").length).toBe(1);
    expect(calls.filter((c) => c.method === "PATCH").length).toBe(0);
    expect(num).toBe(9);
  });

  it("updates an existing open issue with the same title instead of duplicating", async () => {
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const reporter = new GitHubReporter({ token: "t", owner: "o", repo: "r" });
    (reporter as any).request = async (method: string, url: string, body?: Record<string, unknown>) => {
      calls.push({ method, url, body });
      if (method === "GET") return [{ number: 5, title: "[high] src/a.ts" }];
      return { number: 5 };
    };
    const num = await reporter.createOrUpdateIssue("[high] src/a.ts", "updated msg", ["audit"]);
    expect(calls.filter((c) => c.method === "POST").length).toBe(0);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/issues/5");
    expect(patch.body).toMatchObject({ body: "updated msg" });
    expect(num).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/audit-fixes-i.test.ts`
Expected: FAIL — `createOrUpdateIssue` does not exist, `createIssue` does not accept labels.

- [ ] **Step 3: Implement** — replace `createIssue` in `src/github/reporter.ts` and add dedup methods after it

```typescript
  /** Find an open issue whose title matches exactly (used for dedup). */
  async findOpenIssueByTitle(title: string): Promise<number | null> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues?state=open&per_page=100`;
    const issues = await this.request("GET", url) as Array<{ number: number; title: string }> | null;
    if (!Array.isArray(issues)) return null;
    const match = issues.find((i) => i.title === title);
    return match ? match.number : null;
  }

  /** Create a GitHub issue (used by audit mode), optionally with labels. */
  async createIssue(title: string, body: string, labels?: string[]): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues`;
    const payload: Record<string, unknown> = { title, body };
    if (labels && labels.length > 0) payload.labels = labels;
    await this.request("POST", url, payload);
  }

  /** Create an issue, or update the existing open issue with the same title (dedup). */
  async createOrUpdateIssue(title: string, body: string, labels?: string[]): Promise<number> {
    const existing = await this.findOpenIssueByTitle(title);
    if (existing !== null) {
      const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/issues/${existing}`;
      await this.request("PATCH", url, { body });
      return existing;
    }
    await this.createIssue(title, body, labels);
    return 0;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/audit-fixes-i.test.ts`
Expected: PASS (all I8 tests + existing).

- [ ] **Step 5: Commit**

```bash
git add src/github/reporter.ts tests/audit-fixes-i.test.ts
git commit -m "feat: labeled, deduped audit issue creation in GitHubReporter"
```

---

### Task 2: Action inputs — audit_create_issues / audit_auto_fix / audit_labels

**Files:**
- Modify: `src/github/action.ts:17-47` (inputs object), `src/github/action.ts:123-132` (audit publish loop), `action.yml` (new inputs after `ask:`)
- Test: `tests/audit-fixes-i.test.ts` (extend I8 describe)

**Interfaces:**
- Consumes: `createOrUpdateIssue(title, body, labels?)` from Task 1.
- Produces: `publishOutputs(report, secrets, autoMerge, auditOpts)` where `auditOpts?: { createIssues: boolean; autoFix: boolean; labels: string[] }`; `runAction` parses `INPUT_AUDIT_CREATE_ISSUES`, `INPUT_AUDIT_AUTO_FIX`, `INPUT_AUDIT_LABELS`.

- [ ] **Step 1: Write the failing test** (append inside I8 describe)

```typescript
  it("adds autofix-trigger label when autoFix is on", async () => {
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const reporter = new GitHubReporter({ token: "t", owner: "o", repo: "r" });
    (reporter as any).request = async (method: string, url: string, body?: Record<string, unknown>) => {
      calls.push({ method, url, body });
      if (method === "GET") return [];
      return { number: 1 };
    };
    await reporter.createOrUpdateIssue("[high] a.ts", "msg", ["audit", "autofix-trigger"]);
    expect(calls[1].body).toMatchObject({ labels: ["audit", "autofix-trigger"] });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audit-fixes-i.test.ts`
Expected: FAIL — `createOrUpdateIssue` has no labels support yet (Task 1 not applied).

- [ ] **Step 3: Add action inputs** — in `src/github/action.ts` inputs object:

```typescript
    audit_create_issues: get("audit_create_issues"),
    audit_auto_fix: get("audit_auto_fix"),
    audit_labels: get("audit_labels"),
```

- [ ] **Step 4: Wire into publishOutputs** — change call site `await publishOutputs(report, secrets, autoMerge);` to:

```typescript
  await publishOutputs(report, secrets, autoMerge, {
    createIssues: inputs.audit_create_issues !== "false",
    autoFix: inputs.audit_auto_fix === "true",
    labels: (inputs.audit_labels || "audit").split(",").map((s) => s.trim()).filter(Boolean),
  });
```

Change signature to `async function publishOutputs(report: EngineReport, secrets: RuntimeSecrets, autoMerge = false, auditOpts?: { createIssues: boolean; autoFix: boolean; labels: string[] }): Promise<void>` and replace the audit loop:

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

- [ ] **Step 5: Add inputs to `action.yml`** (after `ask:` block, before `outputs:`)

```yaml
  audit_create_issues:
    description: "Create GitHub issues for audit findings (true/false)"
    required: false
    default: "true"
  audit_auto_fix:
    description: "Add the autofix-trigger label so the fix loop picks up audit issues (true/false)"
    required: false
    default: "false"
  audit_labels:
    description: "Comma-separated labels for audit issues"
    required: false
    default: "audit"
  audit_target_dirs:
    description: "Comma-separated directories to audit (empty = whole repo)"
    required: false
    default: ""
```

- [ ] **Step 5b: Wire audit_target_dirs into the engine audit mode** — in `src/config/types.ts` add to `CodeSentinelConfig` (after `exclude: string[];`):

```typescript
  /** Restrict audit findings to these directories (relative paths, empty = whole repo). */
  auditTargetDirs?: string[];
```

In `src/github/action.ts` inputs object add `audit_target_dirs: get("audit_target_dirs")`, and pass into `configFromInputs` overrides as `audit_target_dirs: inputs.audit_target_dirs`. In `src/config/index.ts` `configFromInputs()` add:

```typescript
  if (inputs.audit_target_dirs) {
    out.auditTargetDirs = inputs.audit_target_dirs.split(",").map((s) => s.trim()).filter(Boolean);
  }
```

In `src/engine/index.ts` `runAudit()` (~line 1302), filter the collected files before the snapshot so both static and AI findings are scoped — replace line 1303 `const files = await this.collectedFiles();` with:

```typescript
    let files = await this.collectedFiles();
    const targetDirs = this.config.auditTargetDirs;
    if (targetDirs && targetDirs.length > 0) {
      files = files.filter((f) => targetDirs.some((d) => f.path.startsWith(d)));
      if (files.length === 0) {
        return {
          mode: "audit",
          summary: "No files matched the configured audit target directories.",
          findings: [],
          score: null,
          comments: [],
          generatedTests: [],
          fixAttempts: [],
          metrics: { filesAnalyzed: 0, findingsBySeverity: {}, durationMs: 0 },
        };
      }
    }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass (I8 tests now green).

- [ ] **Step 7: Commit**

```bash
git add src/github/action.ts action.yml tests/audit-fixes-i.test.ts
git commit -m "feat: audit issue creation inputs (create/auto-fix/labels/target-dirs)"
```

---

### Task 3: Reusable audit.yml + daily-audit.yml example

**Files:**
- Create: `.github/workflows/audit.yml`
- Create: `examples/advanced/daily-audit.yml`
- Modify: `examples/advanced/ai-suite.yml` (pin bump + audit job reference)

**Interfaces:**
- Consumes: action inputs from Task 2; version pins from Global Constraints.

- [ ] **Step 1: Create `.github/workflows/audit.yml`**

```yaml
name: "CodeSentinel Audit (reusable)"

on:
  workflow_call:
    inputs:
      version:
        description: "CodeSentinel action tag to use. Pinned to a release, never a branch."
        required: false
        type: string
        default: "v0.12.0"
      audit_labels:
        description: "Comma-separated labels for audit issues"
        required: false
        type: string
        default: "audit"
      audit_auto_fix:
        description: "Add autofix-trigger label so the fix loop picks up audit issues (true/false)"
        required: false
        type: string
        default: "false"
      run_verification:
        description: "Run lint/test/build verification before the audit (true/false)"
        required: false
        type: string
        default: "true"
    secrets:
      CODESENTINEL_GITHUB_TOKEN:
        description: "Optional PAT for git push (overrides GITHUB_TOKEN)"
        required: false
      GITHUB_TOKEN:
        required: true
      OPENAI_API_KEY:
        required: false
      ANTHROPIC_API_KEY:
        required: false
      GEMINI_API_KEY:
        required: false
      OPENCODE_API_KEY:
        required: false
      OPENCODE_BASE_URL:
        required: false

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read

concurrency:
  group: codesentinel-audit
  cancel-in-progress: false

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
        continue-on-error: true

      - name: Install dependencies
        run: npm ci || npm install

      - name: Verification suite
        if: inputs.run_verification == 'true'
        id: verify
        run: |
          FAILED=0
          echo "npm run lint..."
          npm run lint > /tmp/lint.log 2>&1 || { echo "LINT=failed" >> "$GITHUB_ENV"; FAILED=1; }
          echo "npm test..."
          npm test > /tmp/test.log 2>&1 || { echo "TESTS=failed" >> "$GITHUB_ENV"; FAILED=1; }
          echo "npm run build..."
          npm run build > /tmp/build.log 2>&1 || { echo "BUILD=failed" >> "$GITHUB_ENV"; FAILED=1; }
          if [ "$FAILED" = "1" ]; then
            echo "status=failed" >> "$GITHUB_OUTPUT"
            echo "Verification suite reported failures (see issue for logs)"
          else
            echo "status=passed" >> "$GITHUB_OUTPUT"
          fi

      - name: Report verification failures as issue
        if: steps.verify.outputs.status == 'failed'
        env:
          GH_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          TITLE="[Audit] Daily verification failed — $(date -u '+%Y-%m-%d')"
          EXISTING=$(gh issue list --repo "${{ github.repository }}" --state open --search "in:title \"Daily verification failed\"" --json number --jq '.[0].number // empty')
          BODY="## Daily Verification Failed

          | Check | Status |
          |-------|--------|
          | Lint (npm run lint) | ${{ env.LINT == 'failed' && '❌' || '✅' }} |
          | Tests (npm test) | ${{ env.TESTS == 'failed' && '❌' || '✅' }} |
          | Build (npm run build) | ${{ env.BUILD == 'failed' && '❌' || '✅' }} |

          <details><summary>Lint output</summary>

          \`\`\`
          $(tail -100 /tmp/lint.log 2>/dev/null)
          \`\`\`
          </details>

          <details><summary>Test output</summary>

          \`\`\`
          $(tail -100 /tmp/test.log 2>/dev/null)
          \`\`\`
          </details>

          <details><summary>Build output</summary>

          \`\`\`
          $(tail -100 /tmp/build.log 2>/dev/null)
          \`\`\`
          </details>

          See [workflow run](${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}) for full logs."
          if [ -n "$EXISTING" ]; then
            gh issue edit "$EXISTING" --body "$BODY" --repo "${{ github.repository }}"
          else
            gh issue create --title "$TITLE" --body "$BODY" --label "audit" --repo "${{ github.repository }}"
          fi

      - name: Ensure labels exist
        env:
          GH_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          for L in audit autofix autofix-trigger; do
            gh label create "$L" --force --repo "${{ github.repository }}" 2>/dev/null || true
          done

      - name: Run CodeSentinel audit
        uses: Dharmik-Lathiya/CodeSentinel_AI@${{ inputs.version }}
        env:
          GITHUB_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          OPENCODE_BASE_URL: ${{ secrets.OPENCODE_BASE_URL }}
        with:
          mode: audit
          audit_create_issues: "true"
          audit_auto_fix: ${{ inputs.audit_auto_fix }}
          audit_labels: ${{ inputs.audit_labels }}
```

- [ ] **Step 2: Create `examples/advanced/daily-audit.yml`**

```yaml
# Daily scheduled audit — copies the same 5-line wiring as review.yml/autofix.yml.
# The reusable audit.yml runs lint/test/build and files labeled, deduped GitHub
# issues for AI-audit findings; autofix-trigger labels start the fix loop.
name: Daily Audit

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 02:00 UTC
  workflow_dispatch:

jobs:
  audit:
    uses: Dharmik-Lathiya/CodeSentinel_AI/.github/workflows/audit.yml@v0.12.0
    with:
      audit_auto_fix: "true"
      audit_labels: "audit,autofix-trigger"
    secrets: inherit
```

- [ ] **Step 3: Update `examples/advanced/ai-suite.yml`** — bump all `v0.11.1` → `v0.12.0` and add an `audit` job calling the reusable workflow (follow the existing job style).

- [ ] **Step 4: Verify YAML parses**

Run: `node -e "const y=require('js-yaml');const f=require('fs');for(const p of ['.github/workflows/audit.yml','examples/advanced/daily-audit.yml','examples/advanced/ai-suite.yml']){y.load(f.readFileSync(p,'utf8'));console.log(p,'OK')}"`
Expected: all three `OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/audit.yml examples/advanced/
git commit -m "feat: reusable audit workflow with verification suite + daily-audit example"
```

---

### Task 4: Helper scripts in `.github/scripts/`

**Files:**
- Create: `.github/scripts/setup-opencode.sh`
- Create: `.github/scripts/post-or-update-comment.sh`
- Create: `.github/scripts/find-or-create-autofix-pr.sh`
- Create: `.github/scripts/gather-context.sh`

**Interfaces:**
- Produces: `setup-opencode.sh` (installs opencode binary, sets git identity, no output); `post-or-update-comment.sh <repo> <issue-num> <marker> <body-file> <GH_TOKEN>` (PATCH existing comment by marker or POST new); `find-or-create-autofix-pr.sh <repo> <issue-num> <branch> <title> <body-file> <GH_TOKEN>` (outputs `pr_number`, `pr_url`, `action=created|reused`); `gather-context.sh` (prints repo overview: git log, tree, findings counts).

- [ ] **Step 1: Create `setup-opencode.sh`**

```bash
#!/usr/bin/env bash
# setup-opencode.sh — installs the opencode binary for GitHub Actions and sets git identity.
# Usage: .github/scripts/setup-opencode.sh
set -euo pipefail

OPENCODE_VERSION="${OPENCODE_VERSION:-latest}"
ARCH="linux-x64"
case "$(uname -m)" in
  aarch64|arm64) ARCH="linux-arm64" ;;
  x86_64|amd64)  ARCH="linux-x64" ;;
esac

echo "Installing opencode ${OPENCODE_VERSION} (${ARCH})..."
if [ "$OPENCODE_VERSION" = "latest" ]; then
  RELEASE_URL="https://api.github.com/repos/anomalyco/opencode/releases/latest"
else
  RELEASE_URL="https://api.github.com/repos/anomalyco/opencode/releases/tags/${OPENCODE_VERSION}"
fi
DOWNLOAD_URL=$(curl -fsSL "$RELEASE_URL" | jq -r '.assets[] | select(.name == "opencode-'"${ARCH}"'.tar.gz") | .browser_download_url')
if [ -z "$DOWNLOAD_URL" ] || [ "$DOWNLOAD_URL" = "null" ]; then
  echo "Error: could not find opencode binary for ${ARCH}" >&2
  exit 1
fi
curl -fsSL "$DOWNLOAD_URL" -o /tmp/opencode.tar.gz
tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin/
chmod +x /usr/local/bin/opencode
rm /tmp/opencode.tar.gz
opencode --version 2>&1 || true

git config --local user.name "${CODESENTINEL_GIT_NAME:-CodeSentinel Bot}"
git config --local user.email "${CODESENTINEL_GIT_EMAIL:-bot@codesentinel.ai}"
echo "OpenCode installed at: $(which opencode)"
```

- [ ] **Step 2: Create `post-or-update-comment.sh`**

```bash
#!/usr/bin/env bash
# post-or-update-comment.sh — posts a comment or updates an existing one by HTML marker.
# Usage: post-or-update-comment.sh <repo> <issue-number> <marker> <body-file> <GH_TOKEN>
set -euo pipefail

REPO="$1"
ISSUE_NUM="$2"
MARKER="$3"
BODY_FILE="$4"
GH_TOKEN="$5"

[ -f "$BODY_FILE" ] || { echo "Body file not found: $BODY_FILE" >&2; exit 1; }
MARKED_BODY="${MARKER}

$(cat "$BODY_FILE")"

EXISTING_ID=$(gh api "repos/${REPO}/issues/${ISSUE_NUM}/comments" \
  | jq --arg marker "$MARKER" '.[] | select(.body | startswith($marker)) | .id' | head -1)

if [ -n "$EXISTING_ID" ]; then
  jq -n --rawfile body <(printf '%s' "$MARKED_BODY") '{body: $body}' | \
    gh api "repos/${REPO}/issues/comments/${EXISTING_ID}" -X PATCH --input - --silent
  echo "Comment updated (id: ${EXISTING_ID})"
else
  jq -n --rawfile body <(printf '%s' "$MARKED_BODY") '{body: $body}' | \
    gh api "repos/${REPO}/issues/${ISSUE_NUM}/comments" --input - --silent
  echo "Comment posted"
fi
```

- [ ] **Step 3: Create `find-or-create-autofix-pr.sh`**

```bash
#!/usr/bin/env bash
# find-or-create-autofix-pr.sh — reuses an open autofix PR for an issue or creates one.
# Usage: find-or-create-autofix-pr.sh <repo> <issue-num> <branch> <title> <body-file> <GH_TOKEN>
# Outputs (GITHUB_OUTPUT format): pr_number, pr_url, action=created|reused
set -euo pipefail

REPO="$1"
ISSUE_NUM="$2"
BRANCH_NAME="$3"
TITLE="$4"
BODY_FILE="$5"
export GH_TOKEN="$6"

EXISTING_PR=$(gh pr list --repo "$REPO" --head "$BRANCH_NAME" --state open \
  --json number,url --jq ".[0] | {number: .number, url: .url}" 2>/dev/null || echo "null")
PR_NUMBER=$(echo "$EXISTING_PR" | jq -r '.number // empty')
PR_URL=$(echo "$EXISTING_PR" | jq -r '.url // empty')

if [ -n "$PR_NUMBER" ]; then
  [ -f "$BODY_FILE" ] && gh pr edit "$PR_NUMBER" --body-file "$BODY_FILE" --repo "$REPO" 2>/dev/null || true
  echo "pr_number=${PR_NUMBER}"
  echo "pr_url=${PR_URL}"
  echo "action=reused"
else
  BODY="## Fixes #${ISSUE_NUM}

"
  [ -f "$BODY_FILE" ] && BODY="${BODY}$(cat "$BODY_FILE")

"
  BODY="${BODY}---
*Auto-generated by CodeSentinel*"
  PR_URL=$(gh pr create --repo "$REPO" --base main --head "$BRANCH_NAME" --title "$TITLE" --body "$BODY")
  PR_NUMBER=$(echo "$PR_URL" | grep -oP '/pull/\K[0-9]+' || echo "")
  if [ -n "$PR_NUMBER" ]; then
    gh pr edit "$PR_NUMBER" --add-label "autofix" --repo "$REPO" 2>/dev/null || true
  fi
  echo "pr_number=${PR_NUMBER}"
  echo "pr_url=${PR_URL}"
  echo "action=created"
fi
```

- [ ] **Step 4: Create `gather-context.sh`**

```bash
#!/usr/bin/env bash
# gather-context.sh — prints a compact repo overview for AI prompts.
# Usage: gather-context.sh [max-files]
set -euo pipefail

MAX_FILES="${1:-50}"

echo "=== Repo overview ==="
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Last commit: $(git log -1 --format='%h %s (%cr)' 2>/dev/null || echo none)"
echo
echo "=== File tree (top ${MAX_FILES}) ==="
git ls-files 2>/dev/null | grep -vE 'node_modules|dist/|build/|\.next/|\.vercel/' | head -"${MAX_FILES}"
echo
echo "=== Recent activity ==="
git log --oneline -10 2>/dev/null || echo none
```

- [ ] **Step 5: Make scripts executable + verify syntax**

Run: `chmod +x .github/scripts/*.sh && bash -n .github/scripts/setup-opencode.sh .github/scripts/post-or-update-comment.sh .github/scripts/find-or-create-autofix-pr.sh .github/scripts/gather-context.sh`
Expected: no output (syntax OK).

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/
git commit -m "feat: GitHub Actions helper scripts (opencode setup, comments, autofix PR, context)"
```

---

### Task 5: Hourly orchestrator workflow

**Files:**
- Create: `.github/workflows/orchestrator.yml`

**Interfaces:**
- Consumes: `.github/scripts/setup-opencode.sh`, action from Task 2. Version pin v0.12.0.

- [ ] **Step 1: Create `.github/workflows/orchestrator.yml`**

```yaml
name: CodeSentinel Hourly Orchestrator

# Hourly: auto-merge mergeable PRs; drive open issues to /fix (the fix loop
# creates branch → PR → review → merge). AI conflict resolution runs only when
# a PR is DIRTY or behind main.

on:
  schedule:
    - cron: '0 * * * *'  # Hourly at minute 0
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read

concurrency:
  group: codesentinel-orchestrator
  cancel-in-progress: false

jobs:
  orchestrate:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci || npm install

      - name: Setup OpenCode
        run: |
          chmod +x .github/scripts/setup-opencode.sh
          .github/scripts/setup-opencode.sh
        env:
          GITHUB_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Process open PRs
        id: prs
        env:
          GH_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          PRS=$(gh pr list --repo "${{ github.repository }}" --state open \
            --json number,title,headRefName,mergeable \
            | jq -c '.[]')
          if [ -z "$PRS" ]; then
            echo "has_open_prs=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "has_open_prs=true" >> "$GITHUB_OUTPUT"
          while IFS= read -r PR; do
            [ -z "$PR" ] && continue
            NUM=$(echo "$PR" | jq -r '.number')
            HEAD=$(echo "$PR" | jq -r '.headRefName')
            MERGEABLE=$(echo "$PR" | jq -r '.mergeable')
            echo "PR #${NUM} (${HEAD}, mergeable=${MERGEABLE})"
            if ! git check-ref-format --branch "$HEAD" >/dev/null 2>&1 || [[ "$HEAD" == -* ]]; then
              echo "::warning::Invalid head ref ${HEAD} on PR #${NUM}"
              continue
            fi
            git fetch origin "${HEAD}:${HEAD}" 2>/dev/null || git checkout -b "$HEAD" "origin/$HEAD"
            git checkout "$HEAD"
            if [ "$MERGEABLE" = "DIRTY" ] || ! git merge-base --is-ancestor origin/main HEAD; then
              echo "PR #${NUM} dirty/behind — attempting merge..."
              if ! git merge origin/main --no-commit --no-ff 2>/tmp/merge-err.log; then
                echo "Merge conflict on PR #${NUM} — attempting AI resolution..."
                cat << CONFLICT_PROMPT > /tmp/conflict-prompt.txt
You are an AI conflict resolution agent. Resolve the merge conflicts on branch ${HEAD} in this repo.
Inspect git status and the conflicted files, resolve all conflict markers (<<<<<<< ======= >>>>>>>),
keep the code coherent and type-safe, then run the project's build and tests. Do not commit or push.
CONFLICT_PROMPT
                if opencode run --model opencode/deepseek-v4-flash-free --prompt "$(cat /tmp/conflict-prompt.txt)" \
                  && npm run build >/tmp/build.log 2>&1 && npm test >/tmp/test.log 2>&1; then
                  git add -A
                  git commit -m "CodeSentinel: resolve merge conflicts on ${HEAD} [skip ci]"
                  git push origin "$HEAD" 2>/dev/null || true
                  echo "PR #${NUM} conflict resolved"
                else
                  gh pr edit "$NUM" --add-label "autofix:skipped" --repo "${{ github.repository }}" || true
                  echo "::warning::PR #${NUM} conflict resolution failed — labeled autofix:skipped"
                fi
              else
                git add -A
                git commit -m "CodeSentinel: merge main into ${HEAD} [skip ci]" 2>/dev/null || true
                git push origin "$HEAD" 2>/dev/null || true
                echo "PR #${NUM} updated with main"
              fi
            else
              echo "PR #${NUM} mergeable — auto-merging..."
              gh pr merge "$NUM" --merge --auto --repo "${{ github.repository }}" || \
                gh pr merge "$NUM" --merge --repo "${{ github.repository }}" || true
            fi
          done <<< "$PRS"

      - name: Drive open issues
        if: steps.prs.outputs.has_open_prs == 'false'
        env:
          GH_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          ISSUES=$(gh issue list --repo "${{ github.repository }}" --state open \
            --json number,title --jq 'sort_by(.number) | .[0]')
          if [ -z "$ISSUES" ] || [ "$ISSUES" = "null" ]; then
            echo "No open issues"
            exit 0
          fi
          NUM=$(echo "$ISSUES" | jq -r '.number')
          TITLE=$(echo "$ISSUES" | jq -r '.title')
          echo "Driving issue #${NUM}: ${TITLE}"
          gh issue comment "$NUM" --body "/fix" --repo "${{ github.repository }}" || true
```

- [ ] **Step 2: Verify YAML parses**

Run: `node -e "const y=require('js-yaml');const f=require('fs');y.load(f.readFileSync('.github/workflows/orchestrator.yml','utf8'));console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/orchestrator.yml
git commit -m "feat: hourly orchestrator — auto-merge PRs, AI conflict resolution, drive issues to /fix"
```

---

### Task 6: Weekly self-improvement workflow

**Files:**
- Create: `.github/workflows/self-improvement.yml`

**Interfaces:**
- Consumes: action from Task 2; version pin v0.12.0.

- [ ] **Step 1: Create `.github/workflows/self-improvement.yml`**

```yaml
name: CodeSentinel Self-Improvement

# Weekly: lets CodeSentinel improve its own codebase on an improvement/ branch
# and opens a PR labeled self-improvement (human-reviewed, never auto-merged).

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly, Sunday midnight UTC
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

concurrency:
  group: self-improvement
  cancel-in-progress: false

jobs:
  self-improve:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci || npm install

      - name: Create improvement branch
        run: |
          git config user.name "${CODESENTINEL_GIT_NAME:-CodeSentinel Bot}"
          git config user.email "${CODESENTINEL_GIT_EMAIL:-bot@codesentinel.ai}"
          git checkout -b improvement/auto-$(date -u '+%Y%m%d')

      - name: Run self-improvement fix
        env:
          GITHUB_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          OPENCODE_BASE_URL: ${{ secrets.OPENCODE_BASE_URL }}
        run: |
          node dist/index.js fix --auto-fix 2>&1 || true
          if [ -z "$(git status --porcelain)" ]; then
            echo "No changes — nothing to improve"
            exit 0
          fi
          git add -A
          git commit -m "CodeSentinel: self-improvement changes [skip ci]"
          git push -u origin improvement/auto-$(date -u '+%Y%m%d')

      - name: Open improvement PR
        env:
          GH_TOKEN: ${{ secrets.CODESENTINEL_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          BRANCH="improvement/auto-$(date -u '+%Y%m%d')"
          EXISTING=$(gh pr list --repo "${{ github.repository }}" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
          if [ -n "$EXISTING" ]; then
            echo "PR already open: #${EXISTING}"
            exit 0
          fi
          gh pr create --repo "${{ github.repository }}" \
            --base main --head "$BRANCH" \
            --title "CodeSentinel: self-improvement $(date -u '+%Y-%m-%d')" \
            --body "Automated self-improvement changes from the weekly CodeSentinel run. Human-reviewed — never auto-merged." \
            --label "self-improvement" || true
```

- [ ] **Step 2: Verify YAML parses**

Run: `node -e "const y=require('js-yaml');const f=require('fs');y.load(f.readFileSync('.github/workflows/self-improvement.yml','utf8'));console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/self-improvement.yml
git commit -m "feat: weekly self-improvement workflow with human-reviewed PR"
```

---

### Task 7: Version pins v0.11.1 → v0.12.0

**Files:**
- Modify: `src/index.ts:129`, `src/index.ts:354` (CODESENTINEL_VERSION), `.github/workflows/review.yml:15`, `.github/workflows/autofix.yml:10`, `examples/basic/review.yml`, `examples/advanced/ai-suite.yml`, `AGENTS.md`

- [ ] **Step 1: Replace all `v0.11.1` with `v0.12.0`**

Run: `grep -rln "v0.11.1" src/ .github/ examples/ AGENTS.md scripts/ | xargs sed -i 's/v0.11\.1/v0.12.0/g'`
Expected: `grep -rn "v0.11.1" src/ .github/ examples/ AGENTS.md scripts/` → no matches; `grep -rn "v0.12.0" src/ .github/ examples/ AGENTS.md scripts/` → matches.

- [ ] **Step 2: Rebuild dist + action bundle**

Run: `npm run build && npm run build:action`
Expected: both complete without error.

- [ ] **Step 3: Typecheck + full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (260+).

- [ ] **Step 4: Bundle smoke test**

Run: `node -e "import('./dist/action-bundle/index.mjs').then(()=>console.log('bundle loads')).catch(e=>{console.error(e.message);process.exit(1)})"`
Expected: `bundle loads`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: bump version pins to v0.12.0; rebuild dist and action bundle"
```

---

### Task 8: Final verification

**Files:** none (verification + release).

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npm test && npm run build && npm run build:action`
Expected: typecheck clean; all tests pass; builds complete.

- [ ] **Step 2: Bundle smoke test**

Run: `node -e "import('./dist/action-bundle/index.mjs').then(()=>console.log('bundle loads')).catch(e=>{console.error(e.message);process.exit(1)})"`
Expected: `bundle loads`

- [ ] **Step 3: Check git state + diff review**

Run: `git status --short && git log --oneline -8`
Expected: working tree clean (all tasks committed); log shows the 7 feature commits.

- [ ] **Step 4: Pull-rebase then push (origin/main has bot commits)**

Run: `git pull --rebase origin main && git push`
Expected: push succeeds; if rebase conflicts arise, resolve taking our versions (see history pattern: bot's auto-fix can break code — e.g. the dismiss-block regression).

- [ ] **Step 5: Update AGENTS.md if any command/pin changed**

Run: `grep -n "v0.12.0\|v0.11.1" AGENTS.md`
Expected: only v0.12.0 references.