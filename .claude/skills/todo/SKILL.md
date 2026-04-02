---
name: todo
description: Manage a todo list for the user. Track issues, PRs, review requests, Slack saved messages, processes, and general tasks. Use when the user wants to add, update, check, or work on todo items, or import Slack saved-for-later messages.
---

# Todo

Manage a personal todo list. Each item has an ID, description, type, status, optional due date, and priority.

## Configuration

The TODO directory path is stored in `~/.claude/todo-config.json`:

```json
{ "todoDir": "/absolute/path/to/todo/directory" }
```

**On every invocation**, read `~/.claude/todo-config.json`. If the file does not exist or `todoDir` is not set, ask the user: "Where should I store your TODO data? Give me an absolute path to a directory (it will be created if it doesn't exist)." Save their answer to `~/.claude/todo-config.json` and create the directory if needed.

The user can change the path at any time by saying "change todo directory" or "set todo path".

All paths below use `$TODO_DIR` to refer to the configured directory.

## Data Layout

- `$TODO_DIR/TODO.md` — master index. All queries ("what's on my list?", "what's due?") are answered from this file alone.
- `$TODO_DIR/<ID>.md` — optional detail file for individual items. Only read when actively working on that item.

## Commands

**Default action:** When the user invokes `/todo` with no arguments, show the todo list (same as "what's on my todo list?").

The user may say things like:
- "add a todo" / "track this issue" / "add a review request"
- "what's on my todo list?" / "show todos" / "what's due soon?"
- **"update"** / "update todo status" / "check on my todos" / "refresh" → triggers a batch status refresh of all active PR/Review/Issue/Workstream items by querying GitHub for the latest state
- **"today"** → show the most important items to focus on today. First filter to **active items only** (empty Done column), then filter to: P0 items, P1 items, items due today or overdue, and P2 items due today. Sort by effective priority. Keep the output concise and actionable — this is a "what should I do right now?" view, not the full list.
- "mark TODO-3 done" / "complete TODO-3" (sets Done date, does not change Status)
- "undo TODO-3" / "mark TODO-3 not done" (clears Done date)
- "work on TODO-5" / "what's next for TODO-5?"
- "scan my assigned issues" / "create todos for my assigned issues"
- "add my slack saved messages as todos" / "import saved for later"
- "remove TODO-7" / "delete TODO-7"
- "change todo directory" / "set todo path" → update the storage location in `~/.claude/todo-config.json`

## Rules

- **New PRs and review requests are auto-added** during both background (15-min interval) and foreground (`/todo update`) refreshes. The server discovers untracked items and adds them automatically — no user confirmation needed.
- **Never perform the next step on a TODO** without explicit request or confirmation from the user.
- **Be conservative with GitHub API** to avoid rate limits. Batch queries where possible.
- **Keep TODO.md minimal** — one line per item in a table. All general queries should be answerable from TODO.md alone.
- **Only read detail files** (`<ID>.md`) when actively working on a specific item.

## Steps

### Adding a TODO

1. Read `$TODO_DIR/TODO.md` to get the current state and next ID.
2. Ask for or infer: description, type, due date, priority. If the user doesn't specify priority, apply the priority guidelines from TODO.md.
3. Add a row to the table in TODO.md.
4. If there is additional context worth tracking (links, notes, plan references), create `$TODO_DIR/<ID>.md`.

### Adding TODOs from Slack Saved Messages

When the user asks to import their Slack "saved for later" items:

1. Search Slack for `is:saved` using `slack_search_public_and_private` (requires user consent). Paginate to get all results.
2. Read `$TODO_DIR/TODO.md` to get current state and avoid duplicates.
3. For each saved message, classify it:
   - **PR review request** → create as **Review** type (preferred when the message asks the user to review a PR). Record the Slack message link in the detail file alongside the PR link.
   - **Action item / follow-up** → create as **General** type.
   - **Issue / bug report** → create as **Issue** type if it references a GitHub issue.
   - **Already tracked** → skip if a TODO already exists for the same PR/issue/topic.
4. Extract metadata from the saved message:
   - **Due date**: If the message has a Slack reminder time, use that as the due date.
   - **Priority**: Apply standard priority guidelines. Review requests default to P1.
   - **Source**: Always record `Source: Slack saved` and the Slack message link in the detail file.
