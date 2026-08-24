#!/usr/bin/env bash
set -e

echo "🔧 CodeSentinel AI — Setup"
echo ""

if [ ! -d ".git" ]; then
  echo "❌ Not a git repo. Run this from your project root."
  exit 1
fi

mkdir -p .github/workflows

cat > .github/workflows/codesentinel.yml << 'WORKFLOW'
name: CodeSentinel AI

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

jobs:
  codesentinel:
    if: >
      github.event.issue.pull_request &&
      (startsWith(github.event.comment.body, '/review') ||
       startsWith(github.event.comment.body, '/fix') ||
       startsWith(github.event.comment.body, '/audit') ||
       startsWith(github.event.comment.body, '/score') ||
       startsWith(github.event.comment.body, '/testgen') ||
       startsWith(github.event.comment.body, '/gate') ||
       startsWith(github.event.comment.body, '/deadcode') ||
       startsWith(github.event.comment.body, '/describe') ||
       startsWith(github.event.comment.body, '/plan') ||
       startsWith(github.event.comment.body, '/ask'))
    runs-on: ubuntu-latest
    steps:
      - name: Extract command
        id: cmd
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.comment.body.trim();
            const match = body.match(/^\/(review|fix|audit|score|testgen|gate|deadcode|describe|plan|ask)\b/i);
            if (!match) { core.setFailed('No valid command'); return; }
            core.setOutput('mode', match[1].toLowerCase());

      - name: Export PR number for comment posting
        id: prnum
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR="${{ github.event.issue.number }}"
          if [ -n "$PR" ] && [ "$PR" != "null" ]; then
            echo "GITHUB_PR_NUMBER=$PR" >> "$GITHUB_ENV"
          fi

      - name: Checkout PR
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.issue.pull_request.head.ref }}
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run CodeSentinel
        run: |
          npx @dharmiklathiya/codesentinel_ai@latest ${{ steps.cmd.outputs.mode }} 2>&1 | tee /tmp/cs-out.txt || true

      - name: Post comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let out = ''; try { out = fs.readFileSync('/tmp/cs-out.txt','utf8'); } catch {}
            const mode = '${{ steps.cmd.outputs.mode }}';
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `### CodeSentinel — ${mode}\n\n\`\`\`\n${out}\n\`\`\``
            });
WORKFLOW

echo "✅ Created .github/workflows/codesentinel.yml"
echo ""
echo "🚀 Commit and push:"
echo ""
echo "   git add .github/workflows/codesentinel.yml"
echo "   git commit -m 'Add CodeSentinel AI'"
echo "   git push"
echo ""
echo "💬 Then comment on any PR:"
echo "   /review    — AI code review"
echo "   /fix       — propose fixes"
echo "   /audit     — full repo audit"
echo "   /score     — quality score"
echo "   /testgen   — generate tests"
echo "   /gate      — CI quality gate"
echo "   /deadcode  — dead code analysis"
echo "   /describe  — describe the codebase"
echo "   /plan      — implementation plan"
echo "   /ask       — ask the codebase a question"
