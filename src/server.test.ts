import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Subprocess } from "bun";

const BUN_PATH = Bun.which("bun")!;
const SERVER_PATH = join(import.meta.dir, "server.ts");

const TODO_FIXTURE = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [repo#1](https://github.com/org/repo/pull/1) First item | PR | Open | P1 | | |
| TODO-2 | [repo#2](https://github.com/org/repo/pull/2) Second item | Review | Pending | P2 | 2026-03-20 | |
| TODO-3 | Third item | Workstream | In progress | P3 | | |
`;

const DETAIL_FIXTURE = `# First Item Detail

## Description
This is a detailed description.

## Status
Currently open and waiting for review.
`;

function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

async function startServer(
  todoDir: string,
  port: number,
): Promise<Subprocess> {
  const proc = Bun.spawn([BUN_PATH, SERVER_PATH], {
    env: {
      ...process.env,
      TODO_DIR: todoDir,
      TODO_UI_PORT: String(port),
      CLAUDE_CWD: todoDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/state`);
      if (res.ok) return proc;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  proc.kill();
  throw new Error("Server did not start in time");
}

describe("server integration", () => {
  let tmpDir: string;
  let port: number;
  let proc: Subprocess;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-server-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
    writeFileSync(join(tmpDir, "TODO-1.md"), DETAIL_FIXTURE, "utf-8");
    port = randomPort();
    proc = await startServer(tmpDir, port);
  });

  afterEach(() => {
    proc?.kill();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET / serves index.html", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/html");
  });

  it("GET /api/state returns parsed TODO state", async () => {
    const res = await fetch(`http://localhost:${port}/api/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        type: string;
        status: string;
        priority: string;
        due: string;
      }>;
      rawMarkdown: string;
    };

    expect(body.items).toHaveLength(3);

    const first = body.items[0]!;
    expect(first.id).toBe("TODO-1");
    expect(first.type).toBe("PR");
    expect(first.status).toBe("Open");
    expect(first.priority).toBe("P1");

    const second = body.items[1]!;
    expect(second.id).toBe("TODO-2");
    expect(second.type).toBe("Review");
    expect(second.status).toBe("Pending");
    expect(second.due).toBe("2026-03-20");

    const third = body.items[2]!;
    expect(third.id).toBe("TODO-3");
    expect(third.type).toBe("Workstream");
    expect(third.status).toBe("In progress");
  });

  it("GET /api/detail/:id returns rendered detail", async () => {
    const res = await fetch(`http://localhost:${port}/api/detail/TODO-1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      content: string;
      contentHtml: string;
    };
    expect(body.id).toBe("TODO-1");
    expect(body.content).toContain("detailed description");
    expect(body.contentHtml).toContain("<h1");
  });

  it("GET /api/detail/:id returns 404 for missing detail", async () => {
    const res = await fetch(`http://localhost:${port}/api/detail/TODO-99`);
    expect(res.status).toBe(404);
  });

  it("POST /api/complete/:id marks item as done", async () => {
    const res = await fetch(`http://localhost:${port}/api/complete/TODO-2`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    const todo2Line = content.split("\n").find((l) => l.includes("TODO-2"));
    expect(todo2Line).toBeDefined();
    const cells = todo2Line!.split("|");
    // Status unchanged, Done column has a date
    expect(cells[4]!.trim()).toBe("Pending");
    expect(cells[7]!.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("POST /api/complete/:id returns 404 for unknown ID", async () => {
    const res = await fetch(`http://localhost:${port}/api/complete/TODO-99`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("TODO-99");
  });

  it("WebSocket receives initial state on connect", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const message = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS timeout")), 5000);
      ws.onmessage = (ev) => {
        clearTimeout(timer);
        resolve(String(ev.data));
      };
      ws.onerror = (ev) => {
        clearTimeout(timer);
        reject(new Error("WebSocket error"));
      };
    });
    ws.close();

    const parsed = JSON.parse(message) as {
      type: string;
      data: { items: Array<{ id: string }> };
    };
    expect(parsed.type).toBe("state");
    expect(parsed.data.items).toHaveLength(3);
  });

  it("WebSocket receives update after markComplete", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const messages: string[] = [];

    // Collect messages: first will be the initial state, second will be the update
    const gotUpdate = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WS update timeout")),
        5000,
      );
      ws.onmessage = (ev) => {
        messages.push(String(ev.data));
        if (messages.length >= 2) {
          clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket error"));
      };
    });

    // Wait for initial state before posting
    await new Promise<void>((resolve) => {
      const check = () => {
        if (messages.length >= 1) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    await fetch(`http://localhost:${port}/api/complete/TODO-1`, {
      method: "POST",
    });

    await gotUpdate;
    ws.close();

    const update = JSON.parse(messages[1]!) as {
      type: string;
      data: { items: Array<{ id: string; status: string; doneDate: string }> };
    };
    expect(update.type).toBe("state");
    const todo1 = update.data.items.find((i) => i.id === "TODO-1");
    expect(todo1).toBeDefined();
    expect(todo1!.status).toBe("Open");
    expect(todo1!.doneDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("WebSocket replies with pong to ping", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const messages: string[] = [];

    const gotPong = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS pong timeout")), 5000);
      ws.onmessage = (ev) => {
        const data = String(ev.data);
        messages.push(data);
        const parsed = JSON.parse(data) as { type: string };
        if (parsed.type === "pong") {
          clearTimeout(timer);
          resolve();
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket error"));
      };
    });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (messages.length >= 1) resolve();
        else setTimeout(check, 50);
      };
      check();
    });

    ws.send(JSON.stringify({ type: "ping" }));
    await gotPong;
    ws.close();
  });

  it("GET /api/standup returns standup report structure", async () => {
    const res = await fetch(`http://localhost:${port}/api/standup`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      date: string;
      yesterdayDate: string;
      yesterday: {
        done: unknown[];
        statusChanges: unknown[];
        githubActivity: unknown[];
      };
      today: {
        highPriority: unknown[];
        overdue: unknown[];
        dueToday: unknown[];
        blocked: unknown[];
      };
    };

    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.yesterdayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body.yesterday.done)).toBe(true);
    expect(Array.isArray(body.yesterday.statusChanges)).toBe(true);
    expect(Array.isArray(body.yesterday.githubActivity)).toBe(true);
    expect(Array.isArray(body.today.highPriority)).toBe(true);
    expect(Array.isArray(body.today.overdue)).toBe(true);
    expect(Array.isArray(body.today.dueToday)).toBe(true);
    expect(Array.isArray(body.today.blocked)).toBe(true);

    // TODO-2 has due 2026-03-20 which is in the past (today is 2026-04-03 per test fixture)
    const overdueIds = (body.today.overdue as Array<{ id: string }>).map((i) => i.id);
    expect(overdueIds).toContain("TODO-2");
  });
});
