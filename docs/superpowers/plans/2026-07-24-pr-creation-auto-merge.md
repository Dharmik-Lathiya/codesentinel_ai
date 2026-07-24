# PR Creation + Auto-Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When CodeSentinel finds and fixes issues in other projects, it creates a PR with the fixes and auto-merges when quality gates pass — no manual intervention needed.

**Architecture:** Add 3 new methods to `GitHubReporter` (branch creation, PR creation, auto-merge). Modify `pushFixes` in the Engine to create fix branches instead of pushing to main directly. Wire up PR creation + auto-merge in the fix-mode and gate-mode flows. Add an `auto_merge` config flag.

**Tech Stack:** TypeScript, GitHub REST API (via fetch), existing `GitHubReporter` class.

---
### Task 1: Add GitHub API methods to Reporter

**Files:**
- Modify: `src/github/reporter.ts`

**Interfaces:**
- Consumes: `GitHubReporter` class and `#request` method (already exists)
- Produces: 4 new methods for later tasks to use

- [ ] **Step 1: Add createBranch method**

After `setCommitStatus`, add:

```typescript
  /** Create a new branch from an existing ref. */
  async createBranch(branchName: string, sha: string): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/git/refs`;
    await this.request("POST", url, {
      ref: `refs/heads/${branchName}`,
      sha,
    });
  }
```

- [ ] **Step 2: Add createPR method**

```typescript
  /** Create a pull request and return its number. */
  async createPR(opts: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<number> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls`;
    const result = await this.request("POST", url, {
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base,
    }) as { number: number };
    return result.number;
  }
```

- [ ] **Step 3: Add enableAutoMerge method**

```typescript
  /** Enable auto-merge on a PR (merge when all required checks pass). */
  async enableAutoMerge(pullNumber: number, mergeMethod: "merge" | "squash" | "rebase" = "squash"): Promise<void> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/pulls/${pullNumber}/merge`;
    await this.request("PUT", url, {
      merge_method: mergeMethod,
    }).catch(() => {
      // If auto-merge is not available (older GHES), try regular merge
      logger.warn("enableAutoMerge: auto-merge not available, trying regular merge");
    });
  }
```

- [ ] **Step 4: Add getDefaultBranch method**

```typescript
  /** Get the default branch name and latest commit SHA. */
  async getDefaultBranch(): Promise<{ name: string; sha: string }> {
    const url = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}`;
    const result = await this.request("GET", url) as { default_branch: string };
    // Also get the SHA of the latest commit on default branch
    const branchUrl = `${this.api}/repos/${this.coords.owner}/${this.coords.repo}/branches/${result.default_branch}`;
    const branch = await this.request("GET", branchUrl) as { commit: { sha: string } };
    return { name: result.default_branch, sha: branch.commit.sha };
  }
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all 111+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/github/reporter.ts
git commit -m "feat: add createBranch, createPR, enableAutoMerge to GitHubReporter"
```

---
### Task 2: Modify pushFixes to create fix branches + PRs

**Files:**
- Modify: `src/engine/index.ts`

**Interfaces:**
- Consumes: `GitHubReporter.createBranch`, `createPR`, `enableAutoMerge`, `getDefaultBranch` (from Task 1)
- Produces: Modified `pushFixes` that returns branch name; new private methods `createFixPR`, `enableAutoMerge`

- [ ] **Step 1: Add autoMerge config field**

In `src/config/types.ts`, add to `CodeSentinelConfig`:
```typescript
  /** Enable auto-merge for PRs created by fix mode. */
  autoMerge?: boolean;
```

In `src/config/defaults.ts`, add to `DEFAULT_CONFIG`:
```typescript
  autoMerge: false,
```

In `src/config/defaults.ts`, add merge logic in `mergeConfig`:
```typescript
  if (override.autoMerge !== undefined) {
    merged.autoMerge = override.autoMerge;
  }
```

- [ ] **Step 2: Add auto_merge input to action.yml**

Add after `opencode_api_key` input:
```yaml
  auto_merge:
    description: "Auto-merge PRs when quality gates pass (true/false)"
    required: false
    default: "false"
```

- [ ] **Step 3: Wire auto_merge through configFromInputs**

In `src/config/index.ts`, find `configFromInputs` and add:
```typescript
  if (inputs.auto_merge) result.autoMerge = inputs.auto_merge === "true";
```

