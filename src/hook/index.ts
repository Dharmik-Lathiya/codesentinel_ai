import { writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MAX_HIGH_THRESHOLD = 10;

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
  codesentinel gate --min-score 0 --max-critical 0 --max-high ${DEFAULT_MAX_HIGH_THRESHOLD}
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

export function installHook(root: string): string {
  const hookDir = join(root, ".git", "hooks");
  const hookPath = join(hookDir, "pre-commit");
  writeFileSync(hookPath, PRE_COMMIT_SCRIPT, "utf8");
  chmodSync(hookPath, 0o755);
  return hookPath;
}
