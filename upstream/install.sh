#!/usr/bin/env bash
# Call Sheet macOS installer
#
# Downloads the latest release and installs it to /Applications, bypassing
# the Gatekeeper "app is damaged" false alarm that macOS shows for
# browser-downloaded unsigned apps (terminal downloads aren't quarantined).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wassermanproductions/call-sheet/main/install.sh | bash
set -euo pipefail

REPO="wassermanproductions/call-sheet"
ASSET="CallSheet-macOS.zip"

DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the latest Call Sheet (Apple Silicon)..."
curl -fL --progress-bar "https://github.com/$REPO/releases/latest/download/$ASSET" -o "$TMP/$ASSET"

echo "Installing to $DEST..."
rm -rf "$DEST/Call Sheet.app"
ditto -x -k "$TMP/$ASSET" "$DEST"
xattr -cr "$DEST/Call Sheet.app" 2>/dev/null || true

echo "✓ Call Sheet installed — launching."
open "$DEST/Call Sheet.app"