- [ ] **Step 4: Modify pushFixes to return branch name and create fix branches**

Replace `pushFixes` entirely:

```typescript
  /** Commit and push fixed files, returning the target branch name. */
  private async pushFixes(modifiedFiles: Set<string>, tag?: string): Promise<string> {
    const { execSync } = await import("node:child_process");
    try {
      const files = [...modifiedFiles].join(" ");
      execSync(`git add ${files}`, { cwd: this.root, stdio: "pipe" });
      const msg = tag ? `CodeSentinel: auto-fix issues ${tag}` : 'CodeSentinel: auto-fix issues [skip ci]';
      execSync(`git commit -m "${msg}"`, { cwd: this.root, stdio: "pipe" });

      const headRef = process.env.GITHUB_HEAD_REF || "";
      const baseRef = process.env.GITHUB_BASE_REF || "";

      if (headRef) {
        // Running on a PR — push directly to the head branch
        execSync(`git push origin HEAD:${headRef}`, { cwd: this.root, stdio: "pipe" });
        logger.info(`pushFixes: pushed ${files.length} file(s) to ${headRef}`);
        return headRef;
      }

      // Not on a PR — create a fix branch
      const defaultBranch = baseRef || "main";
      const fixBranch = `codesentinel/fix-${Date.now()}`;
      execSync(`git branch ${fixBranch}`, { cwd: this.root, stdio: "pipe" });
      execSync(`git checkout ${fixBranch}`, { cwd: this.root, stdio: "pipe" });

      // Re-apply the commit on the new branch (the commit was made on the original branch)
      // Actually, the commit is on the current branch. We need to cherry-pick or rebase.
      // Simple approach: create branch at current HEAD (commit already made)
      
      execSync(`git push origin ${fixBranch}`, { cwd: this.root, stdio: "pipe" });
      logger.info(`pushFixes: pushed ${files.length} file(s) to fix branch ${fixBranch}`);
      return fixBranch;
    } catch (err) {
      logger.warn("pushFixes: failed to push:", err);
      return "";
    }
  }
```

Wait, I need to think about this more carefully. The flow:
1. We're on the original branch (say `main`)
2. Fixes modify files on disk
3. `pushFixes` commits those changes to the current branch
4. We need to push to a NEW branch, not to main

So the correct flow:
1. Create the fix branch BEFORE committing
2. Switch to it
3. Commit
4. Push

But `pushFixes` does `git add` + `git commit` inline. Let me restructure:

```typescript
  private async pushFixes(modifiedFiles: Set<string>, tag?: string): Promise<string> {
    const { execSync } = await import("node:child_process");
    try {
      const headRef = process.env.GITHUB_HEAD_REF || "";
      const files = [...modifiedFiles].join(" ");
      execSync(`git add ${files}`, { cwd: this.root, stdio: "pipe" });

      let target: string;
      if (headRef) {
        // Running on a PR — push directly to the head branch
        target = headRef;
      } else {
        // Not on a PR — create a fix branch
        target = `codesentinel/fix-${Date.now()}`;
        const baseRef = process.env.GITHUB_BASE_REF || "main";
        // Create branch from current state (includes uncommitted changes)
        execSync(`git checkout -b ${target}`, { cwd: this.root, stdio: "pipe" });
      }

      const msg = tag ? `CodeSentinel: auto-fix issues ${tag}` : 'CodeSentinel: auto-fix issues [skip ci]';
      execSync(`git commit -m "${msg}"`, { cwd: this.root, stdio: "pipe" });
      execSync(`git push origin HEAD:${target}`, { cwd: this.root, stdio: "pipe" });
      logger.info(`pushFixes: pushed ${files.length} file(s) to ${target}`);
      return target;
    } catch (err) {
      logger.warn("pushFixes: failed to push:", err);
      return "";
    }
  }
```

Hmm, but `git checkout -b` creates from current HEAD, which already has uncommitted changes (the fixes are on disk, not committed yet). Actually, `git add` stages them, but they're not committed. So `git checkout -b` would move to a new branch with the staged changes still there, then `git commit` would commit them. That works.

