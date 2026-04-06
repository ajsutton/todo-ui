import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import {
  markComplete, markIncomplete, setPriority, setDue, buildStatusString,
  saveDetailMarkdown, addDiscoveredItems, refreshIssueLinks, collectTrackedKeys,
  updateAll,
} from "./actions.ts";
import type { TodoItem, LinkedPr, DiscoveredItem } from "../types.ts";
import { MockGitHubClient } from "./github-client.ts";

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
      isInMergeQueue: false,
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
      isInMergeQueue: false,
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
      isInMergeQueue: false,
    });
    expect(result).toBe("Open, CI passing, approved, merge conflict");
  });

  it("returns In merge queue when PR is queued", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "PENDING",
      reviewDecision: "APPROVED",
      mergeable: "MERGEABLE",
      isInMergeQueue: true,
    });
    expect(result).toBe("In merge queue");
  });

  it("returns Closed for closed PR", () => {
    const result = buildStatusString({
      state: "CLOSED",
      isDraft: false,
      statusCheckRollup: "",
      reviewDecision: "",
      mergeable: "",
      isInMergeQueue: false,
    });
    expect(result).toBe("Closed");
  });

  it("returns Open, CI pending for pending checks", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "PENDING",
      reviewDecision: "",
      mergeable: "MERGEABLE",
      isInMergeQueue: false,
    });
    expect(result).toBe("Open, CI pending");
  });

  it("returns Open with changes requested", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "SUCCESS",
      reviewDecision: "CHANGES_REQUESTED",
      mergeable: "MERGEABLE",
      isInMergeQueue: false,
    });
    expect(result).toBe("Open, CI passing, changes requested");
  });

  it("treats ERROR same as FAILURE for CI status", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "ERROR",
      reviewDecision: "",
      mergeable: "",
      isInMergeQueue: false,
    });
    expect(result).toBe("Open, CI failing");
  });

  it("returns Open with no CI info when statusCheckRollup is empty", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: false,
      statusCheckRollup: "",
      reviewDecision: "",
      mergeable: "",
      isInMergeQueue: false,
    });
    expect(result).toBe("Open");
  });

  it("returns Draft, approved when draft PR has review approval", () => {
    const result = buildStatusString({
      state: "OPEN",
      isDraft: true,
      statusCheckRollup: "SUCCESS",
      reviewDecision: "APPROVED",
      mergeable: "MERGEABLE",
      isInMergeQueue: false,
    });
    expect(result).toBe("Draft, CI passing, approved");
  });
});

describe("markComplete / markIncomplete edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("markComplete is idempotent (re-completing overwrites date)", () => {
    markComplete(tmpDir, "TODO-1");
    markComplete(tmpDir, "TODO-1");
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    const todo1Line = content.split("\n").find((l) => l.includes("TODO-1"))!;
    const cells = todo1Line.split("|");
    expect(cells[7]!.trim()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("markIncomplete is idempotent (clearing already-empty done)", () => {
    expect(() => markIncomplete(tmpDir, "TODO-1")).not.toThrow();
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    const cells = content.split("\n").find((l) => l.includes("TODO-1"))!.split("|");
    expect(cells[7]!.trim()).toBe("");
  });

  it("markIncomplete throws for unknown id", () => {
    expect(() => markIncomplete(tmpDir, "TODO-999")).toThrow("TODO-999 not found");
  });
});

describe("setPriority edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts all valid priorities P0-P5", () => {
    for (const p of ["P0", "P1", "P2", "P3", "P4", "P5"]) {
      expect(() => setPriority(tmpDir, "TODO-1", p)).not.toThrow();
    }
  });

  it("throws for unknown item id", () => {
    expect(() => setPriority(tmpDir, "TODO-999", "P1")).toThrow("TODO-999 not found");
  });
});

describe("setDue edge cases", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws for unknown item id", () => {
    expect(() => setDue(tmpDir, "TODO-999", "2026-05-01")).toThrow("TODO-999 not found");
  });

  it("rejects partial date like 2026-3-1", () => {
    expect(() => setDue(tmpDir, "TODO-1", "2026-3-1")).toThrow("Invalid date");
  });
});

