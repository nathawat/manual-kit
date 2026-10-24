# Sourced by bin/manual-kit and scripts/setup.sh. Sets PLUGIN_ROOT, MANUAL_KIT_HOME (runtime packages, Chromium,
# logs; kept across plugin updates) and PLAYWRIGHT_BROWSERS_PATH, and checks Node.
#
# MANUAL_KIT_HOME, first that applies:
#   1. MANUAL_KIT_HOME already set
#   2. installed from a marketplace: <plugins>/cache/<marketplace>/<plugin>/<version> -> <plugins>/data/<plugin>-<marketplace>
#      (the plugin's ${CLAUDE_PLUGIN_DATA}; the Bash tool does not export it, so it is derived from the path)
#   3. CLAUDE_PLUGIN_DATA (hooks of a plugin loaded in place)
#   4. ${XDG_CACHE_HOME:-~/.cache}/manual-kit
mk_home() {
  if [ -n "${MANUAL_KIT_HOME:-}" ]; then printf '%s\n' "$MANUAL_KIT_HOME"; return; fi
  local version_dir="$PLUGIN_ROOT" plugin_dir market_dir cache_dir
  plugin_dir="$(dirname "$version_dir")"
  market_dir="$(dirname "$plugin_dir")"
  cache_dir="$(dirname "$market_dir")"
  if [ "$(basename "$cache_dir")" = cache ]; then
    local id
    id="$(printf '%s@%s' "$(basename "$plugin_dir")" "$(basename "$market_dir")" | LC_ALL=C sed 's/[^A-Za-z0-9_-]/-/g')"
    printf '%s/data/%s\n' "$(dirname "$cache_dir")" "$id"
    return
  fi
  if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then printf '%s\n' "${CLAUDE_PLUGIN_DATA%/}"; return; fi
  printf '%s/manual-kit\n' "${XDG_CACHE_HOME:-$HOME/.cache}"
}

# Node 22.17 or newer: the CLI uses fs.globSync, stable (no warning) from 22.17. Keep in step with package.json engines.
mk_check_node() {
  local version major minor
  if ! command -v node >/dev/null 2>&1; then
    echo "manual-kit: Node.js 22.17 or newer is needed and was not found (macOS: brew install node)." >&2
    return 3
  fi
  version="$(node -p 'process.versions.node')"
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 17 ]; }; then
    echo "manual-kit: Node.js 22.17 or newer is needed; this is $(node -v) (macOS: brew upgrade node)." >&2
    return 3
  fi
}

MANUAL_KIT_HOME="$(mk_home)"
export MANUAL_KIT_HOME
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$MANUAL_KIT_HOME/ms-playwright}"
