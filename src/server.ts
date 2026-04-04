#!/usr/bin/env bun
import path from "node:path";
import { watch, readFileSync, existsSync } from "node:fs";
import { TodoWatcher } from "./lib/watcher.ts";
import {
  markComplete,
  markIncomplete,
  setPriority,
  setType,
  setDue,
  setDescription,
  setSubItemPriority,
  refreshPrStatus,
  updateAll,
  addDiscoveredItems,
  runClaudePrompt,
  saveDetailMarkdown,
  addManualItem,
} from "./lib/actions.ts";
import { appendLogEntry, getLogEntries } from "./lib/update-log.ts";
import { generateStandupReport, buildStandupClaudePrompt } from "./lib/standup.ts";
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
const HOST = process.env.TODO_UI_HOST ?? "0.0.0.0";
const CLAUDE_CWD = process.env.CLAUDE_CWD ?? process.cwd();
const PUBLIC_DIR = path.join(import.meta.dir, "..", "public");
const CLIENT_SRC_DIR = path.join(import.meta.dir, "client");

let bundledJs = "";

async function buildClientBundle(): Promise<void> {
  try {
    const result = await Bun.build({
      entrypoints: [path.join(CLIENT_SRC_DIR, "app.js")],
      target: "browser",
      format: "iife",
    });
    if (!result.success) {
      console.error("[build] Failed:", result.logs);
      return;
    }
    bundledJs = await result.outputs[0].text();
    console.log(`[build] Bundle built (${(bundledJs.length / 1024).toFixed(1)}kb)`);
  } catch (err) {
    console.error("[build] Error:", err);
  }
}

await buildClientBundle();

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

const AUTO_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
let autoUpdateRunning = false;

// In-memory cache for Claude standup report
interface StandupClaudeCache {
  output: string;
  generatedAt: string;
  forDate: string;
}
let standupClaudeCache: StandupClaudeCache | null = null;
let standupAutoGenerating = false;

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
        description: r.description,
        oldStatus: r.oldStatus,
        newStatus: r.newStatus,
        oldPriority: r.oldPriority,
        newPriority: r.newPriority,
        doneDateSet: r.doneDateSet,
      })),
      discoveredCount: discovered.length,
      errors: errors.map((e) => ({ id: e.id, description: e.description, error: e.error })),
      source: "auto",
    };
    appendLogEntry(watcher.getDir(), entry);

    if (discovered.length > 0) {
      addDiscoveredItems(watcher.getDir(), discovered);
      watcher.reload();
      broadcast({ type: "items-auto-added", data: { count: discovered.length, items: discovered } });
    }

    console.log(
      `[auto-update] ${results.length} changes, ${discovered.length} discovered (auto-added), ${errors.length} errors`,
    );
  } catch (err) {
    console.error("[auto-update] failed:", err);
  } finally {
    autoUpdateRunning = false;
  }
}

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

async function runStandupAutoGeneration(): Promise<void> {
  if (standupAutoGenerating) return;
  standupAutoGenerating = true;
  const today = new Date().toISOString().slice(0, 10);
  console.log("[standup] Auto-generating Claude standup report...");
  try {
    const prompt = buildStandupClaudePrompt(watcher.getDir());
    const requestId = "auto";
    let currentTurnText = "";

    broadcast({ type: "standup-status", data: { requestId, status: "running", output: "" } });

    for await (const chunk of runClaudePrompt(CLAUDE_CWD, prompt)) {
      if (chunk.kind === "text") {
        currentTurnText += chunk.text;
      } else if (chunk.kind === "activity") {
        currentTurnText = "";
        broadcast({ type: "standup-status", data: { requestId, status: "running", output: "", activity: chunk.tool } });
      }
    }

    standupClaudeCache = { output: currentTurnText, generatedAt: new Date().toISOString(), forDate: today };
    broadcast({ type: "standup-cache-updated", data: standupClaudeCache });
    console.log("[standup] Auto-generation complete");
  } catch (err) {
    console.error("[standup] Auto-generation failed:", err);
    broadcast({ type: "standup-status", data: { requestId: "auto", status: "error", output: String(err) } });
  } finally {
    standupAutoGenerating = false;
  }
}

function scheduleNextDailyStandup(): void {
  const now = new Date();
  const next5am = new Date(now);
  next5am.setHours(5, 0, 0, 0);
  if (next5am.getTime() <= now.getTime()) {
    next5am.setDate(next5am.getDate() + 1);
  }
  const ms = next5am.getTime() - now.getTime();
  console.log(`[standup] Next auto-generation in ${Math.round(ms / 1000 / 60)}m`);
  setTimeout(async () => {
    await runStandupAutoGeneration();
    scheduleNextDailyStandup();
  }, ms);
}