5. Add rows to TODO.md and create detail files for items with links/context.
6. Present the full list of items to be added and get user confirmation before writing.

### Querying TODOs

1. Read `$TODO_DIR/TODO.md`.
2. Answer the question from the table. Default sort order is by **effective priority** (P0 first), not by type or ID. Effective priority considers both the assigned priority and the due date — items approaching their due date should be presented higher regardless of base priority.
3. **Prefix descriptions with an action hint** so the user can scan and understand what each item needs at a glance:
   - **Review** type → `Review: <repo>#<number> <title>`
   - **PR** (open, needs reviews) → `Get reviews: <repo>#<number> <title>`
   - **PR** (draft) → `Finish draft: <repo>#<number> <title>`
   - **PR** (CI failing) → `Fix CI: <repo>#<number> <title>`
   - **PR** (approved) → `Merge: <repo>#<number> <title>`
   - **Issue** → `Implement: <repo>#<number> <title>`
   - **Workstream** → `Workstream: <title> (<progress>)`
   - **General** → just the description
   - **Process** → `Process: <title>`
   These prefixes are for display when listing — they are NOT stored in TODO.md. The stored description stays concise.
4. Do NOT read individual detail files unless the user asks about a specific item.

### Updating Status

**Trigger:** Update status when the user says "update", "refresh", "check on my todos", or tells you something has changed (e.g. "X has been merged", "I closed Y", "Z got approved"). When the user states a fact about a TODO item, immediately update TODO.md and any relevant detail files to reflect it.

**CRITICAL: Always check actual state.** When updating any TODO that references a GitHub PR or issue, ALWAYS query GitHub for the current state. Never infer the state from conversation context alone — the GitHub API is the source of truth, not the conversation.

When performing a full status check (`/todo update`):

1. Read `$TODO_DIR/TODO.md`. First, delete any rows where the Done date is more than 30 days ago (and their detail files). Then proceed with status checks.
2. Determine the user's GitHub login (use `gh api user` or check memory).
3. **Batch-query GitHub for all active PR/Review items.** Group items by repo and use parallel API calls to minimize round-trips:
   - For each unique repo, fetch all referenced PRs in parallel using `gh pr view <number> --repo <owner/repo> --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,mergedAt,closedAt`
   - For Review items, also fetch reviews in parallel: `gh api 'repos/OWNER/REPO/pulls/NUMBER/reviews'` and filter for the user's login
   - For Issues, fetch status: `gh issue view <number> --repo <owner/repo> --json state,stateReason`
4. For each active item (empty Done column), update status based on type:
   - **General**: Leave as-is (no API to check).
   - **Workstream**: Read the detail file, check each PR's GitHub status from the batch results, update the detail file and summary in TODO.md.
   - **Issue**: Update from GitHub issue state. If closed, set Done date.
   - **PR**: Update from GitHub PR state:
     - Merged → set Done date, status "Merged"
     - Closed → set Done date, status "Closed"
     - Draft → status "Draft" + note merge conflicts or CI failures if present
     - Open → note CI status, review decision, merge conflicts
   - **Review**: Update from GitHub PR state AND the user's review status:
     - If PR is merged or closed → set Done date
     - If user has submitted an APPROVED review → set Done date to the review's `submitted_at` date
     - If user has submitted CHANGES_REQUESTED or COMMENTED without approval → status "[BLOCKED] Reviewed, awaiting author", priority P5
     - If user's review is pending (re-requested) → clear Done date if previously done, status "Pending"
     - Also note: CI status, merge conflicts, draft state
   - **Process**: Check against the defined process lifecycle.
5. **Priority adjustments:** After updating statuses, adjust priorities based on the new state:
   - PR/Workstream items with PRs that are approved + CI passing → escalate to P1 (quick wins, just need to merge)
   - Review items for draft/CI-failing/conflicted PRs → P3
   - Blocked items → P5
6. Write all changes to TODO.md in a single edit.
7. Report a summary of changes to the user — only mention items whose status actually changed.

#### Discovering New Items

After updating existing items, scan GitHub for PRs and review requests not already tracked:

1. **User's open PRs:** Query for the user's open PRs across relevant orgs:
   ```
   gh api 'search/issues?q=author:USERNAME+is:open+is:pr+org:ORG&per_page=50'
   ```
   For each PR found, check if it's already tracked in TODO.md (match by repo and PR number in any Description, or in any workstream detail file). Skip PRs that are already tracked.