describe("saveDetailMarkdown", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes markdown to the correct detail file", () => {
    const markdown = "# Notes\n\nSome details here.\n";
    saveDetailMarkdown(tmpDir, "TODO-7", markdown);
    const written = readFileSync(join(tmpDir, "TODO-7.md"), "utf-8");
    expect(written).toBe(markdown);
  });

  it("overwrites existing detail file", () => {
    writeFileSync(join(tmpDir, "TODO-3.md"), "old content", "utf-8");
    saveDetailMarkdown(tmpDir, "TODO-3", "new content");
    expect(readFileSync(join(tmpDir, "TODO-3.md"), "utf-8")).toBe("new content");
  });

  it("handles multi-digit IDs correctly", () => {
    saveDetailMarkdown(tmpDir, "TODO-42", "content for 42");
    expect(readFileSync(join(tmpDir, "TODO-42.md"), "utf-8")).toBe("content for 42");
  });
});

// --- Issue-PR linking tests ---

const ISSUE_PR_FIXTURE = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [optimism-private#492](https://github.com/ethereum-optimism/optimism-private/issues/492) Incorrect L2AccountProof hinting | Issue | Open | P4 | | |
| TODO-2 | [optimism-private#525](https://github.com/ethereum-optimism/optimism-private/pull/525) fix(kona): send block hash | PR | Draft, CI failing | P3 | | |
| TODO-3 | [optimism-private#524](https://github.com/ethereum-optimism/optimism-private/pull/524) fix(kona): evict origin_infos | PR | Draft, CI failing | P3 | | |
| TODO-4 | [optimism#100](https://github.com/ethereum-optimism/optimism/pull/100) unrelated PR | PR | Open | P2 | | |
`;

function makeItem(overrides: Partial<TodoItem> & { id: string }): TodoItem {
  return {
    description: "",
    descriptionHtml: "",
    githubUrl: undefined,
    repo: undefined,
    prNumber: undefined,
    type: "PR",
    status: "Open",
    blocked: false,
    priority: "P3",
    due: "",
    doneDate: "",
    ...overrides,
  };
}

function makePr(repo: string, number: number, title: string, isDraft = false): LinkedPr {
  const shortRepo = repo.replace("ethereum-optimism/", "");
  return {
    repo,
    number,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    status: isDraft ? "Draft" : "Open",
    priority: isDraft ? "P3" : "P2",
    isDraft,
  };
}

describe("refreshIssueLinks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), ISSUE_PR_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates detail file for issue with linked PRs", async () => {
    const items: TodoItem[] = [
      makeItem({
        id: "TODO-1",
        type: "Issue",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 492,
        githubUrl: "https://github.com/ethereum-optimism/optimism-private/issues/492",
        description: "[optimism-private#492](https://github.com/ethereum-optimism/optimism-private/issues/492) Incorrect L2AccountProof hinting",
      }),
    ];

    const linkedPrs = [
      makePr("ethereum-optimism/optimism-private", 525, "fix(kona): send block hash", true),
      makePr("ethereum-optimism/optimism-private", 524, "fix(kona): evict origin_infos", true),
    ];

    const mockFindLinkedPrs = async () => linkedPrs;
    const result = await refreshIssueLinks(tmpDir, items, undefined, mockFindLinkedPrs);

    // Detail file should be created
    expect(existsSync(join(tmpDir, "TODO-1.md"))).toBe(true);
    const detail = readFileSync(join(tmpDir, "TODO-1.md"), "utf-8");
    expect(detail).toContain("optimism-private#525");
    expect(detail).toContain("optimism-private#524");
    expect(detail).toContain("## PRs");
    expect(detail).toContain("## Issue");

    // Returned keys should include linked PRs
    expect(result.has("ethereum-optimism/optimism-private#525")).toBe(true);
    expect(result.has("ethereum-optimism/optimism-private#524")).toBe(true);
  });

  it("updates existing detail file with new linked PRs", async () => {
    // Pre-create a detail file with one PR
    const existingDetail = `# Incorrect L2AccountProof hinting

## Issue
[optimism-private#492](https://github.com/ethereum-optimism/optimism-private/issues/492)

## PRs
| PR | Title | Status | Priority |
|----|-------|--------|----------|
| [optimism-private#525](https://github.com/ethereum-optimism/optimism-private/pull/525) | fix(kona): send block hash | Draft | P3 |
`;
    writeFileSync(join(tmpDir, "TODO-1.md"), existingDetail, "utf-8");

    const items: TodoItem[] = [
      makeItem({
        id: "TODO-1",
        type: "Issue",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 492,
        githubUrl: "https://github.com/ethereum-optimism/optimism-private/issues/492",
      }),
    ];

    // Now there are two linked PRs (one new)
    const linkedPrs = [
      makePr("ethereum-optimism/optimism-private", 525, "fix(kona): send block hash", true),
      makePr("ethereum-optimism/optimism-private", 524, "fix(kona): evict origin_infos", true),
    ];

    await refreshIssueLinks(tmpDir, items, undefined, async () => linkedPrs);

    const detail = readFileSync(join(tmpDir, "TODO-1.md"), "utf-8");
    // Should still have the original PR
    expect(detail).toContain("optimism-private#525");
    // Should now also have the new PR
    expect(detail).toContain("optimism-private#524");
  });

  it("skips issues with no linked PRs", async () => {
    const items: TodoItem[] = [
      makeItem({
        id: "TODO-1",
        type: "Issue",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 492,
      }),
    ];

    await refreshIssueLinks(tmpDir, items, undefined, async () => []);

    // No detail file should be created
    expect(existsSync(join(tmpDir, "TODO-1.md"))).toBe(false);
  });

  it("skips done issues", async () => {
    const items: TodoItem[] = [
      makeItem({
        id: "TODO-1",
        type: "Issue",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 492,
        doneDate: "2026-04-01",
      }),
    ];

    let called = false;
    await refreshIssueLinks(tmpDir, items, undefined, async () => {
      called = true;
      return [makePr("ethereum-optimism/optimism-private", 525, "fix", true)];
    });

    expect(called).toBe(false);
    expect(existsSync(join(tmpDir, "TODO-1.md"))).toBe(false);
  });
});

describe("collectTrackedKeys with issue detail files", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), ISSUE_PR_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes PR keys from issue detail files", () => {
    const detailContent = `# Issue title

## Issue
[optimism-private#492](https://github.com/ethereum-optimism/optimism-private/issues/492)

## PRs
| PR | Title | Status | Priority |
|----|-------|--------|----------|
| [optimism-private#525](https://github.com/ethereum-optimism/optimism-private/pull/525) | fix block hash | Draft | P3 |
| [optimism-private#524](https://github.com/ethereum-optimism/optimism-private/pull/524) | fix evict | Draft | P3 |
`;
    writeFileSync(join(tmpDir, "TODO-1.md"), detailContent, "utf-8");

    const keys = collectTrackedKeys(tmpDir, []);
    expect(keys.has("ethereum-optimism/optimism-private#525")).toBe(true);
    expect(keys.has("ethereum-optimism/optimism-private#524")).toBe(true);
    expect(keys.has("ethereum-optimism/optimism-private#492")).toBe(true);
  });
});

describe("updateAll deduplicates standalone PRs into issue detail files", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), ISSUE_PR_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes standalone PR items when they appear in issue detail files", async () => {
    const mock = new MockGitHubClient();

    // Issue #492 has linked PRs #525 and #524
    mock.setLinkedPrs("ethereum-optimism/optimism-private", 492, [
      makePr("ethereum-optimism/optimism-private", 525, "fix(kona): send block hash", true),
      makePr("ethereum-optimism/optimism-private", 524, "fix(kona): evict origin_infos", true),
    ]);

    // Set up batch results so the update doesn't error
    mock.setBatchResult("ethereum-optimism/optimism-private", 492, { state: "OPEN" });
    mock.setBatchResult("ethereum-optimism/optimism-private", 525, {
      state: "OPEN", isDraft: true, reviewDecision: "", mergeable: "",
      statusCheckRollup: [{ conclusion: "FAILURE" }],
    });
    mock.setBatchResult("ethereum-optimism/optimism-private", 524, {
      state: "OPEN", isDraft: true, reviewDecision: "", mergeable: "",
      statusCheckRollup: [{ conclusion: "FAILURE" }],
    });
    mock.setBatchResult("ethereum-optimism/optimism", 100, {
      state: "OPEN", isDraft: false, reviewDecision: "", mergeable: "MERGEABLE",
      statusCheckRollup: [{ conclusion: "SUCCESS" }],
    });

    const items: TodoItem[] = [
      makeItem({
        id: "TODO-1",
        type: "Issue",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 492,
        githubUrl: "https://github.com/ethereum-optimism/optimism-private/issues/492",
        description: "[optimism-private#492](...) Incorrect L2AccountProof hinting",
        priority: "P4",
      }),
      makeItem({
        id: "TODO-2",
        type: "PR",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 525,
        githubUrl: "https://github.com/ethereum-optimism/optimism-private/pull/525",
        description: "[optimism-private#525](...) fix(kona): send block hash",
      }),
      makeItem({
        id: "TODO-3",
        type: "PR",
        repo: "ethereum-optimism/optimism-private",
        prNumber: 524,
        githubUrl: "https://github.com/ethereum-optimism/optimism-private/pull/524",
        description: "[optimism-private#524](...) fix(kona): evict origin_infos",
      }),
      makeItem({
        id: "TODO-4",
        type: "PR",
        repo: "ethereum-optimism/optimism",
        prNumber: 100,
        githubUrl: "https://github.com/ethereum-optimism/optimism/pull/100",
        description: "[optimism#100](...) unrelated PR",
        priority: "P2",
      }),
    ];

    await updateAll(tmpDir, items, undefined, mock);

    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");

    // Standalone PR items for #525 and #524 should be removed
    expect(content).not.toContain("TODO-2");
    expect(content).not.toContain("TODO-3");

    // Issue item and unrelated PR should remain
    expect(content).toContain("TODO-1");
    expect(content).toContain("TODO-4");

    // Detail file should exist for the issue
    expect(existsSync(join(tmpDir, "TODO-1.md"))).toBe(true);
    const detail = readFileSync(join(tmpDir, "TODO-1.md"), "utf-8");
    expect(detail).toContain("optimism-private#525");
    expect(detail).toContain("optimism-private#524");
  });
});

describe("addDiscoveredItems", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), TODO_FIXTURE, "utf-8");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates detail file when issue has linked PRs", () => {
    const items: DiscoveredItem[] = [{
      repo: "ethereum-optimism/optimism-private",
      prNumber: 492,
      title: "Incorrect L2AccountProof hinting",
      url: "https://github.com/ethereum-optimism/optimism-private/issues/492",
      type: "Issue",
      suggestedPriority: "P3",
      author: "testuser",
      linkedPrs: [
        makePr("ethereum-optimism/optimism-private", 525, "fix block hash", true),
      ],
    }];

    addDiscoveredItems(tmpDir, items);

    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    expect(content).toContain("TODO-4");
    expect(content).toContain("optimism-private#492");

    // Detail file should be created
    expect(existsSync(join(tmpDir, "TODO-4.md"))).toBe(true);
    const detail = readFileSync(join(tmpDir, "TODO-4.md"), "utf-8");
    expect(detail).toContain("optimism-private#525");
    expect(detail).toContain("## PRs");
  });

  it("does not create detail file for issue without linked PRs", () => {
    const items: DiscoveredItem[] = [{
      repo: "ethereum-optimism/optimism-private",
      prNumber: 492,
      title: "Some issue",
      url: "https://github.com/ethereum-optimism/optimism-private/issues/492",
      type: "Issue",
      suggestedPriority: "P4",
      author: "testuser",
    }];

    addDiscoveredItems(tmpDir, items);

    expect(existsSync(join(tmpDir, "TODO-4.md"))).toBe(false);
  });

  it("adds PR items as standalone when no issue link", () => {
    const items: DiscoveredItem[] = [{
      repo: "ethereum-optimism/optimism",
      prNumber: 999,
      title: "standalone PR",
      url: "https://github.com/ethereum-optimism/optimism/pull/999",
      type: "PR",
      suggestedPriority: "P2",
      author: "testuser",
    }];

    addDiscoveredItems(tmpDir, items);

    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    expect(content).toContain("optimism#999");
    expect(content).toContain("TODO-4");
  });
});

// --- State transition tests via updateAll ---

const STATE_FIXTURE = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [optimism#10](https://github.com/ethereum-optimism/optimism/pull/10) My PR | PR | Open | P2 | | |
| TODO-2 | [optimism#20](https://github.com/ethereum-optimism/optimism/pull/20) Review request (reviewer) | Review | Pending | P1 | | |
| TODO-3 | [optimism#30](https://github.com/ethereum-optimism/optimism/issues/30) Assigned issue | Issue | Open | P4 | | |
`;

function parseRow(content: string, id: string): Record<string, string> {
  const line = content.split("\n").find((l) => l.includes(id));
  if (!line) throw new Error(`Row ${id} not found`);
  const cells = line.split("|").map((c) => c.trim());
  return {
    id: cells[1] ?? "",
    description: cells[2] ?? "",
    type: cells[3] ?? "",
    status: cells[4] ?? "",
    priority: cells[5] ?? "",
    due: cells[6] ?? "",
    done: cells[7] ?? "",
  };
}

function stateItems(): TodoItem[] {
  return [
    makeItem({
      id: "TODO-1", type: "PR", repo: "ethereum-optimism/optimism", prNumber: 10,
      githubUrl: "https://github.com/ethereum-optimism/optimism/pull/10", priority: "P2",
    }),
    makeItem({
      id: "TODO-2", type: "Review", repo: "ethereum-optimism/optimism", prNumber: 20,
      githubUrl: "https://github.com/ethereum-optimism/optimism/pull/20", priority: "P1",
    }),
    makeItem({
      id: "TODO-3", type: "Issue", repo: "ethereum-optimism/optimism", prNumber: 30,
      githubUrl: "https://github.com/ethereum-optimism/optimism/issues/30", priority: "P4",
    }),
  ];
}

describe("updateAll — PR state transitions", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), STATE_FIXTURE, "utf-8");
    mock = new MockGitHubClient();
    // Default: other items return no data (skipped)
    mock.setBatchResult("ethereum-optimism/optimism", 20, { state: "OPEN", isDraft: false });
    mock.setBatchResult("ethereum-optimism/optimism", 30, { state: "OPEN", assignees: [{ login: "testuser" }] });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("PR merged → status Merged, done set, priority P1", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, { state: "MERGED" });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Merged");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.priority).toBe("P1");
  });

  it("PR closed → status Closed, done set", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, { state: "CLOSED" });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Closed");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("PR in merge queue → priority P5", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false, isInMergeQueue: true,
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("In merge queue");
    expect(row.priority).toBe("P5");
  });

  it("PR approved + CI passing → priority P1", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false, reviewDecision: "APPROVED", mergeable: "MERGEABLE",
      statusCheckRollup: [{ conclusion: "SUCCESS" }],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Open, CI passing, approved");
    expect(row.priority).toBe("P1");
  });

  it("PR draft + CI failing", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: true,
      statusCheckRollup: [{ conclusion: "FAILURE" }],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Draft, CI failing");
  });

  it("PR open + CI pending", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false,
      statusCheckRollup: [{ state: "PENDING" }],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Open, CI pending");
  });

  it("PR open + changes requested", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false, reviewDecision: "CHANGES_REQUESTED",
      statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "MERGEABLE",
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Open, CI passing, changes requested");
  });

  it("PR open + merge conflict", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false, reviewDecision: "APPROVED",
      statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "CONFLICTING",
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Open, CI passing, approved, merge conflict");
  });

  it("PR no change → row unchanged", async () => {
    // Same as current state: Open, P2
    mock.setBatchResult("ethereum-optimism/optimism", 10, {
      state: "OPEN", isDraft: false, statusCheckRollup: [],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.status).toBe("Open");
    expect(row.priority).toBe("P2");
    expect(row.done).toBe("");
  });
});

