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

  it("parses done date into doneDate field", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Fix bug | PR | Merged | P1 | | 2026-03-15 |
| TODO-2 | Another | PR | Open | P2 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items[0]!.doneDate).toBe("2026-03-15");
    expect(items[1]!.doneDate).toBe("");
  });

  it("skips rows with empty ID", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
|  | Empty ID row | PR | Open | P1 | | |
| TODO-1 | Valid row | PR | Open | P1 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("TODO-1");
  });

  it("stops parsing table at first non-pipe line", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Row one | PR | Open | P1 | | |
| TODO-2 | Row two | PR | Open | P2 | | |

Some prose after the table.

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-3 | Should not be parsed | PR | Open | P3 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(["TODO-1", "TODO-2"]);
  });

  it("handles content without any table", () => {
    const content = `# Just a heading\n\nSome text without a table.`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(0);
  });

  it("accepts separator with spaces around dashes (| -- |)", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
| -- | -- | -- | -- | -- | -- | -- |
| TODO-1 | Item | PR | Open | P1 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("TODO-1");
  });

  it("[BLOCKED] with no trailing text produces empty status", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Review | Review | [BLOCKED] | P2 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items[0]!.blocked).toBe(true);
    expect(items[0]!.status).toBe("");
  });

  it("renders markdown links in description as HTML anchor tags", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [my-org/repo#42](https://github.com/my-org/repo/pull/42) fix something | PR | Open | P1 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items[0]!.descriptionHtml).toContain('<a href="https://github.com/my-org/repo/pull/42">');
    expect(items[0]!.descriptionHtml).toContain("my-org/repo#42");
  });

  it("linkifies bare org/repo#number references in description", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Waiting on foo/bar#99 to merge | Workstream | Open | P2 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items[0]!.descriptionHtml).toContain(
      '<a href="https://github.com/foo/bar/issues/99"',
    );
    expect(items[0]!.descriptionHtml).toContain("foo/bar#99");
  });

  it("does not double-linkify already anchored references", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [foo/bar#99](https://github.com/foo/bar/pull/99) text | PR | Open | P1 | | |`;
    const items = parseTodoMarkdown(content);
    // Should have exactly one <a> tag for the reference, not two
    const anchors = items[0]!.descriptionHtml.match(/<a /g) ?? [];
    expect(anchors.length).toBe(1);
  });

  it("extracts PR number from issues URL", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | [myorg/myrepo#7](https://github.com/myorg/myrepo/issues/7) track issue | Workstream | Open | P3 | | |`;
    const items = parseTodoMarkdown(content);
    expect(items[0]!.githubUrl).toBe("https://github.com/myorg/myrepo/issues/7");
    expect(items[0]!.repo).toBe("myorg/myrepo");
    expect(items[0]!.prNumber).toBe(7);
  });

  it("handles row with fewer columns than expected", () => {
    const content = `| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
| TODO-1 | Short row | PR |`;
    const items = parseTodoMarkdown(content);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("TODO-1");
    expect(items[0]!.description).toBe("Short row");
    expect(items[0]!.type).toBe("PR");
    expect(items[0]!.status).toBe("");
    expect(items[0]!.priority).toBe("");
  });
});