// On startup: if past 5am today and no cached report for today, generate immediately
{
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const today5am = new Date(now);
  today5am.setHours(5, 0, 0, 0);
  if (now.getTime() >= today5am.getTime() && (!standupClaudeCache || standupClaudeCache.forDate !== today)) {
    console.log("[standup] Server missed 5am generation, running now...");
    runStandupAutoGeneration();
  }
  scheduleNextDailyStandup();
}

// Schedule first update based on time since last auto-update
const recentLog = getLogEntries(watcher.getDir(), 1, 0);
const lastEntry = recentLog.entries[0];
const msSinceLast = lastEntry
  ? Date.now() - new Date(lastEntry.timestamp).getTime()
  : AUTO_UPDATE_INTERVAL_MS;
const firstDelay = Math.max(0, AUTO_UPDATE_INTERVAL_MS - msSinceLast);
console.log(`Next auto-update in ${Math.round(firstDelay / 1000)}s`);
setTimeout(() => {
  runAutoUpdate();
  setInterval(runAutoUpdate, AUTO_UPDATE_INTERVAL_MS);
}, firstDelay);

watcher.onStateChange((state) => {
  const detailIds = [...watcher.getDetailIds()];
  broadcast({ type: "state", data: { ...state, detailIds } });
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
      return new Response(bundledJs, {
        headers: { "Content-Type": "application/javascript; charset=utf-8" },
      });
    }
    // Serve Shoelace assets (CSS themes, icons, etc.) from node_modules
    if (pathname.startsWith("/sl/")) {
      const relPath = pathname.slice(4);
      const shoelaceBase = path.resolve(path.join(import.meta.dir, "../node_modules/@shoelace-style/shoelace/dist"));
      const assetPath = path.resolve(path.join(shoelaceBase, relPath));
      if (assetPath.startsWith(shoelaceBase) && existsSync(assetPath)) {
        const ext = path.extname(assetPath);
        const mimeType =
          ext === ".css" ? "text/css" :
          ext === ".svg" ? "image/svg+xml" :
          ext === ".js" ? "application/javascript" :
          "application/octet-stream";
        return new Response(Bun.file(assetPath), { headers: { "Content-Type": mimeType } });
      }
    }

    // API routes
    if (req.method === "GET" && pathname === "/api/state") {
      const state = watcher.getState();
      const detailIds = watcher.getDetailIds();
      return jsonResponse({
        ...state,
        detailIds: [...detailIds],
      });
    }

    if (req.method === "GET" && pathname.startsWith("/api/sub-items/")) {
      const id = extractIdFromPath(pathname, "/api/sub-items/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      const refs = watcher.getSubItems(id);
      return jsonResponse({ id, subItems: refs });
    }

    if (req.method === "GET" && pathname.startsWith("/api/detail/")) {
      const id = extractIdFromPath(pathname, "/api/detail/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      const detail = watcher.getDetail(id);
      if (!detail) return jsonResponse({ error: "Not found" }, 404);
      return jsonResponse(detail);
    }

    if (req.method === "POST" && pathname.startsWith("/api/detail/")) {
      const id = extractIdFromPath(pathname, "/api/detail/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { markdown?: string };
        if (typeof body.markdown !== "string") return jsonResponse({ error: "Missing markdown" }, 400);
        saveDetailMarkdown(watcher.getDir(), id, body.markdown);
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
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

    if (req.method === "POST" && pathname.startsWith("/api/sub-priority/")) {
      const parentId = extractIdFromPath(pathname, "/api/sub-priority/");
      if (!parentId) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { repo?: string; number?: number; priority?: string };
        if (!body.repo || !body.number || !body.priority) {
          return jsonResponse({ error: "Missing repo, number, or priority" }, 400);
        }
        setSubItemPriority(watcher.getDir(), parentId, body.repo, body.number, body.priority);
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 400);
      }
    }

    if (req.method === "POST" && pathname.startsWith("/api/type/")) {
      const id = extractIdFromPath(pathname, "/api/type/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { type?: string };
        if (!body.type?.trim()) return jsonResponse({ error: "Missing type" }, 400);
        setType(watcher.getDir(), id, body.type.trim());
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

    if (req.method === "POST" && pathname.startsWith("/api/description/")) {
      const id = extractIdFromPath(pathname, "/api/description/");
      if (!id) return jsonResponse({ error: "Missing id" }, 400);
      try {
        const body = (await req.json()) as { description?: string };
        if (!body.description?.trim()) return jsonResponse({ error: "Missing description" }, 400);
        setDescription(watcher.getDir(), id, body.description.trim());
        watcher.reload();
        return jsonResponse({ ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 400);
      }
    }

    if (req.method === "POST" && pathname === "/api/items") {
      try {
        const body = (await req.json()) as {
          description?: string;
          type?: string;
          priority?: string;
          status?: string;
        };
        if (!body.description?.trim()) return jsonResponse({ error: "Missing description" }, 400);
        const type = body.type || "Issue";
        const priority = body.priority || "P3";
        const status = body.status || "Open";
        const id = addManualItem(watcher.getDir(), body.description.trim(), type, priority, status);
        watcher.reload();
        return jsonResponse({ ok: true, id });
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
            description: r.description,
            oldStatus: r.oldStatus,
            newStatus: r.newStatus,
            oldPriority: r.oldPriority,
            newPriority: r.newPriority,
            doneDateSet: r.doneDateSet,
          })),
          discoveredCount: discovered.length,
          errors: errors.map((e) => ({ id: e.id, description: e.description, error: e.error })),
          source: "manual",
        };
        appendLogEntry(watcher.getDir(), entry);

        // Auto-add discovered items during manual refresh
        if (discovered.length > 0) {
          addDiscoveredItems(watcher.getDir(), discovered);
          watcher.reload();
        }

        return jsonResponse({ ok: true, results, discovered, errors });
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

          for await (const chunk of runClaudePrompt(watcher.getDir(), body.prompt!)) {
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

    // Standup report
    if (req.method === "GET" && pathname === "/api/standup") {
      try {
        const state = watcher.getState();
        const report = await generateStandupReport(watcher.getDir(), state.items);
        return jsonResponse(report);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ error: message }, 500);
      }
    }

    if (req.method === "GET" && pathname === "/api/standup/claude") {
      return jsonResponse(standupClaudeCache ?? { output: null, generatedAt: null, forDate: null });
    }

    if (req.method === "POST" && pathname === "/api/standup/claude") {
      try {
        const prompt = buildStandupClaudePrompt(watcher.getDir());
        const requestId = crypto.randomUUID();

        (async () => {
          try {
            broadcast({
              type: "standup-status",
              data: { requestId, status: "running", output: "" },
            });

            // Buffer text per turn — tool_use means intermediate text, reset it.
            // Only send the final turn's text (after all tool calls complete).
            let currentTurnText = "";

            for await (const chunk of runClaudePrompt(CLAUDE_CWD, prompt)) {
              if (chunk.kind === "text") {
                currentTurnText += chunk.text;
              } else if (chunk.kind === "activity") {
                // New tool use means current text was intermediate — discard it
                currentTurnText = "";
                broadcast({
                  type: "standup-status",
                  data: { requestId, status: "running", output: "", activity: chunk.tool },
                });
              }
            }

            // Cache the result
            const today = new Date().toISOString().slice(0, 10);
            standupClaudeCache = { output: currentTurnText, generatedAt: new Date().toISOString(), forDate: today };
            broadcast({ type: "standup-cache-updated", data: standupClaudeCache });

            broadcast({
              type: "standup-status",
              data: { requestId, status: "done", output: currentTurnText },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            broadcast({
              type: "standup-status",
              data: { requestId, status: "error", output: message },
            });
          }
        })();

        return jsonResponse({ ok: true, requestId }, 202);
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
      const detailIds = [...watcher.getDetailIds()];
      ws.send(JSON.stringify({ type: "state", data: { ...state, detailIds } }));
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

// Watch client source for JS changes — rebuild bundle then reload browsers
watch(CLIENT_SRC_DIR, { recursive: true }, async (_event, filename) => {
  if (filename && filename.endsWith(".js")) {
    await buildClientBundle();
    broadcast({ type: "reload" });
  }
});

// Watch public dir for CSS/HTML changes — reload browsers directly
watch(PUBLIC_DIR, { recursive: true }, (_event, filename) => {
  if (filename && (filename.endsWith(".css") || filename.endsWith(".html"))) {
    broadcast({ type: "reload" });
  }
});

console.log(`TODO UI server listening on http://${HOST}:${PORT}`);
