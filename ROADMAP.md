# CodeSentinel AI — Roadmap

> Each version below is designed to be opened as a GitHub issue with full implementation details.
> Copy the block into a new issue, assign yourself, and start hacking.

---

## v0.2.0 — Chat Memory & PR Context

**Theme:** Smarter conversations, richer PR awareness

**Why:** Right now `/ask` is stateless — every question starts from zero. Reviews don't know about the PR title, description, or linked issues. This makes them miss context a human reviewer would catch automatically.

### Implementation

<details>
<summary><strong>1. Session-based chat memory</strong></summary>

<br>

**Objective:** `/ask` remembers the last 10 exchanges in a session so follow-up questions ("why?") work.

**Files to modify:**
- `src/engine/index.ts` — add a `chatHistory: Map<string, ChatMessage[]>` field
- `src/prompts/review.ts` (or create `src/prompts/chat.ts`) — add `{{chat_history}}` variable

**How:**
```ts
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
```
- Keyed by `issue_number` or a session ID from `--session <id>` flag
- Inject last 10 messages into the prompt before the current question
- LRU eviction: keep max 500 sessions, drop oldest

**CLI:**
```bash
codesentinel chat --ask "How does auth work?" --session pr-42
codesentinel chat --ask "Can you show me the token check?" --session pr-42
```

**Validation:**
- Ask a question, then ask "why?", verify the answer references the first question
- Session persistence across CLI calls (stored in `.codesentinel/chat-sessions.json`)
</details>

<details>
<summary><strong>2. PR context injection</strong></summary>

<br>

**Objective:** Auto-fetch PR title, description, commit messages, and linked issues. Inject into review prompts.

**Files to modify:**
- `src/github/reporter.ts` — add `fetchPRContext(owner, repo, prNumber)` method
- `src/engine/index.ts` — call it before review and inject into `project_context`
- `src/config/types.ts` — add `prContext: { title: string; description: string; commits: string[]; linkedIssues: string[] }` to RuntimeSecrets

**How:**
```ts
async function fetchPRContext(token: string, owner: string, repo: string, pr: number) {
  const { data: prData } = await octokit.pulls.get({ owner, repo, pull_number: pr });
  const { data: commits } = await octokit.pulls.listCommits({ owner, repo, pull_number: pr });
  const linkedIssues = extractIssueRefs(prData.body ?? "");
  return {
    title: prData.title,
    description: prData.body ?? "",
    commits: commits.map(c => c.commit.message),
    linkedIssues,
  };
}
```

**Validation:**
- Run review on a PR, verify the prompt contains the PR title and description
- Check that linked issue references (e.g., "Fixes #123") are parsed and injected
</details>

<details>
<summary><strong>3. Feedback loop — rating reviews</strong></summary>

<br>

**Objective:** Users can react to findings with 👍/👎. The engine adjusts prompt weights for future runs.

**CLI:**
```bash
codesentinel feedback --finding-id "abc123" --rating thumbs-down --reason "False positive"
codesentinel feedback --run-id "run-42" --rating thumbs-up
```

**Files to create:**
- `src/feedback/index.ts` — FeedbackManager class
- `src/feedback/store.ts` — stores ratings in learning DB or JSON file

**How:**
- Each finding gets a UUID at generation time
- Feedback is stored in `.codesentinel/feedback.json` (or learning DB if enabled)
- On next review, the engine queries feedback history for the same file/rule
- If a rule has >3 👎 in the last 50 runs, downgrade its severity by one level or suppress

**Validation:**
- Rate a finding 👎, re-run review on the same file, verify it's downgraded or suppressed
- Rate 👍, verify it stays
</details>

---

## v0.3.0 — Multi-Repo & Monorepo Support

**Theme:** Scale beyond single-repo reviews

**Why:** Real projects have monorepos with multiple packages or microservices across repos. CodeSentinel needs to understand cross-package boundaries.

### Implementation

<details>
<summary><strong>1. Workspace config</strong></summary>

<br>

**Objective:** Support a workspace-level config that defines multiple project roots.

**Config file:** `codesentinel.json` (at repo root, sibling to `codesentinel.config.json`)

```json
{
  "workspaces": [
    { "path": "services/api", "name": "api-service" },
    { "path": "services/worker", "name": "worker-service" },
    { "path": "libs/shared", "name": "shared-lib" }
  ],
  "modelRouting": {
    "services/api": { "provider": "anthropic", "model": "claude-3-5-sonnet" },
    "services/worker": { "provider": "openai", "model": "gpt-4o" },
    "libs/shared": { "provider": "opencode", "model": "opencode/default" }
  }
}
```

