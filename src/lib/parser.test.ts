import { describe, it, expect } from "bun:test";
import { parseTodoMarkdown } from "./parser.ts";

const FULL_TODO = `# TODO

## Priority Guidelines
<!-- Updated based on observed user preferences -->
- P0: Blocking others or time-sensitive
- P1: Others are waiting on you
- P2: Important and should be done soon
- P3: Should be done but not urgent
- P4: Nice to have, no pressure

## Items

| ID | Description | Type | Status | Priority | Due |
|----|-------------|------|--------|----------|-----|
| TODO-14 | [optimism#19505](https://github.com/ethereum-optimism/optimism/pull/19505) interop: add strong consistency guarantees (karlfloersch) | Review | Pending | P1 | 2026-03-16 |
| TODO-22 | [optimism#19546](https://github.com/ethereum-optimism/optimism/issues/19546) Migrate from Make to Just | Workstream | 3/5 merged, #19525 #19526 need rebase | P2 | |
| TODO-5 | [optimism#19471](https://github.com/ethereum-optimism/optimism/pull/19471) feat(rust): add derivation pipeline test framework | PR | Draft, CI failing (rust-docs) | P2 | |`;

describe("parseTodoMarkdown", () => {
  it("parses a complete TODO.md with all item types", () => {
    const items = parseTodoMarkdown(FULL_TODO);
    expect(items).toHaveLength(3);

    expect(items[0]!.id).toBe("TODO-14");
    expect(items[0]!.type).toBe("Review");
    expect(items[0]!.status).toBe("Pending");
    expect(items[0]!.priority).toBe("P1");
    expect(items[0]!.due).toBe("2026-03-16");

    expect(items[1]!.id).toBe("TODO-22");
    expect(items[1]!.type).toBe("Workstream");
    expect(items[1]!.priority).toBe("P2");
    expect(items[1]!.due).toBe("");

    expect(items[2]!.id).toBe("TODO-5");
    expect(items[2]!.type).toBe("PR");
    expect(items[2]!.status).toBe("Draft, CI failing (rust-docs)");
  });

  it("handles empty table", () => {
    const content = `| ID | Description | Type | Status | Priority | Due |
|----|-------------|------|--------|----------|-----|`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(0);
  });

  it("extracts GitHub URLs from description", () => {
    const items = parseTodoMarkdown(FULL_TODO);

    expect(items[0]!.githubUrl).toBe("https://github.com/ethereum-optimism/optimism/pull/19505");
    expect(items[0]!.repo).toBe("ethereum-optimism/optimism");
    expect(items[0]!.prNumber).toBe(19505);

    expect(items[1]!.githubUrl).toBe("https://github.com/ethereum-optimism/optimism/issues/19546");
    expect(items[1]!.repo).toBe("ethereum-optimism/optimism");
    expect(items[1]!.prNumber).toBe(19546);
  });

  it("handles compound status values", () => {
    const items = parseTodoMarkdown(FULL_TODO);
    expect(items[1]!.status).toBe("3/5 merged, #19525 #19526 need rebase");
  });

  it("handles empty due date", () => {
    const items = parseTodoMarkdown(FULL_TODO);
    expect(items[1]!.due).toBe("");
    expect(items[2]!.due).toBe("");
  });

  it("handles items with no GitHub link", () => {
    const content = `| ID | Description | Type | Status | Priority | Due |
|----|-------------|------|--------|----------|-----|
| TODO-99 | Fix the widget styling | PR | Open | P3 | |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe("Fix the widget styling");
    expect(items[0]!.githubUrl).toBeUndefined();
    expect(items[0]!.repo).toBeUndefined();
    expect(items[0]!.prNumber).toBeUndefined();
  });

  it("parses [BLOCKED] prefix into blocked boolean", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Review something | Review | [BLOCKED] Reviewed, awaiting author | P5 | | |
| TODO-2 | Another review | Review | Pending | P1 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(2);
    expect(items[0]!.blocked).toBe(true);
    expect(items[0]!.status).toBe("Reviewed, awaiting author");
    expect(items[1]!.blocked).toBe(false);
    expect(items[1]!.status).toBe("Pending");
  });

  it("ignores lines before the table", () => {
    const items = parseTodoMarkdown(FULL_TODO);
    // Priority guidelines and headers should not appear as items
    expect(items.every((item) => item.id.startsWith("TODO-"))).toBe(true);
    expect(items).toHaveLength(3);
  });
});
