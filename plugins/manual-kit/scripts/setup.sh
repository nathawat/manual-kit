#!/usr/bin/env bash
# Installs what the bundled CLI needs at run time into MANUAL_KIT_HOME: playwright, pagedjs and typescript (pinned
# in runtime/package-lock.json) and Playwright's Chromium. Runs from the plugin's SessionStart hook (--background, in
# the background, output to setup.log) and from bin/manual-kit whenever something is missing. Idempotent: does
# nothing when runtime/package.json is unchanged since the last install. Never installs system software.
set -euo pipefail
PLUGIN_ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=env.sh
. "$PLUGIN_ROOT/scripts/env.sh"

background=0
[ "${1:-}" = --background ] && background=1

ready() { cmp -s "$PLUGIN_ROOT/runtime/package.json" "$MANUAL_KIT_HOME/.installed" 2>/dev/null; }
ready && exit 0

mk_check_node || exit $?
command -v npm >/dev/null 2>&1 || { echo "manual-kit: npm (comes with Node.js) was not found." >&2; exit 3; }
mkdir -p "$MANUAL_KIT_HOME"
if [ "$background" = 1 ]; then exec >>"$MANUAL_KIT_HOME/setup.log" 2>&1; fi

# one install at a time (the session-start hook and a first command can race); a lock older than 30 min is stale
lock="$MANUAL_KIT_HOME/.install.lock"
find "$lock" -maxdepth 0 -mmin +30 -exec rmdir {} \; 2>/dev/null || true
waited=0
until mkdir "$lock" 2>/dev/null; do
  ready && exit 0
  [ "$waited" = 0 ] && echo "manual-kit: another install is running; waiting for it..." >&2
  waited=$((waited + 1))
  [ "$waited" -gt 1200 ] && { echo "manual-kit: gave up waiting for $lock" >&2; exit 4; }
  sleep 1
done
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
ready && exit 0

echo "manual-kit: first run - installing playwright, pagedjs, typescript and Chromium into $MANUAL_KIT_HOME (a few minutes, once)..." >&2
cp "$PLUGIN_ROOT/runtime/package.json" "$PLUGIN_ROOT/runtime/package-lock.json" "$MANUAL_KIT_HOME/"
(cd "$MANUAL_KIT_HOME" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error) >&2
node "$MANUAL_KIT_HOME/node_modules/playwright/cli.js" install chromium >&2
cp "$PLUGIN_ROOT/runtime/package.json" "$MANUAL_KIT_HOME/.installed"
echo "manual-kit: ready ($MANUAL_KIT_HOME)" >&2
