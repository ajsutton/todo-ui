import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { markComplete, markIncomplete, setPriority, setDue, buildStatusString } from "./actions.ts";

const TODO_FIXTURE = `# TODO

## Priority Guidelines
- P0: Blocking

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [repo#1](https://github.com/org/repo/pull/1) First item | PR | Open | P1 | | |
| TODO-2 | [repo#2](https://github.com/org/repo/pull/2) Second item | Review | Pending | P2 | 2026-03-20 | |
| TODO-3 | Third item | Workstream | In progress | P3 | | |
`;

describe("markComplete", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sets done date in-place", () => {
    markComplete(tmpDir, "TODO-2");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const lines = content.split("\n");
    const todo2Line = lines.find((l) => l.includes("TODO-2"));
    expect(todo2Line).toBeDefined();
    const cells = todo2Line!.split("|");
    // Status unchanged
    expect(cells[4]!.trim()).toBe("Pending");
    // Done column (index 7) has today's date
    expect(cells[7]!.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Other items should be unchanged
    const todo1Line = lines.find((l) => l.includes("TODO-1"));
    const todo1Cells = todo1Line!.split("|");
    expect(todo1Cells[7]!.trim()).toBe("");

    const todo3Line = lines.find((l) => l.includes("TODO-3"));
    const todo3Cells = todo3Line!.split("|");
    expect(todo3Cells[7]!.trim()).toBe("");
  });

  it("markIncomplete clears done date", () => {
    markComplete(tmpDir, "TODO-2");
    markIncomplete(tmpDir, "TODO-2");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo2Line = content.split("\n").find((l) => l.includes("TODO-2"));
    const cells = todo2Line!.split("|");
    expect(cells[7]!.trim()).toBe("");
  });

  it("preserves all other content", () => {
    markComplete(tmpDir, "TODO-2");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    // Header and priority guidelines are preserved
    expect(content).toContain("# TODO");
    expect(content).toContain("## Priority Guidelines");
    expect(content).toContain("- P0: Blocking");
    expect(content).toContain("## Items");

    // Table header and separator are preserved
    expect(content).toContain(
      "| ID | Description | Type | Status | Priority | Due | Done |",
    );
    expect(content).toContain("|----|-------------|------|--------|----------|-----|------|");

    // Other rows are byte-identical
    expect(content).toContain(
      "| TODO-1 | [repo#1](https://github.com/org/repo/pull/1) First item | PR | Open | P1 | | |",
    );
    expect(content).toContain(
      "| TODO-3 | Third item | Workstream | In progress | P3 | | |",
    );
  });

  it("handles item not found", () => {
    expect(() => markComplete(tmpDir, "TODO-99")).toThrow(
      "Item TODO-99 not found in TODO.md",
    );
  });

  it("handles row with missing trailing pipe (short row)", () => {
    const shortRow = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | First item | PR | Open | P1 |  |
`;
    writeFileSync(join(tmpDir, "TODO.md"), shortRow, "utf-8");
    markComplete(tmpDir, "TODO-1");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo1Line = content.split("\n").find((l) => l.includes("TODO-1"));
    expect(todo1Line).toBeDefined();
    const cells = todo1Line!.split("|");
    // Should have proper trailing pipe and date in Done column
    expect(cells[7]!.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Row should end with a pipe
    expect(todo1Line!.trimEnd().endsWith("|")).toBe(true);
  });

  it("handles row missing both Due and Done pipes", () => {
    const shortRow = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | First item | PR | Open | P1 |
`;
    writeFileSync(join(tmpDir, "TODO.md"), shortRow, "utf-8");
    markComplete(tmpDir, "TODO-1");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo1Line = content.split("\n").find((l) => l.includes("TODO-1"));
    expect(todo1Line).toBeDefined();
    const cells = todo1Line!.split("|");
    expect(cells[7]!.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todo1Line!.trimEnd().endsWith("|")).toBe(true);
  });
});

describe("setPriority", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("updates priority in-place", () => {
    setPriority(tmpDir, "TODO-2", "P0");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo2Line = content.split("\n").find((l) => l.includes("TODO-2"));
    const cells = todo2Line!.split("|");
    expect(cells[5]!.trim()).toBe("P0");

    // Other items unchanged
    const todo1Line = content.split("\n").find((l) => l.includes("TODO-1"));
    expect(todo1Line!.split("|")[5]!.trim()).toBe("P1");
  });

  it("rejects invalid priority", () => {
    expect(() => setPriority(tmpDir, "TODO-1", "P6")).toThrow("Invalid priority");
    expect(() => setPriority(tmpDir, "TODO-1", "high")).toThrow("Invalid priority");
  });
});

describe("setDue", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sets due date in-place", () => {
    setDue(tmpDir, "TODO-1", "2026-04-01");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo1Line = content.split("\n").find((l) => l.includes("TODO-1"));
    const cells = todo1Line!.split("|");
    expect(cells[6]!.trim()).toBe("2026-04-01");
  });

  it("clears due date with empty string", () => {
    setDue(tmpDir, "TODO-2", "");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    const todo2Line = content.split("\n").find((l) => l.includes("TODO-2"));
    const cells = todo2Line!.split("|");
    expect(cells[6]!.trim()).toBe("");
  });

  it("rejects invalid date format", () => {
    expect(() => setDue(tmpDir, "TODO-1", "tomorrow")).toThrow("Invalid date");
    expect(() => setDue(tmpDir, "TODO-1", "03/20/2026")).toThrow("Invalid date");
  });
});

describe("buildStatusString", () => {
  it("returns Merged for merged PR", () => {
    const result = buildStatusString({
      state: "MERGED",
      isDraft: false,
      statusCheckRollup: "",
      reviewDecision: "",
      mergeable: "",
    });
    expect(result).toBe("Merged");
  });

  it("returns Draft with CI failing", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: true,
      statusCheckRollup: "FAILURE",
      reviewDecision: "",
      mergeable: "",
    });
    expect(result).toBe("Draft, CI failing");
  });

  it("returns Open with merge conflict", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "SUCCESS",
      reviewDecision: "APPROVED",
      mergeable: "CONFLICTING",
    });
    expect(result).toBe("Open, CI passing, approved, merge conflict");
  });

  it("returns Closed for closed PR", () => {
    const result = buildStatusString({
      state: "CLOSED",
      isDraft: false,
      statusCheckRollup: "",
      reviewDecision: "",
      mergeable: "",
    });
    expect(result).toBe("Closed");
  });
});
