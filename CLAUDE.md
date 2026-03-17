# todo-ui

A real-time TODO dashboard built with Bun and vanilla JavaScript.

## Non-Negotiables

- **URL is the source of truth for UI state.** Reloading the page must return the user to the exact same view — filters, sort order, selected detail panel, and any other UI state must be persisted in URL query parameters. When adding new stateful UI features, always include them in `syncUrl()` and `getUrlParams()`.
- **Default filter is "active".** When no status filter is specified in the URL, show only active (not done) items.

## Architecture

- Server: Bun HTTP + WebSocket (`src/server.ts`)
- Client: Vanilla JS, no framework (`public/app.js`)
- Real-time updates via WebSocket push on filesystem changes
- TODO data lives in markdown table files, parsed by `src/lib/parser.ts`
- Atomic file writes (temp + rename) to prevent partial reads

## URL Parameters

| Param    | Default    | Description                        |
|----------|------------|------------------------------------|
| `type`   | (all)      | Filter by type (Review, PR, etc.)  |
| `status` | `active`   | `active`, `done`, or `all`         |
| `search` | (none)     | Full-text search on description    |
| `sort`   | `priority` | Sort column                        |
| `dir`    | `asc`      | Sort direction (`asc` or `desc`)   |
| `detail` | (none)     | ID of open detail panel            |
