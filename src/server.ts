#!/usr/bin/env bun
import path from "node:path";
import { watch, readFileSync, existsSync } from "node:fs";
import { TodoWatcher } from "./lib/watcher.ts";
import {
  markComplete,
  markIncomplete,
  setPriority,
  setDue,
  refreshPrStatus,
  updateAll,
  addDiscoveredItems,
  runClaudePrompt,
} from "./lib/actions.ts";
import { appendLogEntry, getLogEntries } from "./lib/update-log.ts";
import type { DiscoveredItem, UpdateLogEntry } from "./types.ts";
import type { WsMessage } from "./types.ts";

const TODO_CONFIG_PATH = path.join(
  process.env.HOME ?? "~",
  ".claude",
  "todo-config.json",
);
const DEFAULT_TODO_DIR = path.join(process.cwd(), "plans/todo");

function readTodoDirFromConfig(): string {
  // Explicit env var takes precedence (used by tests)
  if (process.env.TODO_DIR) return process.env.TODO_DIR;
  try {
    if (existsSync(TODO_CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(TODO_CONFIG_PATH, "utf-8")) as {
        todoDir?: string;
      };
      if (config.todoDir) return config.todoDir;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_TODO_DIR;
}

const PORT = parseInt(process.env.TODO_UI_PORT ?? "3456", 10);
const HOST = process.env.TODO_UI_HOST ?? "127.0.0.1";
const CLAUDE_CWD = process.env.CLAUDE_CWD ?? process.cwd();
const PUBLIC_DIR = path.join(import.meta.dir, "..", "public");

const watcher = new TodoWatcher(readTodoDirFromConfig());

// Watch the config file for changes and switch directories
const configDir = path.dirname(TODO_CONFIG_PATH);
if (existsSync(configDir)) {
  watch(configDir, (_event, filename) => {
    if (filename !== path.basename(TODO_CONFIG_PATH)) return;
    const newDir = readTodoDirFromConfig();
    if (newDir !== watcher.getDir()) {
      console.log(`Config changed, switching TODO dir to ${newDir}`);
      try {
        watcher.switchDir(newDir);
      } catch (err) {
        console.error(`Failed to switch to ${newDir}:`, err);
      }
    }
  });
}

// Pending discovered items from auto-updates (awaiting user review)
let pendingDiscovered: DiscoveredItem[] = [];
let pendingTimestamp = "";

const AUTO_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
let autoUpdateRunning = false;

async function runAutoUpdate(): Promise<void> {
  if (autoUpdateRunning) return;
  autoUpdateRunning = true;
  try {
    const state = watcher.getState();
    const { results, discovered, errors } = await updateAll(watcher.getDir(), state.items);
    watcher.reload();

    const entry: UpdateLogEntry = {
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        id: r.id,
        oldStatus: r.oldStatus,
        newStatus: r.newStatus,
        oldPriority: r.oldPriority,
        newPriority: r.newPriority,
        doneDateSet: r.doneDateSet,
      })),
      discoveredCount: discovered.length,
      errors: errors.map((e) => ({ id: e.id, error: e.error })),
      source: "auto",
    };
    appendLogEntry(watcher.getDir(), entry);

    if (discovered.length > 0) {
      pendingDiscovered = discovered;
      pendingTimestamp = entry.timestamp;
      broadcast({
        type: "pending-discovered",
        data: { items: discovered, timestamp: pendingTimestamp },
      });
    }

    console.log(
      `[auto-update] ${results.length} changes, ${discovered.length} discovered, ${errors.length} errors`,
    );
  } catch (err) {
    console.error("[auto-update] failed:", err);
  } finally {
    autoUpdateRunning = false;
  }
}

setInterval(runAutoUpdate, AUTO_UPDATE_INTERVAL_MS);

type WS = Bun.ServerWebSocket<unknown>;
const clients = new Set<WS>();

function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      ws.send(payload);
    } catch {
      clients.delete(ws as WS);
    }
  }
}