describe("updateAll — Review state transitions", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), STATE_FIXTURE, "utf-8");
    mock = new MockGitHubClient();
    // Default: other items return stable state
    mock.setBatchResult("ethereum-optimism/optimism", 10, { state: "OPEN", isDraft: false, statusCheckRollup: [] });
    mock.setBatchResult("ethereum-optimism/optimism", 30, { state: "OPEN", assignees: [{ login: "testuser" }] });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Review PR merged → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, { state: "MERGED" });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Merged");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Review PR closed → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, { state: "CLOSED" });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Closed");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Review PR in merge queue → P5", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false, isInMergeQueue: true,
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("In merge queue");
    expect(row.priority).toBe("P5");
  });

  it("Review approved by user → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      reviews: [{ user: { login: "testuser" }, state: "APPROVED", submitted_at: "2026-04-06" }],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Approved");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Review changes requested → blocked, P5", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      reviews: [{ user: { login: "testuser" }, state: "CHANGES_REQUESTED", submitted_at: "2026-04-06" }],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("[BLOCKED] Reviewed, awaiting author");
    expect(row.priority).toBe("P5");
  });

  it("Review request removed → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      reviews: [],
      reviewRequestedUsers: [],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Review request removed");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Review PR is draft → not ready, P3", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: true,
      reviews: [],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Draft, not ready for review");
    expect(row.priority).toBe("P3");
  });

  it("Review pending + CI failing → P3", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      statusCheckRollup: [{ conclusion: "FAILURE" }],
      reviews: [],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Pending, CI failing");
    expect(row.priority).toBe("P3");
  });

  it("Review pending + CI passing → Pending", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      statusCheckRollup: [{ conclusion: "SUCCESS" }],
      reviews: [],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("Pending");
  });

  it("Review with merge conflicts → blocked, P5", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false, mergeStateStatus: "DIRTY",
      statusCheckRollup: [{ conclusion: "SUCCESS" }],
      reviews: [],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toContain("[BLOCKED]");
    expect(row.status).toContain("merge conflicts");
    expect(row.priority).toBe("P5");
  });

  it("Review commented → blocked, P5, awaiting author", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 20, {
      state: "OPEN", isDraft: false,
      reviews: [{ user: { login: "testuser" }, state: "COMMENTED", submitted_at: "2026-04-06" }],
      reviewRequestedUsers: ["testuser"],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-2");
    expect(row.status).toBe("[BLOCKED] Reviewed, awaiting author");
    expect(row.priority).toBe("P5");
  });
});

