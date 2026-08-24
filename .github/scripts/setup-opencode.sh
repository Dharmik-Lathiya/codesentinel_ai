#!/usr/bin/env bash
# setup-opencode.sh — installs the opencode binary for GitHub Actions and sets git identity.
# Usage: .github/scripts/setup-opencode.sh
# Install order: npm (primary, matches workflow usage) -> GitHub release tarball (fallback).
set -euo pipefail

OPENCODE_VERSION="${OPENCODE_VERSION:-latest}"
REPO="anomalyco/opencode"
ARCH="linux-x64"
case "$(uname -m)" in
  aarch64|arm64) ARCH="linux-arm64" ;;
  x86_64|amd64)  ARCH="linux-x64" ;;
esac

as_root() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo "$@"; fi
}

install_via_npm() {
  echo "Installing opencode via npm (${OPENCODE_VERSION})..."
  local spec="opencode-ai"
  [ "$OPENCODE_VERSION" != "latest" ] && spec="opencode-ai@${OPENCODE_VERSION}"
  if [ -w "$(npm config get prefix)" ]; then
    npm install -g "$spec"
  else
    as_root npm install -g "$spec"
  fi
}

install_via_release() {
  echo "Installing opencode ${OPENCODE_VERSION} (${ARCH}) from GitHub releases..."
  local CURL_ARGS=( -fsSL )
  [ -n "${GH_TOKEN:-}" ] && CURL_ARGS+=( -H "Authorization: Bearer ${GH_TOKEN}" )
  local RELEASE_URL="https://api.github.com/repos/${REPO}/releases/latest"
  [ "$OPENCODE_VERSION" != "latest" ] && RELEASE_URL="https://api.github.com/repos/${REPO}/releases/tags/${OPENCODE_VERSION}"
  local DOWNLOAD_URL
  DOWNLOAD_URL=$(curl "${CURL_ARGS[@]}" "$RELEASE_URL" \
    | jq -r '.assets[] | select(.name == "opencode-'"${ARCH}"'.tar.gz") | .browser_download_url')
  if [ -z "$DOWNLOAD_URL" ] || [ "$DOWNLOAD_URL" = "null" ]; then
    echo "Error: could not find opencode asset opencode-${ARCH}.tar.gz in ${REPO} releases" >&2
    return 1
  fi
  curl -fsSL "$DOWNLOAD_URL" -o /tmp/opencode.tar.gz
  as_root tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin/
  as_root chmod +x /usr/local/bin/opencode
  rm -f /tmp/opencode.tar.gz
}

if install_via_npm; then
  :
else
  echo "npm install failed — falling back to GitHub release tarball..." >&2
  install_via_release
fi

command -v opencode >/dev/null || { echo "Error: opencode not on PATH after install" >&2; exit 1; }
opencode --version 2>&1 || true

git config --local user.name "${CODESENTINEL_GIT_NAME:-CodeSentinel Bot}"
git config --local user.email "${CODESENTINEL_GIT_EMAIL:-bot@codesentinel.ai}"
echo "OpenCode installed at: $(which opencode)"
