#!/usr/bin/env bash
#
# Build, sign and install Bunyan as a local macOS app on this Mac.
#
# Personal use only: no Apple Developer ID is needed. The app is ad-hoc signed,
# which is enough to launch on the machine that built it. Distributing to other
# Macs without a Gatekeeper warning would need a Developer ID + notarization.
#
# Run it with: npm run app:local   (or: bash scripts/build-local-app.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="Bunyan"
CONFIG="build/electron-builder.local.json"
BUILT="release/mac-arm64/${APP_NAME}.app"
DEST="/Applications/${APP_NAME}.app"

echo "==> Ensuring node-pty spawn-helper is executable"
node scripts/fix-pty-perms.js

echo "==> Building app code and packaging (arm64)"
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-vite build
npx electron-builder --mac --config "$CONFIG"

# electron-builder copies node_modules verbatim; restore the bit here too so the
# packaged spawn-helper can exec even if node_modules perms ever drift.
echo "==> Restoring execute bit on packaged spawn-helper(s)"
find "$BUILT" -name spawn-helper -exec chmod +x {} +

# Re-seal the bundle after the chmod. Apple Silicon refuses to run unsigned
# binaries; an ad-hoc signature satisfies that for local use.
echo "==> Ad-hoc re-signing the bundle"
codesign --force --deep --sign - "$BUILT"
codesign --verify --strict "$BUILT"

echo "==> Installing to ${DEST}"
rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo ""
echo "==> Done. ${APP_NAME} is installed in /Applications."
echo "    If it's open, quit and reopen it to load the new build."
