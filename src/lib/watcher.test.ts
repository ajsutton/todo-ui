import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TodoWatcher } from "./watcher.ts";

const TODO_CONTENT = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due |
|----|-------------|------|--------|----------|-----|
| TODO-1 | [repo#1](https://github.com/org/repo/pull/1) First item | PR | Open | P1 | |
| TODO-2 | [repo#2](https://github.com/org/repo/pull/2) Second item | Review | Pending | P2 | 2026-03-20 |
| TODO-3 | Third item with no link | Workstream | In progress | P3 | |
`;

let dir: string;
let watcher: TodoWatcher;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("TodoWatcher", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "todo-watcher-test-"));
    writeFileSync(join(dir, "TODO.md"), TODO_CONTENT);
  });

  afterEach(() => {
    if (watcher) {
      watcher.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads initial state from TODO.md", () => {
    watcher = new TodoWatcher(dir);
    const state = watcher.getState();

    expect(state.items).toHaveLength(3);
    expect(state.items[0]!.id).toBe("TODO-1");
    expect(state.items[0]!.type).toBe("PR");
    expect(state.items[0]!.status).toBe("Open");
    expect(state.items[0]!.priority).toBe("P1");
    expect(state.items[0]!.githubUrl).toBe("https://github.com/org/repo/pull/1");

    expect(state.items[1]!.id).toBe("TODO-2");
    expect(state.items[1]!.type).toBe("Review");
    expect(state.items[1]!.due).toBe("2026-03-20");

    expect(state.items[2]!.id).toBe("TODO-3");
    expect(state.items[2]!.githubUrl).toBeUndefined();
    expect(state.items[2]!.type).toBe("Workstream");
    expect(state.items[2]!.status).toBe("In progress");
  });

  it("detects file changes and notifies", async () => {
    watcher = new TodoWatcher(dir);

    let receivedState: ReturnType<TodoWatcher["getState"]> | undefined;
    watcher.onStateChange((state) => {
      receivedState = state;
    });

    const modified = TODO_CONTENT.replace("First item", "Updated item");
    writeFileSync(join(dir, "TODO.md"), modified);

    // Wait for debounce (100ms) + filesystem notification delay
    for (let i = 0; i < 10; i++) {
      if (receivedState) break;
      await wait(50);
    }

    expect(receivedState).toBeDefined();
    expect(receivedState!.items[0]!.description).toContain("Updated item");
  });

  it("debounces rapid changes", async () => {
    watcher = new TodoWatcher(dir);

    let callCount = 0;
    watcher.onStateChange(() => {
      callCount++;
    });

    // Write 3 times rapidly
    for (let i = 1; i <= 3; i++) {
      const content = TODO_CONTENT.replace("First item", `Updated ${i}`);
      writeFileSync(join(dir, "TODO.md"), content);
      await wait(15);
    }

    // Wait for debounce to settle
    await wait(300);

    expect(callCount).toBe(1);
  });

  it("reads detail files", () => {
    writeFileSync(join(dir, "TODO-1.md"), "# Detail\nSome content");
    watcher = new TodoWatcher(dir);

    const detail = watcher.getDetail("TODO-1");

    expect(detail).toBeDefined();
    expect(detail!.id).toBe("TODO-1");
    expect(detail!.content).toBe("# Detail\nSome content");
  });

  it("handles missing detail files gracefully", () => {
    watcher = new TodoWatcher(dir);

    const detail = watcher.getDetail("TODO-99");
    expect(detail).toBeUndefined();
  });

  it("reload forces re-read and notifies", () => {
    watcher = new TodoWatcher(dir);

    let receivedState: ReturnType<TodoWatcher["getState"]> | undefined;
    watcher.onStateChange((state) => {
      receivedState = state;
    });

    const modified = TODO_CONTENT.replace("First item", "Reloaded item");
    writeFileSync(join(dir, "TODO.md"), modified);

    // Don't wait for fs.watch — call reload directly
    watcher.reload();

    expect(receivedState).toBeDefined();
    expect(receivedState!.items[0]!.description).toContain("Reloaded item");
  });
});
