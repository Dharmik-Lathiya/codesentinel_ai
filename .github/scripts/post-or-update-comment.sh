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