**Files to create:**
- `src/config/workspace.ts` — WorkspaceLoader class
- `src/engine/workspace.ts` — WorkspaceEngine that spawns per-workspace sub-engines

**How:**
- `WorkspaceLoader.discover()` looks for `codesentinel.json`, `lerna.json`, `nx.json`, `pnpm-workspace.yaml`
- Falls back to single-root if none found
- Each workspace gets its own `Engine` instance with its own config overrides

**Validation:**
- Create a `codesentinel.json` with 3 workspaces, run review, verify each workspace gets the right model
- Test fallback when no workspace file exists
</details>

<details>
<summary><strong>2. Cross-repo diff awareness</strong></summary>

<br>

**Objective:** When reviewing repo A, detect if changes would break consumers in repo B.

**Files to create:**
- `src/graph/dependencies.ts` — DependencyGraph class
- `src/graph/cross-repo.ts` — CrossRepoChecker

**How:**
- Parse `package.json`, `tsconfig.json` paths, imports/exports in each workspace
- Build a dependency graph: `serviceA → shared-lib`, `serviceB → shared-lib`
- When a PR touches `shared-lib`, flag findings with `"breaks: serviceA, serviceB"`
- Cross-repo checking requires a `CODESENTINEL_WORKSPACE_ROOT` env var pointing to a parent dir with all repos cloned

**CLI:**
```bash
CODESENTINEL_WORKSPACE_ROOT=~/projects/org codesentinel review --cross-repo
```

**Validation:**
- Create two repos with a shared lib dependency, change the shared lib, verify consumer repos are flagged
- Test with no cross-repo setup (should be a no-op)
</details>

<details>
<summary><strong>3. Semver contract validation</strong></summary>

<br>

**Objective:** Flag PRs that change public API surfaces in breaking ways.

**Files to create:**
- `src/graph/semver.ts` — SemverChecker

**How:**
- For JS/TS: compare exported types, function signatures between main and PR branch
- For Python: compare `__init__.py` exports and function signatures
- Breaking = removed export, changed parameter, narrowed return type
- Inline comment on the PR: "⚠️ `parseJson()` return type changed from `string` to `number` — this breaks consumers in `service-a`, `service-b`"

**Validation:**
- Rename an exported function in a shared lib, verify a semver break is flagged
- Add a new export (non-breaking), verify no false positive
</details>

---

## v0.4.0 — Custom Review Profiles & Rule Engine

**Theme:** Let teams define their own review DNA

**Why:** Every team has different standards. Frontend wants React hooks rules. Backend wants SQL injection patterns. One size doesn't fit all.

### Implementation

<details>
<summary><strong>1. YAML review profiles</strong></summary>

<br>

**Objective:** `profiles/frontend.yml` auto-applies when reviewing `.tsx` files.

**Profile file — `profiles/frontend.yml`:**
```yaml
name: frontend
match: "**/*.{tsx,jsx}"
extends: base
rules:
  - id: "no-setstate-in-effect"
    pattern: "useEffect\\(.*setState"
    severity: "high"
    message: "Avoid setState inside useEffect — creates infinite loops"
  - id: "prefer-usecallback"
    pattern: "useEffect\\(\\[\\]\\).*\\n.*function"
    severity: "low"
    message: "Consider useCallback for stable function references"
model:
  provider: anthropic
  model: claude-3-haiku
```

**Files to create:**
- `src/profiles/index.ts` — ProfileManager
- `src/profiles/loader.ts` — discovers and parses profile YAML files
- `src/profiles/matcher.ts` — glob-matches files to profiles

**How:**
- ProfileManager scans `profiles/*.yml` and `.codesentinel/profiles/*.yml`
- Each file is analyzed against all profiles; matched profiles inject their rules + model override
- `extends: base` merges with the built-in rules
- CLI: `--profile frontend` to force a profile regardless of file patterns

**Validation:**
- Create a `profiles/frontend.yml`, review a `.tsx` file, verify profile rules appear in findings
- Review a `.py` file, verify frontend profile is NOT applied
</details>

<details>
<summary><strong>2. Rule DSL — zero-code custom rules</strong></summary>

<br>

**Objective:** Write custom rules in YAML, no TypeScript plugin needed.