watcher.onStateChange((state) => {
  broadcast({ type: "state", data: state });
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractIdFromPath(pathname: string, prefix: string): string | undefined {
  if (!pathname.startsWith(prefix)) return undefined;
  return pathname.slice(prefix.length).replace(/^\//, "") || undefined;
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // WebSocket upgrade
    if (pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Static files
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(Bun.file(path.join(PUBLIC_DIR, "index.html")));
    }
    if (pathname === "/style.css") {
      return new Response(Bun.file(path.join(PUBLIC_DIR, "style.css")));
    }
    if (pathname === "/app.js") {
      return new Response(Bun.file(path.join(PUBLIC_DIR, "app.js")));
    }

    // API routes
    if (req.method === "GET" && pathname === "/api/state") {
      return jsonResponse(watcher.getState());
    }

    if (req.method === "GET" && pathname.startsWith("/api/detail/")) {
      const id = extractIdFromPath(pathname, "/api/detail/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      const detail = watcher.getDetail(id);
      if (!detail) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse(detail);
    }

    if (req.method === "POST" && pathname.startsWith("/api/complete/")) {
      const id = extractIdFromPath(pathname, "/api/complete/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        markComplete(watcher.getDir(), id);
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 404);
      }
    }

    if (req.method === "POST" && pathname.startsWith("/api/incomplete/")) {
      const id = extractIdFromPath(pathname, "/api/incomplete/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        markIncomplete(watcher.getDir(), id);
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 404);
      }
    }

    if (req.method === "POST" && pathname.startsWith("/api/priority/")) {
      const id = extractIdFromPath(pathname, "/api/priority/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { priority?: string };
        if (!body.priority) return jsonResponse({ error: "Missing priority" }, 400);
        setPriority(watcher.getDir(), id, body.priority);
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 400);
      }
    }

    if (req.method === "POST" && pathname.startsWith("/api/due/")) {
      const id = extractIdFromPath(pathname, "/api/due/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { due?: string };
        setDue(watcher.getDir(), id, body.due ?? "");
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 400);
      }
    }

    if (req.method === "POST" && pathname === "/api/refresh") {
      try {
        const state = watcher.getState();
        const { results, discovered, errors } = await updateAll(watcher.getDir(), state.items, (current, total, phase, itemId) => {
          const data: { current: number; total: number; phase: string; itemId?: string } = { current, total, phase };
          if (itemId) data.itemId = itemId;
          broadcast({ type: "update-progress", data });
        });
        watcher.reload();

        const entry: UpdateLogEntry = {
          timestamp: new Date().toISOString(),
          results: results.map((r) => ({
            id: r.id,
            oldStatus: r.oldStatus,
            newStatus: r.newStatus,
            oldPriority: r.oldPriority,
            newPriority: r.newPriority,
            doneDateSet: r.doneDateSet,
          })),
          discoveredCount: discovered.length,
          errors: errors.map((e) => ({ id: e.id, error: e.error })),
          source: "manual",
        };
        appendLogEntry(watcher.getDir(), entry);

        // Clear pending if manual refresh also finds items (user will see them in the dialog)
        if (discovered.length > 0) {
          pendingDiscovered = [];
          pendingTimestamp = "";
          broadcast({ type: "pending-discovered", data: { items: [], timestamp: "" } });
        }

        return jsonResponse({ ok: true, results, discovered, errors });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    if (req.method === "POST" && pathname === "/api/add-discovered") {
      try {
        const body = (await req.json()) as { items?: DiscoveredItem[] };
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
          return jsonResponse({ error: "Missing items array" }, 400);
        }
        addDiscoveredItems(watcher.getDir(), body.items);
        watcher.reload();
        return jsonResponse({ ok: true, count: body.items.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    if (req.method === "POST" && pathname.startsWith("/api/refresh/")) {
      const id = extractIdFromPath(pathname, "/api/refresh/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const state = watcher.getState();
        const result = await refreshPrStatus(watcher.getDir(), id, state.items);
        watcher.reload();
        return jsonResponse({ ok: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    if (req.method === "POST" && pathname === "/api/claude") {
      const body = (await req.json()) as { prompt?: string };
      if (!body.prompt) {
        return jsonResponse({ error: "Missing prompt" }, 400);
      }

      const requestId = crypto.randomUUID();

      // Stream output via WebSocket in the background
      (async () => {
        try {
          broadcast({
            type: "claude-status",
            data: { requestId, status: "running", output: "" },
          });

          for await (const chunk of runClaudePrompt(CLAUDE_CWD, body.prompt!)) {
            if (chunk.kind === "text") {
              broadcast({
                type: "claude-status",
                data: { requestId, status: "running", output: chunk.text },
              });
            } else if (chunk.kind === "activity") {
              broadcast({
                type: "claude-status",
                data: { requestId, status: "running", output: "", activity: chunk.tool },
              });
            }
          }

          broadcast({
            type: "claude-status",
            data: { requestId, status: "done", output: "" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          broadcast({
            type: "claude-status",
            data: { requestId, status: "error", output: message },
          });
        }
      })();

      return jsonResponse({ ok: true, requestId }, 202);
    }

    // Pending discovered items from auto-updates
    if (req.method === "GET" && pathname === "/api/pending") {
      return jsonResponse({ items: pendingDiscovered, timestamp: pendingTimestamp });
    }

    if (req.method === "POST" && pathname === "/api/pending/dismiss") {
      pendingDiscovered = [];
      pendingTimestamp = "";
      broadcast({ type: "pending-discovered", data: { items: [], timestamp: "" } });
      return jsonResponse({ ok: true });
    }

    if (req.method === "POST" && pathname === "/api/pending/add") {
      try {
        const body = (await req.json()) as { items?: DiscoveredItem[] };
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
          return jsonResponse({ error: "Missing items array" }, 400);
        }
        addDiscoveredItems(watcher.getDir(), body.items);
        // Remove added items from pending
        const addedKeys = new Set(body.items.map((i) => `${i.repo}#${i.prNumber}`));
        pendingDiscovered = pendingDiscovered.filter((d) => !addedKeys.has(`${d.repo}#${d.prNumber}`));
        if (pendingDiscovered.length === 0) pendingTimestamp = "";
        broadcast({ type: "pending-discovered", data: { items: pendingDiscovered, timestamp: pendingTimestamp } });
        watcher.reload();
        return jsonResponse({ ok: true, count: body.items.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    // Update log
    if (req.method === "GET" && pathname === "/api/log") {
      const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
      const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
      const { entries, total } = getLogEntries(watcher.getDir(), limit, offset);
      return jsonResponse({ entries, total });
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      clients.add(ws as WS);
      const state = watcher.getState();
      ws.send(JSON.stringify({ type: "state", data: state } satisfies WsMessage));
      if (pendingDiscovered.length > 0) {
        ws.send(JSON.stringify({
          type: "pending-discovered",
          data: { items: pendingDiscovered, timestamp: pendingTimestamp },
        } satisfies WsMessage));
      }
    },
    close(ws) {
      clients.delete(ws as WS);
    },
    message(ws, message) {
      try {
        const parsed = JSON.parse(String(message)) as {
          type?: string;
          id?: string;
        };
        if (parsed.type === "getDetail" && parsed.id) {
          const detail = watcher.getDetail(parsed.id);
          if (detail) {
            ws.send(
              JSON.stringify({ type: "detail", data: detail } satisfies WsMessage),
            );
          }
        }
      } catch {
        // Ignore malformed messages
      }
    },
  },
});

// Watch public directory for changes and trigger browser reload
watch(PUBLIC_DIR, { recursive: true }, (event, filename) => {
  if (filename && (filename.endsWith(".js") || filename.endsWith(".css") || filename.endsWith(".html"))) {
    broadcast({ type: "reload" } as WsMessage);
  }
});

console.log(`TODO UI server listening on http://${HOST}:${PORT}`);
