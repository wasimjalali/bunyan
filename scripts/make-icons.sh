#!/usr/bin/env bash
# Generate the macOS .icns set from the source SVG (build/icon/icon.svg).
#
# Requires a rasteriser. Either is fine:
#   - rsvg-convert  (brew install librsvg)
#   - or any tool that can render build/icon/icon.svg to a 1024x1024 PNG
#
# Then iconutil (ships with macOS) packs the iconset into icon.icns.
set -euo pipefail

ICON_DIR="build/icon"
SVG="$ICON_DIR/icon.svg"
ICONSET="$ICON_DIR/icon.iconset"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
  echo "(or render $SVG to PNGs with another tool, then run iconutil)." >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# macOS expects these sizes, including @2x retina variants.
for size in 16 32 128 256 512; do
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$ICONSET/icon_${size}x${size}.png"
  double=$((size * 2))
  rsvg-convert -w "$double" -h "$double" "$SVG" -o "$ICONSET/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$ICON_DIR/icon.icns"
rm -rf "$ICONSET"
echo "Wrote $ICON_DIR/icon.icns"