```yaml
rules:
  - id: "no-bare-await-in-loop"
    name: "No bare await in loop"
    pattern: "for.*\\n.*await"
    severity: "performance"
    category: "smell"
    message: "Bare await in a loop serializes execution. Use Promise.all() instead."
    suggestion: "Collect promises into an array, then await Promise.all()"
    filePatterns: ["**/*.ts"]
    confidence: 0.9
```

**Files to modify:**
- `src/analyzer/index.ts` — add a regex-based rule engine that matches against the custom DSL
- `src/config/types.ts` — `CustomRule` interface already exists, extend with `pattern` (regex string)

**How:**
- Rules are parsed from YAML profiles or `config.customRules`
- At analysis time, each rule's regex `pattern` is tested against every line of matching files
- Matches produce findings with the specified severity and message
- Built-in ESLint-inspired priority: regex rules run first (cheap), then AI (expensive), then linters

**Validation:**
- Add a custom rule via config, review a file that matches, verify finding appears
- Test with a negative case (file that shouldn't match)
</details>

<details>
<summary><strong>3. Rule marketplace — share via gist URL</strong></summary>

<br>

**Objective:** `--install-rule https://gist.github.com/user/abc123` downloads and applies a rule.

**CLI:**
```bash
codesentinel install-rule https://gist.github.com/user/abc123
codesentinel install-rule user/repo/rules/security.yml@v1
codesentinel list-rules
codesentinel uninstall-rule no-bare-await-in-loop
```

**Files to create:**
- `src/registry/index.ts` — RuleRegistry class
- `src/registry/store.ts` — stores installed rules in `.codesentinel/rules/`

**How:**
- Fetches raw YAML from gist or GitHub URL
- Validates the rule schema
- Saves to `.codesentinel/rules/<id>.yml`
- Auto-loaded on next run
- Version pinning via `@tag` or `@sha`

**Validation:**
- Publish a gist with a rule YAML, install it via URL, verify the rule works
- Install a second version, verify only the pinned version runs
</details>

<details>
<summary><strong>4. Per-author review strictness</strong></summary>

<br>

**Objective:** Junior devs get verbose reviews with explanations. Seniors get terse notes.

**Config:**
```yaml
authors:
  - pattern: "*.bot"
    severity: "detailed"    # show all findings with full explanations
  - pattern: "alice.*senior"
    severity: "terse"       # only critical + high, one-liners
  - pattern: "*"
    severity: "normal"      # default
```

**Files to modify:**
- `src/engine/index.ts` — read `GITHUB_ACTOR` env var, match against author config
- `src/prompts/review.ts` — add `{{review_tone}}` variable: `detailed` / `normal` / `terse`

**Validation:**
- Set GITHUB_ACTOR=bot, run review, verify output has full explanations
- Set GITHUB_ACTOR=alice-senior, run review, verify only critical findings shown
</details>

---

## v0.5.0 — CI/CD Native Mode

**Theme:** First-class citizen in every pipeline

**Why:** CodeSentinel needs to be as fast and integrated as ESLint. A review should take <30s and produce native CI artifacts.

### Implementation

<details>
<summary><strong>1. Quick mode — `codesentinel pr-check`</strong></summary>

<br>

**Objective:** Single command that runs review + gate + score in one pass. Targets <30s runtime.

**CLI:**
```bash
codesentinel pr-check           # review + gate + score, exit non-zero on fail
codesentinel pr-check --fast    # skip AI entirely, static analysis only
```

**Files to create:**
- `src/engine/quick.ts` — QuickEngine that runs static analysis, gate, and score in parallel

**How:**
- Static analysis and scoring run in parallel (both are local, no AI)
- AI review runs only if static analysis passes the gate (avoid wasting AI calls on obviously bad PRs)
- If AI review is enabled AND gate passes, run AI with a 15s timeout — if it exceeds, fall back to static-only results
- All results merged into a single report

**Validation:**
- Run `pr-check` on a repo with no issues, verify exit 0 and <30s
- Run on a repo with gate failures, verify exit non-zero without calling AI
</details>

<details>
<summary><strong>2. GitHub Check Run annotations</strong></summary>

<br>

**Objective:** Findings appear as inline annotations in the GitHub Checks UI, not just PR comments.

**Files to create:**
- `src/github/checks.ts` — CheckRunReporter

**How:**
```ts
await octokit.checks.create({
  owner, repo,
  name: "CodeSentinel",
  head_sha: sha,
  status: "completed",
  conclusion: findings.length > 0 ? "neutral" : "success",
  output: {
    title: "CodeSentinel Review",
    summary: `${findings.length} finding(s)`,
    annotations: findings.map(f => ({
      path: f.file,
      start_line: f.line,
      end_line: f.line,
      annotation_level: f.severity === "critical" ? "failure" : "warning",
      message: f.comment,
    })),
  },
});
```

**Validation:**
- Run on a PR, verify annotations appear in the Checks tab
- Test with 0 findings (should show "success" conclusion)
</details>

<details>
<summary><strong>3. Multi-platform CI output formats</strong></summary>

<br>

**Objective:** Native output for Bitbucket, GitLab, Azure DevOps.

**Files to create:**
- `src/export/bitbucket.ts` — Bitbucket code insights + annotations
- `src/export/gitlab.ts` — GitLab MR comments + code quality report
- `src/export/azure.ts` — Azure DevOps PR comments + SARIF

**CLI:**
```bash
codesentinel review --format gitlab > gl-code-quality-report.json
codesentinel review --format bitbucket --bitbucket-project KEY --bitbucket-repo slug
codesentinel review --format azure > azure-sarif.json
```

**Validation:**
- Run with `--format gitlab`, verify JSON structure matches GitLab code quality spec
- Run with `--format bitbucket` (dry-run, no API calls), verify annotations generated
</details>

<details>
<summary><strong>4. Score trend graph</strong></summary>

<br>

**Objective:** PR status includes a sparkline of the last 5 quality scores.

**Files to modify:**
- `src/dashboard/index.ts` — add trend endpoint
- `src/scorer/index.ts` — persist score history to `.codesentinel/score-history.json`

**How:**
- After each score run, append `{ timestamp, score, sha }` to the history file
- PR comment includes: `Score: 78/100 📈 (+3 from last run)`
- Dashboard shows the trend graph

**Validation:**
- Run score 3 times, verify trend data accumulates
- Verify PR comment includes trend arrow
</details>

<details>
<summary><strong>5. Granular fail modes</strong></summary>

<br>

**Objective:** `--fail-on new-findings-only` — only fail if the PR introduces NEW findings, not pre-existing ones.

**CLI:**
```bash
codesentinel gate --fail-on new-findings-only
codesentinel gate --fail-on severity-upgrade
codesentinel gate --fail-on introduced-regression
```

**Files to modify:**
- `src/gate/index.ts` — add `failOn` option to GateConfig
- `src/config/types.ts` — add `failOn: "all" | "new-findings-only" | "severity-upgrade" | "introduced-regression"`

**How:**
- `new-findings-only`: compare findings against `main` branch baseline, only fail on delta
- `severity-upgrade`: fail if any existing finding was bumped to higher severity
- `introduced-regression`: fail if a previously passing test or metric regresses

**Validation:**
- Run gate on a PR with pre-existing findings, verify `--fail-on new-findings-only` passes if no new issues
- Run on a PR that upgrades a low finding to critical, verify `--fail-on severity-upgrade` catches it
</details>

---

## v0.6.0 — Autonomous Fix Agent

**Theme:** Ship it without lifting a finger

**Why:** The fastest code review is the one that fixes itself. CodeSentinel should be able to create fix PRs, verify them, and merge trivial ones automatically.

### Implementation

<details>
<summary><strong>1. AI creates a fix branch + PR</strong></summary>

<br>

**Objective:** Instead of just commenting, the AI creates a branch with the fix and opens a PR.

**CLI:**
```bash
codesentinel fix --create-pr                          # creates PR with fixes
codesentinel fix --create-pr --pr-target develop      # target branch
codesentinel fix --create-pr --pr-label auto-fix      # label the PR
```

**Files to create:**
- `src/github/pr-creator.ts` — PRCreator class

**How:**
```ts
// 1. Apply fixes locally
// 2. Create a branch: codesentinel/fix/<issue-number>-<slug>
// 3. Commit and push
// 4. Open PR with description from the fix findings
await octokit.pulls.create({
  owner, repo,
  title: `[auto-fix] ${findings.length} issue(s) fixed`,
  head: `codesentinel/fix/${prNumber}-${slug}`,
  base: prTarget,
  body: `## 🤖 Automated Fix PR\n\nIssues fixed:\n${fixDescriptions}`,
});
```

**Validation:**
- Run fix with `--create-pr`, verify a branch is pushed and PR is opened
- Verify PR description includes all fixed issues with explanations
</details>

<details>
<summary><strong>2. Auto-merge for low-risk fixes</strong></summary>

<br>

**Objective:** Fixes below a confidence threshold skip auto-merge. Only trivial, verified fixes get merged automatically.

**CLI:**
```bash
codesentinel fix --auto-merge                         # auto-merge if confidence >= 90
codesentinel fix --auto-merge --min-confidence 80     # lower the bar
```

**Files to modify:**
- `src/engine/fix.ts` — add confidence scoring after each fix attempt

**How:**
```ts
interface FixConfidence {
  score: number;            // 0-100
  reasons: string[];        // "change is a rename", "test still passes"
  autoMergeEligible: boolean;
}

