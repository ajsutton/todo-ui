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

## Usage

```bash
# Start the server (watches the current directory for TODO.md)
bun src/server.ts [TODO_DIR]

# Or use the restart script
./restart.sh
```

Open `http://localhost:3000` (default port).

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