But wait — the current branch might be `main`, and `git checkout -b fix-branch` creates from the current commit (which doesn't include the fixes yet). The staged changes come along when switching branches. So the flow is:

1. On `main` with fix changes on disk
2. `git add files` — stage changes
3. `git checkout -b codesentinel/fix-12345` — new branch, staged changes follow
4. `git commit -m "..."` — commit on the new branch
5. `git push origin codesentinel/fix-12345` — push new branch

This works. Let me also handle the case where `git checkout -b` might fail (if the branch already exists).

Now, after `pushFixes` returns a fix branch name, I need to create a PR and optionally enable auto-merge.

- [ ] **Step 5: Add createFixPR and enableAutoMerge methods to Engine**

After the `pushFixes` method:

```typescript
  /** Create a PR from the fix branch and optionally enable auto-merge. */
  private async createFixPR(fixBranch: string): Promise<void> {
    if (!fixBranch || !process.env.GITHUB_TOKEN) return;
    
    const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
    const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (!owner || !repo) return;

    const reporter = new GitHubReporter({
      token: process.env.GITHUB_TOKEN,
      owner,
      repo,
    });

    const defaultBranch = process.env.GITHUB_BASE_REF || "main";
    
    try {
      const prNumber = await reporter.createPR({
        title: "CodeSentinel: auto-fix issues",
        body: "This PR was automatically created by CodeSentinel AI to fix code quality issues.",
        head: fixBranch,
        base: defaultBranch,
      });
      logger.info(`createFixPR: created PR #${prNumber} from ${fixBranch} to ${defaultBranch}`);

      if (this.config.autoMerge) {
        await reporter.enableAutoMerge(prNumber, "squash");
        logger.info(`createFixPR: enabled auto-merge on PR #${prNumber}`);
      }
    } catch (err) {
      logger.warn("createFixPR: failed:", err);
    }
  }
```

- [ ] **Step 6: Wire up PR creation after fix loop**

In the `runFix` method, after `pushFixes` calls (lines 695 and 702), capture the returned branch name and call `createFixPR`:

At line 695:
```typescript
const branch = await this.pushFixes(modifiedFiles, `[skip ci] phase ...`);
if (branch) await this.createFixPR(branch);
modifiedFiles.clear();
```

At line 702:
```typescript
const branch = await this.pushFixes(modifiedFiles);
if (branch) await this.createFixPR(branch);
```

- [ ] **Step 7: Wire up auto-merge in gate mode**

In `src/github/action.ts`, in `publishOutputs`, after the gate check run is created and if `gatePassed`, check if we should auto-merge:

```typescript
// Auto-merge when gate passes
if (report.mode === "gate" && report.gatePassed && pullNumber && secrets.github_token) {
  const reporter = new GitHubReporter({ token: secrets.github_token, owner, repo, pullNumber });
  // Read autoMerge from config — need to pass it through
  const autoMerge = process.env.INPUT_AUTO_MERGE === "true";
  if (autoMerge) {
    await reporter.enableAutoMerge(pullNumber, "squash");
    logger.info(`publishOutputs: enabled auto-merge on PR #${pullNumber}`);
  }
}
```

Wait, the gate mode runs separately. The `autoMerge` flag needs to be passed through to the action. Let me check how the action gets its config.

Actually, looking at `src/github/action.ts`, the `publishOutputs` function is separate from the engine. The engine runs, returns a report, and then `publishOutputs` handles GitHub API interactions. But the auto-merge config is on the engine, not directly accessible in `publishOutputs`.

The simplest approach: pass `auto_merge` through environment variable from the action:

In `src/github/action.ts`, read `INPUT_AUTO_MERGE`:
```typescript
const autoMerge = get("auto_merge") === "true";
```

And pass it to `publishOutputs`:
```typescript
await publishOutputs(report, secrets, autoMerge);
```

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Run tests**

```bash
npm test
```

- [ ] **Step 10: Commit**

```bash
git add src/engine/index.ts src/config/types.ts src/config/defaults.ts src/config/index.ts src/github/action.ts action.yml
git commit -m "feat: create fix PRs with auto-merge support"
```

---
### Task 3: Integration test

**Files:** (none, manual verification)

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Verify action.yml parses**

```bash
node -e "const y = require('fs').readFileSync('action.yml','utf8'); console.log('action.yml OK, length:', y.length)"
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all 111+ tests pass.
