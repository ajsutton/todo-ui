#!/usr/bin/env bash
# Restart the todo-ui server.
# Uses the same env vars as compose.d/todo-ui.sh.
set -euo pipefail

TODO_DIR="${TODO_DIR:-${CLAUDE_CWD:-$(pwd)}/plans/todo}"
CLAUDE_CWD="${CLAUDE_CWD:-$(pwd)}"
TODO_UI_PORT="${TODO_UI_PORT:-3456}"
LOG="/tmp/todo-ui.log"

cd "$(dirname "$0")"

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
nohup bun src/server.ts > "$LOG" 2>&1 &

sleep 1
if kill -0 $! 2>/dev/null; then
  echo "Server running (PID $!) — log: $LOG"
else
  echo "Server failed to start. Log:"
  tail -20 "$LOG"
  exit 1
fi
