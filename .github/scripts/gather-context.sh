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