describe("updateAll — Issue state transitions", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    writeFileSync(join(tmpDir, "TODO.md"), STATE_FIXTURE, "utf-8");
    mock = new MockGitHubClient();
    // Default: other items return stable state
    mock.setBatchResult("ethereum-optimism/optimism", 10, { state: "OPEN", isDraft: false, statusCheckRollup: [] });
    mock.setBatchResult("ethereum-optimism/optimism", 20, { state: "OPEN", isDraft: false });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Issue closed → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 30, { state: "CLOSED" });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-3");
    expect(row.status).toBe("Closed");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Issue unassigned → done", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 30, {
      state: "OPEN", assignees: [{ login: "someone-else" }],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-3");
    expect(row.status).toBe("Unassigned");
    expect(row.done).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Issue open + assigned → stays Open", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 30, {
      state: "OPEN", assignees: [{ login: "testuser" }],
    });
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-3");
    expect(row.status).toBe("Open");
    expect(row.done).toBe("");
  });

  it("Issue no change → row unchanged", async () => {
    mock.setBatchResult("ethereum-optimism/optimism", 30, {
      state: "OPEN", assignees: [{ login: "testuser" }],
    });
    const before = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    await updateAll(tmpDir, stateItems(), undefined, mock);
    const after = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    // Issue row should be identical (status was already "Open")
    const rowBefore = before.split("\n").find((l) => l.includes("TODO-3"));
    const rowAfter = after.split("\n").find((l) => l.includes("TODO-3"));
    expect(rowAfter).toBe(rowBefore);
  });
});

