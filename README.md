# todo-ui

Real-time TODO dashboard that watches markdown table files and presents them as a sortable, filterable web UI with live updates.

## Features

- Live updates via WebSocket — changes to TODO files appear instantly
- Sortable columns (ID, description, type, status, priority, due date)
- Filterable by type and completion status (defaults to active items)
- Detail panel for per-item notes (reads `TODO-N.md` files)
- PR status refresh via `gh pr view`
- Claude prompt integration for bulk operations
- URL-persisted state — reload returns the same view
- Dark/light theme (follows system preference)

## Setup

Requires [Bun](https://bun.sh) and [mise](https://mise.jdx.dev) (for tool versions).

```bash
mise install
bun install
```

## Configuration

The server and Claude skill both read the TODO directory from `~/.claude/todo-config.json`:

```json
{ "todoDir": "/absolute/path/to/your/todo/directory" }
```

The server watches this file and switches directories on the fly when it changes — no restart needed. If the file doesn't exist yet, the server will pick it up when it's first created.

Fallback order: `~/.claude/todo-config.json` > `$TODO_DIR` env var > `plans/todo/` in CWD.

## Claude Code Skill

This repo includes a Claude Code skill (`.claude/skills/todo/`) for managing TODOs conversationally. To make it available globally, symlink it into your user skills:

```bash
ln -s /path/to/todo-ui/.claude/skills/todo ~/.claude/skills/todo
```

On first use, the skill will ask where to store your TODO data and save the path to `~/.claude/todo-config.json`.

## Usage

```bash
# Start the server
bun src/server.ts

# Or use the restart script
./restart.sh
```

Open `http://localhost:3456` (default port, configurable via `$TODO_UI_PORT`).

**Warning:** The server has no authentication. It binds to `127.0.0.1` by default and should not be exposed to untrusted networks. Set `$TODO_UI_HOST` to override the listen address (e.g. `0.0.0.0` for containers).

## URL Parameters

| Param    | Default    | Description                        |
|----------|------------|------------------------------------|
| `type`   | (all)      | Filter by type (Review, PR, etc.)  |
| `status` | `active`   | `active`, `done`, or `all`         |
| `sort`   | `priority` | Sort column                        |
| `dir`    | `asc`      | Sort direction (`asc` or `desc`)   |
| `detail` | (none)     | ID of open detail panel            |

## Project Structure

```
src/
├── server.ts           # Bun HTTP/WebSocket server
├── types.ts            # TypeScript type definitions
└── lib/
    ├── parser.ts       # Markdown table → TodoItem[]
    ├── watcher.ts      # Filesystem watcher + state manager
    ├── actions.ts      # Complete/refresh/Claude actions
    └── markdown.ts     # Markdown → HTML renderer
public/
├── index.html          # Single-page shell
├── style.css           # Dark/light theme styles
└── app.js              # Client-side logic
```