function rateFixConfidence(original: string, fixed: string, testPassed: boolean): FixConfidence {
  const diffSize = diffChars(original, fixed);
  const isTrivial = diffSize < 20 && testPassed && !fixed.includes("TODO");
  return {
    score: isTrivial ? 95 : 60,
    reasons: isTrivial ? ["Small diff", "Tests pass"] : ["Non-trivial change"],
    autoMergeEligible: isTrivial,
  };
}
```

**Auto-merge eligibility:**
- Diff < 20 characters changed
- Lint passes
- Tests pass
- No new findings introduced
- Not a security-related change

**Validation:**
- Fix a `console.log` with `--auto-merge`, verify PR is auto-merged
- Fix a security issue with `--auto-merge`, verify it is NOT auto-merged (blocked by security check)
</details>

<details>
<summary><strong>3. Sandboxed dry-run (Docker)</summary>

<br>

**Objective:** Run fixes in a throwaway Docker container to avoid polluting the working directory.

**CLI:**
```bash
codesentinel fix --sandbox                           # run in Docker
codesentinel fix --sandbox --sandbox-image node:20   # custom image
```

**Files to create:**
- `src/sandbox/docker.ts` — DockerSandbox

**How:**
```ts
// 1. Mount repo read-only
// 2. Create a writable overlay for the fix
// 3. Run the fix inside the container
// 4. Lint + test inside the container
// 5. Extract the fixed files from the overlay
// 6. Destroy the container
docker run --rm \
  -v $PWD:/repo:ro \
  -v $PWD/.codesentinel-sandbox:/workspace \
  node:20 \
  sh -c "cp -r /repo /workspace && cd /workspace && node /codesentinel/dist/index.js fix"