describe("updateAll — issue priority from sub-items", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    mock = new MockGitHubClient();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("issue priority recomputed from linked PR priorities", async () => {
    const fixture = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [optimism#50](https://github.com/ethereum-optimism/optimism/issues/50) Issue with PRs | Issue | Open | P4 | | |
`;
    writeFileSync(join(tmpDir, "TODO.md"), fixture, "utf-8");
    // Detail file with a P2 sub-item
    writeFileSync(join(tmpDir, "TODO-1.md"), `# Issue

## Issue
[optimism#50](https://github.com/ethereum-optimism/optimism/issues/50)

## PRs
| PR | Title | Status | Priority |
|----|-------|--------|----------|
| [optimism#51](https://github.com/ethereum-optimism/optimism/pull/51) | Fix | Open | P2 |
`, "utf-8");

    mock.setBatchResult("ethereum-optimism/optimism", 50, {
      state: "OPEN", assignees: [{ login: "testuser" }],
    });

    const items = [makeItem({
      id: "TODO-1", type: "Issue", repo: "ethereum-optimism/optimism", prNumber: 50,
      githubUrl: "https://github.com/ethereum-optimism/optimism/issues/50", priority: "P4",
    })];

    await updateAll(tmpDir, items, undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    // P2 from the sub-item, but floor is P3 for issues with sub-items
    expect(row.priority).toBe("P2");
  });

  it("issue with no sub-items stays P4", async () => {
    const fixture = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [optimism#50](https://github.com/ethereum-optimism/optimism/issues/50) Empty issue | Issue | Open | P4 | | |
`;
    writeFileSync(join(tmpDir, "TODO.md"), fixture, "utf-8");

    mock.setBatchResult("ethereum-optimism/optimism", 50, {
      state: "OPEN", assignees: [{ login: "testuser" }],
    });

    const items = [makeItem({
      id: "TODO-1", type: "Issue", repo: "ethereum-optimism/optimism", prNumber: 50,
      githubUrl: "https://github.com/ethereum-optimism/optimism/issues/50", priority: "P4",
    })];

    await updateAll(tmpDir, items, undefined, mock);
    const row = parseRow(readFileSync(join(tmpDir, "TODO.md"), "utf-8"), "TODO-1");
    expect(row.priority).toBe("P4");
  });
});

describe("updateAll — discovery", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    mock = new MockGitHubClient();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("discovers new PR from GitHub search", async () => {
    const fixture = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
`;
    writeFileSync(join(tmpDir, "TODO.md"), fixture, "utf-8");

    mock.setSearchResults("author:", [{
      repository_url: "https://api.github.com/repos/ethereum-optimism/optimism",
      number: 999,
      title: "New PR",
      html_url: "https://github.com/ethereum-optimism/optimism/pull/999",
      draft: false,
      user: { login: "testuser" },
    }]);

    const { discovered } = await updateAll(tmpDir, [], undefined, mock);
    expect(discovered.length).toBe(1);
    expect(discovered[0]!.prNumber).toBe(999);
    expect(discovered[0]!.type).toBe("PR");
  });

  it("does not re-discover already tracked items", async () => {
    const fixture = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [optimism#999](https://github.com/ethereum-optimism/optimism/pull/999) Existing PR | PR | Open | P2 | | |
`;
    writeFileSync(join(tmpDir, "TODO.md"), fixture, "utf-8");

    mock.setBatchResult("ethereum-optimism/optimism", 999, { state: "OPEN", isDraft: false, statusCheckRollup: [] });
    mock.setSearchResults("author:", [{
      repository_url: "https://api.github.com/repos/ethereum-optimism/optimism",
      number: 999,
      title: "Existing PR",
      html_url: "https://github.com/ethereum-optimism/optimism/pull/999",
      draft: false,
      user: { login: "testuser" },
    }]);

    const items = [makeItem({
      id: "TODO-1", type: "PR", repo: "ethereum-optimism/optimism", prNumber: 999,
      githubUrl: "https://github.com/ethereum-optimism/optimism/pull/999",
    })];

    const { discovered } = await updateAll(tmpDir, items, undefined, mock);
    expect(discovered.length).toBe(0);
  });
});

describe("updateAll — old item cleanup", () => {
  let tmpDir: string;
  let mock: MockGitHubClient;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "todo-test-"));
    mock = new MockGitHubClient();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes items done > 30 days ago", async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fixture = `# TODO

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Old done item | PR | Merged | P1 | | ${oldDate} |
| TODO-2 | Recent item | PR | Open | P2 | | |
`;
    writeFileSync(join(tmpDir, "TODO.md"), fixture, "utf-8");
    writeFileSync(join(tmpDir, "TODO-1.md"), "detail file", "utf-8");

    mock.setBatchResult("ethereum-optimism/optimism", 10, { state: "OPEN", isDraft: false, statusCheckRollup: [] });

    const items = [
      makeItem({ id: "TODO-1", type: "PR", doneDate: oldDate }),
      makeItem({
        id: "TODO-2", type: "PR", repo: "ethereum-optimism/optimism", prNumber: 10,
        githubUrl: "https://github.com/ethereum-optimism/optimism/pull/10",
      }),
    ];

    await updateAll(tmpDir, items, undefined, mock);
    const content = readFileSync(join(tmpDir, "TODO.md"), "utf-8");
    expect(content).not.toContain("TODO-1");
    expect(content).toContain("TODO-2");
    expect(existsSync(join(tmpDir, "TODO-1.md"))).toBe(false);
  });
});
