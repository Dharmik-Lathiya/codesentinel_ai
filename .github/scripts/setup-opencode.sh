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