#!/bin/bash
# Cloud (Claude Code on the web) sessions only: prepare the browser-test toolchain so
# overnight PR checks can run. Local machines keep their own setup. Never blocks startup.
set -uo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
exe=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1 || true)
if [ ! -d node_modules/@playwright/test ]; then
  npm ci >/dev/null 2>&1 || echo "session-start: npm ci failed; tests unavailable"
fi
if [ -n "$exe" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then echo "export CHROMIUM_EXECUTABLE=$exe" >> "$CLAUDE_ENV_FILE"; fi
