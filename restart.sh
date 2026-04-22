#!/usr/bin/env bash
# Restart the todo-ui server.
# Uses the same env vars as compose.d/todo-ui.sh.
set -euo pipefail

TODO_DIR="${TODO_DIR:-${CLAUDE_CWD:-$(pwd)}/plans/todo}"
CLAUDE_CWD="${CLAUDE_CWD:-$(pwd)}"
TODO_UI_PORT="${TODO_UI_PORT:-3456}"
LOG="/tmp/todo-ui.log"

cd "$(dirname "$0")"

# Resolve bun via mise so this works without mise shell activation.
if ! command -v bun >/dev/null 2>&1; then
  if command -v mise >/dev/null 2>&1; then
    BUN="$(mise which bun)"
  else
    echo "bun not found and mise is not installed" >&2
    exit 1
  fi
else
  BUN="$(command -v bun)"
fi

# Kill existing server
if pid=$(pgrep -f "bun src/server.ts" 2>/dev/null); then
  echo "Stopping server (PID $pid)..."
  kill "$pid" 2>/dev/null || true
  # Wait for it to exit
  for _ in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.2
  done
fi

echo "Starting server (port $TODO_UI_PORT)..."
TODO_DIR="$TODO_DIR" \
CLAUDE_CWD="$CLAUDE_CWD" \
TODO_UI_PORT="$TODO_UI_PORT" \
TODO_UI_HOST="${TODO_UI_HOST:-0.0.0.0}" \
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}" \
nohup "$BUN" src/server.ts > "$LOG" 2>&1 &
bun_pid=$!

# Wait for the server to report it's listening (bundling can take a few seconds).
for _ in $(seq 1 50); do
  if grep -q "TODO UI server listening" "$LOG" 2>/dev/null; then
    echo "Server running (PID $bun_pid) — log: $LOG"
    exit 0
  fi
  kill -0 "$bun_pid" 2>/dev/null || break
  sleep 0.2
done

echo "Server failed to start. Log:"
tail -20 "$LOG"
exit 1