2. **Pending review requests:** Query for PRs where the user is individually requested:
   ```
   gh api 'search/issues?q=user-review-requested:USERNAME+is:open+is:pr+draft:false+org:ORG&per_page=50'
   ```
   Skip PRs already tracked as Review items.

3. **Present new items to the user** with proposed type, priority, and description. Wait for confirmation before adding any. Group by category (your PRs, review requests) for readability.

4. Add confirmed items to TODO.md and create detail files where useful.

### Working on a TODO

When the user asks to work on or get next steps for a specific TODO:

1. Read `$TODO_DIR/TODO.md` for the item row.
2. Read `$TODO_DIR/<ID>.md` if it exists for additional context.
3. Determine next step based on the type-specific lifecycle (see below).
4. Present the next step and wait for confirmation before executing.

### Removing a TODO

1. Read `$TODO_DIR/TODO.md`.
2. Remove the row from the table.
3. Delete `$TODO_DIR/<ID>.md` if it exists.

## Type Lifecycles

### General
Simple tracking. User marks complete manually.

### Workstream
A body of work that may span multiple PRs. Similar to a GitHub issue but may not have one — if no issue exists, suggest the user creates one to track it externally.

**When a PR belongs to a workstream or issue, it does NOT get its own TODO entry.** Instead, track it in the workstream's detail file (`$TODO_DIR/<ID>.md`). The main TODO.md row for the workstream should summarize current status (e.g., "2/4 PRs merged") rather than listing individual PRs.

**Detail file format for workstreams:**
```markdown
# <Workstream title>

## Goal
<What this workstream achieves>

## GitHub Issue
<link, or "None — consider creating one">

## PRs
| PR | Title | Status |
|----|-------|--------|
| repo#123 | description | Merged/Open/Approved/Draft |

## Remaining Work
- [ ] next thing to do
- [ ] ...
```

**GitHub issues:** When creating a GitHub issue for a workstream, always assign it to the user.

**Lifecycle:**
1. Define scope and goal
2. Brainstorm / plan as needed
3. Implement via PRs (tracked in detail file)
4. Complete when all PRs merged and remaining work is empty

**Completion invariants — a workstream TODO MUST NOT be marked done (Done date set) unless ALL of the following are true:**
1. All items in "Remaining Work" are checked off (no unchecked `- [ ]` items)
2. If the workstream has a linked GitHub issue, that issue is closed
3. All PRs in the detail file are in a terminal state (Merged or Closed)

If any invariant is violated during a status update, clear the Done date and set status to reflect what's actually remaining (e.g., "5/6 PRs merged, issue still open").

**Sync between GitHub issue and detail file:** When updating a workstream's status:
1. Read the detail file to get the linked GitHub issue and PR list
2. Query GitHub for the current state of the issue and all PRs
3. Update the detail file's PR table and Remaining Work to match GitHub reality
4. Update the GitHub issue's checklist/body if it has drifted from the detail file (e.g., PRs merged but not checked off in the issue). Prefix the comment with "**Claude:**" per attribution rules.
5. Update the TODO.md summary row to reflect the current state

**Status updates:** When checking status, look up each PR in the detail file and update its status — including review/approval state (use `get_reviews` or check `mergeable_state`). PRs that are approved should be marked "Approved" so they surface as ready to merge rather than needing reviews. Summarize progress in the main TODO.md row.

### Issue / PR
**Issues:**
1. Brainstorm (`/op:brainstorm`)
2. Plan (`/op:plan`)
3. Execute the plan
4. Create a draft PR → then follow PR lifecycle

One issue may spawn multiple PRs. Track follow-up work in the detail file. If an issue has enough scope to warrant multiple PRs, consider promoting it to a Workstream.

**PRs:**
A standalone PR not part of any workstream or issue. If a PR relates to an existing workstream or issue TODO, it should be tracked there instead of having its own entry.

- Draft → mark ready for review
- Open, CI failing → investigate and fix failures. **Any CI failure blocks merge, including flakes.** Rerun flaky jobs to unblock. Ideally also launch a background agent to investigate the flake and propose a fix on a separate branch so it doesn't recur.
- Open, CI passing, needs approvals → request review (only with user confirmation)
- Open, CI passing, approved → merge or add to merge queue
- In merge queue → no action needed, will merge automatically. Detect this by checking `mergeable_state` or the PR's merge queue status. Note: PRs can be **removed from the merge queue** due to CI failures (often flakes). If that happens, treat it as "Open, CI failing" and rerun/investigate.