```

**Validation:**
- Run `--sandbox`, verify no files in the working directory are modified
- Verify fixed files appear in `.codesentinel-sandbox/`
- Verify the container is removed after the run (`docker ps -a` shows nothing)
</details>

<details>
<summary><strong>4. Rollback detection & auto-revert</summary>

<br>

**Objective:** If a fix PR causes test failures or metric degradation, auto-revert.

**Files to create:**
- `src/github/auto-revert.ts` — AutoReverter

**How:**
- After merging a fix PR, wait for CI to complete (poll Checks API)
- If CI fails on the fix PR's commit, create a revert PR:
```ts
// 1. Detect CI failure on the auto-merge commit
// 2. Create revert PR
await octokit.pulls.create({
  owner, repo,
  title: `[auto-revert] Reverting ${fixPR} — CI failed`,
  head: `codesentinel/revert/${fixPR}`,
  base: "main",
  body: `## ⚠️ Auto-Revert\n\nFix PR #${fixPR} caused CI to fail.\n\nReverting commit ${sha}.`,
});
// 3. Auto-merge the revert (it's just a revert)
```

**Rollback triggers:**
- Test suite fails (exit non-zero)
- Lint introduces new errors
- Score drops by >10 points
- New critical/security findings appear

**Validation:**
- Merge a fix that breaks a test, verify revert PR is created
- Merge a fix that passes all checks, verify no revert is created
</details>

---

## How to use this roadmap

1. **Open a GitHub issue** per version (or per feature within a version)
2. Copy the feature block into the issue description
3. Break into tasks following the `### Implementation` sub-items
4. Reference the relevant source files and validation steps
5. Assign yourself and start coding

Example:

```markdown
## Title: v0.2.0 — Session-based chat memory

## Objective
/ask remembers the last 10 exchanges so follow-up questions work.

## Files to modify
- src/engine/index.ts — add chatHistory field
- src/prompts/chat.ts — add {{chat_history}} variable

## Implementation
[copy from above]

## Validation
[copy from above]
```

---

<p align="center">
  <sub>Priority: v0.2.0 > v0.3.0 > v0.4.0 > v0.5.0 > v0.6.0</sub><br>
  <sub>Estimated effort: 1-2 weeks per version for a solo dev</sub>
</p>
