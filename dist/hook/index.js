import { writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
const MAX_HIGH_DEFAULT = 10;
const DEFAULT_MAX_HIGH = MAX_HIGH_DEFAULT;
const DEFAULT_MAX_ITERATIONS = 5;
const PRE_COMMIT_SCRIPT = `#!/bin/sh
# CodeSentinel AI — pre-commit hook
# Installed by: codesentinel init-hook
# Run static analysis on staged files before committing.

set -e

echo "🔍 CodeSentinel: Running pre-commit check..."

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(ts|tsx|js|jsx|py|go|java|rb)$' || true)

if [ -z "$STAGED" ]; then
  echo "✅ CodeSentinel: No staged source files to check."
  exit 0
fi

# Run CodeSentinel gate on staged files
if command -v codesentinel &> /dev/null; then
  codesentinel gate --min-score 0 --max-critical 0 --max-high ${DEFAULT_MAX_HIGH}
  GATE_EXIT=$?
  if [ $GATE_EXIT -ne 0 ]; then
    echo "❌ CodeSentinel: Gate check failed. Fix issues before committing."
    echo "   To bypass: git commit --no-verify"
    exit 1
  fi
  echo "✅ CodeSentinel: All checks passed."
else
  echo "⚠️  CodeSentinel not found in PATH — skipping check."
  echo "   Install: npm install -g @dharmiklathiya/codesentinel_ai"
fi
`;
const POST_COMMIT_SCRIPT = `#!/bin/sh
# CodeSentinel AI — post-commit build-fix hook
# Installed by: codesentinel init-hook --type post-commit
# Runs build after each commit and auto-fixes failures.

set -e

MAX_ITER=${DEFAULT_MAX_ITERATIONS}
echo "🔧 CodeSentinel: Running post-commit build check..."

for i in $(seq 1 $MAX_ITER); do
  echo "=== Build-Fix Iteration $i/$MAX_ITER ==="

  FAILED=0
  npm run build 2>&1 || FAILED=1
  npm run typecheck 2>&1 || FAILED=1

  if [ $FAILED -eq 0 ]; then
    echo "✅ Build succeeded."
    exit 0
  fi

  if ! command -v codesentinel &> /dev/null; then
    echo "❌ Build failed and codesentinel not found in PATH."
    echo "   Install: npm install -g @dharmiklathiya/codesentinel_ai"
    exit 1
  fi

  echo "❌ Build failed. Running auto-fix..."
  codesentinel fix --auto-fix 2>&1 || true

  git add -A
  if git diff --cached --quiet; then
    echo "⚠️  No changes produced by fix — continuing"
    continue
  fi

  git commit -m "CodeSentinel: auto-fix build errors [skip ci]"
  echo "✅ Fix committed."
done

echo "❌ Build failed after $MAX_ITER iterations."
exit 1
`;
export function installHook(root, type = "pre-commit") {
    const hookDir = join(root, ".git", "hooks");
    const hookName = type === "post-commit" ? "post-commit" : "pre-commit";
    const hookPath = join(hookDir, hookName);
    const script = type === "post-commit" ? POST_COMMIT_SCRIPT : PRE_COMMIT_SCRIPT;
    writeFileSync(hookPath, script, "utf8");
    chmodSync(hookPath, 0o755);
    return hookPath;
}
//# sourceMappingURL=index.js.map