### Review Request
Track a PR the user has been asked to review.

**Filtering rules when scanning for review requests:**
- **Skip draft PRs** — drafts are not ready for review. Add `draft:false` to search queries.
- **Only include PRs where the user is requested individually** — use `user-review-requested:USERNAME` in GitHub search (NOT `review-requested:USERNAME`, which includes team-based requests). The `gh` CLI's `--review-requested` flag also includes team requests, so use the API directly: `gh api 'search/issues?q=user-review-requested:USERNAME+is:open+is:pr+draft:false+org:ORG&per_page=50'`

**Lifecycle:**
- Pending → user reviews the PR
- Reviewed (not approved) → blocked, awaiting author action. Prefix status with `[BLOCKED]` and set priority to P5.
- Unblocked when:
  - Replies to user's review comments
  - User's review re-requested in GitHub again after their first review (ie github tracks the user's review as pending again)
  - Comments requesting re-review
  - Slack thread says ready for re-review
  - User manually unblocks
  - The todo was created from a slack message and a comment in the thread for that message says the PR is ready for re-review or the comments have been addressed
- **Done when user has approved the PR** — set the Done date immediately upon approval. Do not wait for the PR to be merged. The user's review responsibility is complete once they approve.
- Also done if the PR is merged (regardless of who approved) — set the Done date.
- **Re-open if review is re-requested** — if the user's review is re-requested on GitHub after they already approved/reviewed, clear the Done date and set status back to Pending.

### Process
Lifecycle defined by an external process (skill, doc, runbook). Derive steps from that process.

## Priority Guidelines

Priority is stored in TODO.md and should be set by the user. If the user doesn't specify, apply the guidelines in the `## Priority Guidelines` section of TODO.md.

**Due date escalation:** When listing items, consider the due date alongside the base priority. Items due today or overdue effectively escalate to P0. Items due within 2 days escalate by one level. This is a display/sort consideration — don't change the stored priority, just present them higher.

When the user sets priorities, observe patterns and update the guidelines in TODO.md to reflect their preferences.

## TODO.md Format

The file uses this structure:

```markdown
# TODO

## Priority Guidelines
<!-- Updated based on observed user preferences -->
- P0: Blocking others or time-sensitive (incidents, deadlines today)
- P1: Others are waiting on you (review requests, blocking reviews)
- P2: Important and should be done soon (assigned issues, active PRs)
- P3: Should be done but not urgent (follow-ups, draft PRs)
- P4: Nice to have, no pressure (exploration, cleanup)
- P5: Blocked — waiting on someone else, no action possible

## Items

| ID | Description | Type | Status | Priority | Due | Done |
|----|-------------|------|--------|----------|-----|------|
```

### Done Column

The `Done` column holds the date (YYYY-MM-DD) when a TODO was marked as done. **The presence of a date in this column is the canonical indicator that a task is complete** — the Status column remains free-form and can say anything (e.g., "Merged", "Complete (approved)", "Closed").

Rules:
- When marking a TODO as done, set the Done column to today's date (YYYY-MM-DD). Do not change the Status column to "Done" — leave Status as-is or update it to reflect the final state (e.g., "Merged", "Approved").
- When marking a TODO as not done (undoing completion), clear the Done column.
- A TODO is considered active if its Done column is empty, regardless of what Status says.
- **Blocked indicator:** Prefix the Status field with `[BLOCKED]` when a TODO is waiting on someone else and no action is possible (e.g., `[BLOCKED] Reviewed, awaiting author`). The todo-ui uses this prefix to grey out blocked items. Remove the prefix when the item becomes actionable again.
- **Cleanup:** When performing any operation on TODO.md, delete rows where the Done date is more than 30 days ago. Also delete the corresponding detail file (`$TODO_DIR/<ID>.md`) if it exists.

## Contract

- TODO.md is the single source of truth for all queries
- Detail files are supplementary, not required
- New PRs and review requests are auto-added during updates
- Never auto-advance work without confirmation
- Priority guidelines evolve based on user preferences
- Conservative GitHub API usage
- The Done column (date) is the canonical "done" indicator — not the Status text
- Delete rows with Done dates older than 30 days on any TODO.md operation
