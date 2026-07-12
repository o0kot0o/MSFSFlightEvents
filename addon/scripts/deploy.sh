#!/usr/bin/env bash
# Builds FlightEventsApp and syncs it directly into both this repo's
# Packages/ output and the live Community folder install - bypassing
# fspackagetool's own file-copy step, which has proven unreliable about
# actually overwriting changed files during iterative dev (see
# addon/README.md's "Known issue" section for the full story).
set -euo pipefail

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ADDON_DIR/PackageSources/FlightEventsApp/dist"
PKG="$ADDON_DIR/Packages/flight-events-efb-app/html_ui/efb_ui/efb_apps/FlightEventsApp"
LIVE="$APPDATA/Microsoft Flight Simulator 2024/Packages/Community/flight-events-efb-app/html_ui/efb_ui/efb_apps/FlightEventsApp"

echo "==> Building FlightEventsApp..."
(cd "$ADDON_DIR/PackageSources/FlightEventsApp" && npm run build)

echo "==> Syncing into repo Packages output..."
rm -rf "$PKG"
mkdir -p "$PKG"
cp -r "$DIST/." "$PKG/"
node "$ADDON_DIR/scripts/sync-layout.js" "$ADDON_DIR/Packages/flight-events-efb-app"

echo "==> Syncing into live Community install..."
rm -rf "$LIVE"
mkdir -p "$LIVE"
cp -r "$DIST/." "$LIVE/"
node "$ADDON_DIR/scripts/sync-layout.js" "$APPDATA/Microsoft Flight Simulator 2024/Packages/Community/flight-events-efb-app"

echo "==> Done. Verify with: grep -c <marker-string> \"$LIVE/FlightEventsApp.js\""
