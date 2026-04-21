import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import path from "node:path";
import type { TodoItem, GhPrStatus, ClaudeChunk, DiscoveredItem, LinkedPr } from "../types.ts";
import {
  type GitHubClient, type BatchQuery, type BatchResult,
  defaultGitHubClient,
} from "./github-client.ts";

const SEARCH_ORG = "ethereum-optimism";

export function buildStatusString(ghStatus: GhPrStatus): string {
  if (ghStatus.state === "MERGED") return "Merged";
  if (ghStatus.state === "CLOSED") return "Closed";
  if (ghStatus.isInMergeQueue) return "In merge queue";

  const parts: string[] = [];

  if (ghStatus.isDraft) {
    parts.push("Draft");
  } else {
    parts.push("Open");
  }

  if (ghStatus.statusCheckRollup) {
    const rollup = ghStatus.statusCheckRollup;
    if (rollup === "FAILURE" || rollup === "ERROR") {
      parts.push("CI failing");
    } else if (rollup === "SUCCESS") {
      parts.push("CI passing");
    } else if (rollup === "PENDING") {
      parts.push("CI pending");
    }
  }

  if (ghStatus.reviewDecision === "APPROVED") {
    parts.push("approved");
  } else if (ghStatus.reviewDecision === "CHANGES_REQUESTED") {
    parts.push("changes requested");
  }

  if (ghStatus.mergeable === "CONFLICTING") {
    parts.push("merge conflict");
  }

  return parts.join(", ");
}

// Cell indices when splitting on "|" (index 0 is empty before first |)
const CELL_DESCRIPTION = 2;
const CELL_TYPE = 3;
const CELL_STATUS = 4;
const CELL_PRIORITY = 5;
const CELL_DUE = 6;
const CELL_DONE = 7;

// Expected number of cells when splitting a 7-column markdown row on "|":
// empty + 7 columns + trailing empty = 9
const EXPECTED_CELLS = 9;

function replaceCells(
  fileContent: string,
  id: string,
  updates: Map<number, string>,
): string {
  const lines = fileContent.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed.split("|");
    const cellId = cells[1]?.trim();
    if (cellId !== id) continue;

    // Pad to expected length so updates to trailing columns always work
    while (cells.length < EXPECTED_CELLS) {
      cells.push("");
    }
    // Ensure trailing empty string so join produces a trailing "|"
    if (cells[cells.length - 1]!.trim() !== "") {
      cells.push("");
    }

    for (const [idx, value] of updates) {
      cells[idx] = ` ${value} `;
    }
    lines[i] = cells.join("|");
    found = true;
    break;
  }

  if (!found) {
    throw new Error(`Item ${id} not found in TODO.md`);
  }

  return lines.join("\n");
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);
}

export function markComplete(todoDir: string, id: string): void {
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_DONE, todayString()]]));
  atomicWrite(filePath, updated);
}

export function markIncomplete(todoDir: string, id: string): void {
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_DONE, ""]]));
  atomicWrite(filePath, updated);
}

const VALID_PRIORITIES = ["P0", "P1", "P2", "P3", "P4", "P5"];

export function setPriority(todoDir: string, id: string, priority: string): void {
  if (!VALID_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority "${priority}". Must be one of: ${VALID_PRIORITIES.join(", ")}`);
  }
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_PRIORITY, priority]]));
  atomicWrite(filePath, updated);
}

const VALID_TYPES = ["PR", "Review", "Issue", "Workstream"];

export function setType(todoDir: string, id: string, type: string): void {
  const trimmed = type.trim();
  if (!VALID_TYPES.includes(trimmed)) {
    throw new Error(`Invalid type "${trimmed}". Must be one of: ${VALID_TYPES.join(", ")}`);
  }
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_TYPE, trimmed]]));
  atomicWrite(filePath, updated);
}

export function setDue(todoDir: string, id: string, due: string): void {
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new Error(`Invalid date "${due}". Must be YYYY-MM-DD or empty to clear.`);
  }
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_DUE, due]]));
  atomicWrite(filePath, updated);
}

export function setDescription(todoDir: string, id: string, description: string): void {
  const trimmed = description.trim();
  if (!trimmed) throw new Error("Description cannot be empty");
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_DESCRIPTION, trimmed]]));
  atomicWrite(filePath, updated);
}

export function saveDetailMarkdown(todoDir: string, id: string, markdown: string): void {
  const number = id.replace("TODO-", "");
  const filePath = path.join(todoDir, `TODO-${number}.md`);
  atomicWrite(filePath, markdown);
}

export function setSubItemPriority(
  todoDir: string,
  parentId: string,
  repo: string,
  number: number,
  priority: string,
): void {
  if (!/^P[0-5]$/.test(priority)) throw new Error(`Invalid priority "${priority}"`);
  const detailPath = path.join(todoDir, `${parentId}.md`);
  if (!existsSync(detailPath)) throw new Error(`Detail file not found for ${parentId}`);

  let content = readFileSync(detailPath, "utf-8");
  const refs = parseDetailPrRefs(content);
  const ref = refs.find((r) => r.repo === repo && r.number === number);
  if (!ref) throw new Error(`Sub-item ${repo}#${number} not found in ${parentId}`);

  const lines = content.split("\n");

  if (ref.priorityCellIndex !== -1) {
    // Priority column exists — update it
    const line = lines[ref.lineIndex]!;
    const cells = line.split("|");
    cells[ref.priorityCellIndex] = ` ${priority} `;
    lines[ref.lineIndex] = cells.join("|");
  } else {
    // No Priority column — add one to the table header, separator, and all data rows
    // Find the table header for this ref by scanning backwards
    let headerIdx = -1;
    let sepIdx = -1;
    for (let i = ref.lineIndex - 1; i >= 0; i--) {
      const line = lines[i]!.trim();
      if (!line.startsWith("|")) break;
      if (line.split("|").some((c) => /^-+$/.test(c.trim()))) {
        sepIdx = i;
        continue;
      }
      if (line.split("|").some((c) => /^status$/i.test(c.trim()))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1 || sepIdx === -1) throw new Error("Could not find table header");

    // Append Priority column to header
    lines[headerIdx] = lines[headerIdx]!.replace(/\|\s*$/, "| Priority |");
    // Append to separator
    lines[sepIdx] = lines[sepIdx]!.replace(/\|\s*$/, "|----------|");

    // Add priority cell to all data rows in this table
    for (let i = sepIdx + 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line.startsWith("|")) break;
      const val = (refs.find((r) => r.lineIndex === i)?.repo === repo &&
                   refs.find((r) => r.lineIndex === i)?.number === number)
        ? priority : "";
      lines[i] = lines[i]!.replace(/\|\s*$/, `| ${val} |`);
    }
  }

  content = lines.join("\n");
  atomicWrite(detailPath, content);
}

function parseGhPrJson(json: string): GhPrStatus {
  const raw = JSON.parse(json) as Record<string, unknown>;

  let rollupStatus = "";
  if (Array.isArray(raw["statusCheckRollup"])) {
    const checks = raw["statusCheckRollup"] as Array<
      Record<string, unknown>
    >;
    // CheckRun items use "conclusion", StatusContext items use "state"
    const getResult = (c: Record<string, unknown>): string =>
      (c["conclusion"] as string) ?? (c["state"] as string) ?? "";
    const hasFailure = checks.some((c) => {
      const result = getResult(c);
      return result === "FAILURE" || result === "ERROR";
    });
    const allSuccess = checks.every(
      (c) => { const r = getResult(c); return r === "SUCCESS" || r === "SKIPPED" || r === "NEUTRAL"; },
    );
    if (hasFailure) {
      rollupStatus = "FAILURE";
    } else if (allSuccess && checks.length > 0) {
      rollupStatus = "SUCCESS";
    } else {
      rollupStatus = "PENDING";
    }
  }

  return {
    state: raw["state"] as string,
    isDraft: raw["isDraft"] as boolean,
    statusCheckRollup: rollupStatus,
    reviewDecision: (raw["reviewDecision"] as string) ?? "",
    mergeable: (raw["mergeable"] as string) ?? "",
    isInMergeQueue: raw["mergeQueueEntry"] != null,
  };
}

export async function refreshPrStatus(
  todoDir: string,
  id: string,
  items: TodoItem[],
): Promise<string> {
  const item = items.find((i) => i.id === id);
  if (!item?.githubUrl) {
    throw new Error(`Item ${id} has no GitHub URL`);
  }

  const url = new URL(item.githubUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  // segments: [owner, repo, "pull"|"issues", number]
  const owner = segments[0];
  const repo = segments[1];
  const number = segments[3];

  if (!owner || !repo || !number) {
    throw new Error(`Cannot parse GitHub URL: ${item.githubUrl}`);
  }

  const proc = Bun.spawn([
    "gh",
    "pr",
    "view",
    number,
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "state,isDraft,statusCheckRollup,reviewDecision,mergeable,mergeQueueEntry",
  ]);

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`gh pr view exited with code ${exitCode}`);
  }

  const ghStatus = parseGhPrJson(output);
  const statusStr = buildStatusString(ghStatus);

  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_STATUS, statusStr]]));
  atomicWrite(filePath, updated);

  return statusStr;
}

export async function refreshAllPrStatuses(
  todoDir: string,
  items: TodoItem[],
): Promise<Map<string, string>> {
  const prItems = items.filter((i) => i.githubUrl);
  const results = new Map<string, string>();
  const maxConcurrent = 5;
  let running = 0;
  let idx = 0;

  await new Promise<void>((resolve) => {
    if (prItems.length === 0) {
      resolve();
      return;
    }

    function launchNext(): void {
      while (running < maxConcurrent && idx < prItems.length) {
        const item = prItems[idx]!;
        idx++;
        running++;

        refreshPrStatus(todoDir, item.id, items)
          .then((status) => {
            results.set(item.id, status);
          })
          .catch(() => {
            // Skip individual failures
          })
          .finally(() => {
            running--;
            if (idx >= prItems.length && running === 0) {
              resolve();
            } else {
              launchNext();
            }
          });
      }
    }

    launchNext();
  });

  return results;
}

// --- Full /todo update logic ---

function batchKeyFor(repo: string, number: number): string {
  // GraphQL aliases must be valid identifiers
  return `r_${repo.replace(/[^a-zA-Z0-9]/g, "_")}_${number}`;
}

function isPassingStatus(r: string): boolean {
  return r === "SUCCESS" || r === "SKIPPED" || r === "NEUTRAL";
}

function computeCiStatus(raw: Record<string, unknown>): string {
  const rollup = raw["statusCheckRollup"];
  if (!Array.isArray(rollup) || rollup.length === 0) return "";
  const checks = rollup as Array<Record<string, unknown>>;
  const getResult = (c: Record<string, unknown>): string =>
    (c["conclusion"] as string) ?? (c["state"] as string) ?? "";
  if (checks.some((c) => { const r = getResult(c); return r === "FAILURE" || r === "ERROR"; })) return "FAILURE";
  if (checks.every((c) => isPassingStatus(getResult(c)))) return "SUCCESS";
  return "PENDING";
}

export interface UpdateResult {
  id: string;
  description: string;
  githubUrl: string | undefined;
  repo: string | undefined;
  prNumber: number | undefined;
  oldStatus: string;
  newStatus: string;
  oldPriority: string;
  newPriority: string;
  doneDateSet: boolean;
}

/**
 * Full /todo update: queries GitHub for every active PR/Review/Issue item,
 * updates status + priority + done date, cleans up old done items.
 */
export type ProgressCallback = (current: number, total: number, phase: string, itemId?: string) => void;

export interface UpdateError {
  id: string;
  description: string;
  error: string;
}

export async function updateAll(
  todoDir: string,
  items: TodoItem[],
  onProgress?: ProgressCallback,
  ghClient: GitHubClient = defaultGitHubClient,
): Promise<{ results: UpdateResult[]; discovered: DiscoveredItem[]; errors: UpdateError[] }> {
  const today = todayString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // Clean up items done > 30 days
  for (const item of items) {
    if (item.doneDate && item.doneDate < thirtyDaysAgo) {
      const detailFile = path.join(todoDir, `${item.id}.md`);
      if (existsSync(detailFile)) unlinkSync(detailFile);
      // Remove the row from TODO.md
      const filePath = path.join(todoDir, "TODO.md");
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const filtered = lines.filter((l) => {
        if (!l.trim().startsWith("|")) return true;
        const cells = l.split("|");
        return cells[1]?.trim() !== item.id;
      });
      atomicWrite(filePath, filtered.join("\n"));
    }
  }

  // Items done > 7 days ago — ignore their detail files for dedup and discovery
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const staleIds = new Set(
    items.filter((i) => i.doneDate && i.doneDate < sevenDaysAgo).map((i) => i.id),
  );

  // Refresh issue links — find PRs linked to tracked issues and create/update detail files
  onProgress?.(0, 0, "Refreshing issue links");
  await refreshIssueLinks(todoDir, items, staleIds, (repo, num) => ghClient.findLinkedPrs(repo, num));

  // Remove PR/Review items that are already tracked in an issue or workstream detail file
  const workstreamKeys = collectTrackedKeys(todoDir, [], staleIds);  // only detail files, skip stale
  const filePath = path.join(todoDir, "TODO.md");
  {
    const dupes = items.filter((i) =>
      (i.type === "PR" || i.type === "Review") &&
      i.repo && i.prNumber &&
      workstreamKeys.has(`${i.repo}#${i.prNumber}`),
    );
    if (dupes.length > 0) {
      let content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const dupeIds = new Set(dupes.map((d) => d.id));
      const filtered = lines.filter((l) => {
        if (!l.trim().startsWith("|")) return true;
        const cells = l.split("|");
        return !dupeIds.has(cells[1]?.trim() ?? "");
      });
      atomicWrite(filePath, filtered.join("\n"));
      // Remove from items array so they aren't processed
      for (const dupe of dupes) {
        const idx = items.indexOf(dupe);
        if (idx !== -1) items.splice(idx, 1);
      }
    }
  }

  // Get GitHub user for review checks and discovery
  let ghUser = "";
  let ghUserError = "";
  try { ghUser = await ghClient.getUser(); } catch (err) {
    ghUserError = err instanceof Error ? err.message : String(err);
  }

  // Update active items with GitHub references
  const activeItems = items.filter((i) => !i.doneDate && i.repo && i.prNumber);
  const results: UpdateResult[] = [];

  const pendingUpdates = new Map<string, { status: string; priority: string; done: string; blocked: boolean }>();
  const errors: UpdateError[] = [];
  const total = activeItems.length;

  onProgress?.(0, total, "Checking GitHub status");

  // Batch-fetch all PR/Issue data in one GraphQL call
  const batchQueries: BatchQuery[] = [];
  for (const item of activeItems) {
    const [owner, repo] = item.repo!.split("/");
    if (!owner || !repo) continue;
    batchQueries.push({
      key: batchKeyFor(item.repo!, item.prNumber!),
      owner,
      repo,
      number: item.prNumber!,
      isPr: item.type === "PR" || item.type === "Review",
      needsReviews: item.type === "Review" && !!ghUser,
    });
  }

  const batchResults = await ghClient.batchQuery(batchQueries);
  onProgress?.(Math.floor(total * 0.8), total, "Processing results");

  // Process each item using pre-fetched data
  for (const item of activeItems) {
    try {
      const key = batchKeyFor(item.repo!, item.prNumber!);
      const data = batchResults.get(key);
      if (!data) continue;
      const result = processFetchedItem(item, data, ghUser, today);
      if (result) {
        pendingUpdates.set(item.id, result.update);
        results.push(result.summary);
      }
    } catch (err) {
      errors.push({
        id: item.id,
        description: item.description,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.(total, total, "Checking GitHub status");

  // Apply all updates in a single write
  if (pendingUpdates.size > 0) {
    let content = readFileSync(filePath, "utf-8");
    for (const [id, upd] of pendingUpdates) {
      const updates = new Map<number, string>();
      const statusVal = upd.blocked ? `[BLOCKED] ${upd.status}` : upd.status;
      updates.set(CELL_STATUS, statusVal);
      updates.set(CELL_PRIORITY, upd.priority);
      if (upd.done) updates.set(CELL_DONE, upd.done);
      content = replaceCells(content, id, updates);
    }
    atomicWrite(filePath, content);
  }

  // Update workstream and issue detail files (refresh linked PR statuses)
  const detailItems = items.filter(
    (i) => (i.type === "Workstream" || i.type === "Issue") && !i.doneDate,
  );
  if (detailItems.length > 0) {
    onProgress?.(total, total, "Updating workstreams");

    // Collect all active PR refs across all detail files for a single batch query
    const wsRefMap = new Map<string, { item: TodoItem; refs: DetailPrRef[]; activeRefs: DetailPrRef[] }>();
    for (const ws of detailItems) {
      const detailPath = path.join(todoDir, `${ws.id}.md`);
      if (!existsSync(detailPath)) continue;
      const content = readFileSync(detailPath, "utf-8");
      const refs = parseDetailPrRefs(content);
      if (refs.length === 0) continue;
      const activeRefs = refs.filter((r) => {
        const s = r.currentStatus.toLowerCase();
        return !s.startsWith("merged") && !s.startsWith("closed");
      });
      wsRefMap.set(ws.id, { item: ws, refs, activeRefs });
    }

    // Batch-fetch all active sub-item PRs
    const wsBatchQueries: BatchQuery[] = [];
    for (const [, entry] of wsRefMap) {
      for (const ref of entry.activeRefs) {
        const [owner, repo] = ref.repo.split("/");
        if (!owner || !repo) continue;
        const key = batchKeyFor(ref.repo, ref.number);
        if (!wsBatchQueries.some((q) => q.key === key)) {
          wsBatchQueries.push({ key, owner, repo, number: ref.number, isPr: true, needsReviews: false });
        }
      }
    }

    const wsBatchResults = wsBatchQueries.length > 0 ? await ghClient.batchQuery(wsBatchQueries) : new Map();

    // Process each detail file with pre-fetched data
    for (const [wsId, entry] of wsRefMap) {
      try {
        const wsResult = updateWorkstreamDetailWithData(todoDir, entry.item, entry.refs, entry.activeRefs, wsBatchResults);
        // For Issues, processFetchedItem already set the main-row status from the
        // GitHub issue state (Open/Closed/Unassigned). Don't overwrite it with a
        // sub-item summary — only Workstreams derive their main-row status from
        // sub-items.
        if (wsResult && entry.item.type === "Workstream") {
          let content = readFileSync(filePath, "utf-8");
          content = replaceCells(content, wsId, new Map([[CELL_STATUS, wsResult.newStatus]]));
          atomicWrite(filePath, content);
          results.push({
            id: entry.item.id,
            description: entry.item.description,
            githubUrl: entry.item.githubUrl,
            repo: entry.item.repo,
            prNumber: entry.item.prNumber,
            oldStatus: entry.item.status,
            newStatus: wsResult.newStatus,
            oldPriority: entry.item.priority,
            newPriority: entry.item.priority,
            doneDateSet: false,
          });
        }
      } catch (err) {
        errors.push({
          id: entry.item.id,
          description: entry.item.description,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Recompute issue priorities from sub-items
  const issueItems = items.filter((i) => (i.type === "Issue" || i.type === "Workstream") && !i.doneDate);
  for (const issue of issueItems) {
    const detailPath = path.join(todoDir, `${issue.id}.md`);
    if (!existsSync(detailPath)) continue;
    let content = readFileSync(detailPath, "utf-8");
    let refs = parseDetailPrRefs(content);

    // Backfill Priority column if missing
    if (refs.length > 0 && refs[0]!.priorityCellIndex === -1) {
      const lines = content.split("\n");
      let patched = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line.startsWith("|")) continue;
        const cells = line.split("|").map((c) => c.trim());
        if (cells.some((c) => /^status$/i.test(c))) {
          // Header row — append Priority column
          lines[i] = lines[i]!.replace(/\|\s*$/, "| Priority |");
          // Next line should be separator
          if (i + 1 < lines.length && lines[i + 1]!.includes("---")) {
            lines[i + 1] = lines[i + 1]!.replace(/\|\s*$/, "|----------|");
          }
          patched = true;
          continue;
        }
        if (!patched) continue;
        if (cells.some((c) => /^-+$/.test(c))) continue;
        if (!line.startsWith("|")) break;
        // Data row — assign default priority based on status
        const statusCol = refs.find((r) => r.lineIndex === i);
        let defaultP = "";
        if (statusCol) {
          const s = statusCol.currentStatus.toLowerCase();
          if (s.includes("merged") || s.includes("closed")) defaultP = "";
          else if (s.includes("draft")) defaultP = "P3";
          else defaultP = "P2";
        }
        lines[i] = lines[i]!.replace(/\|\s*$/, `| ${defaultP} |`);
      }
      if (patched) {
        content = lines.join("\n");
        atomicWrite(detailPath, content);
        refs = parseDetailPrRefs(content);
      }
    }
    // P4 if no sub-items, otherwise highest sub-item priority with P3 floor
    let newPriorityNum = refs.length > 0 ? 3 : 4;
    for (const ref of refs) {
      if (!ref.currentPriority) continue;
      const pNum = parseInt(ref.currentPriority.replace("P", ""), 10);
      if (!Number.isNaN(pNum) && pNum < newPriorityNum) newPriorityNum = pNum;
    }
    const newPriority = `P${newPriorityNum}`;
    if (newPriority !== issue.priority) {
      let fileContent = readFileSync(filePath, "utf-8");
      fileContent = replaceCells(fileContent, issue.id, new Map([[CELL_PRIORITY, newPriority]]));
      atomicWrite(filePath, fileContent);
      results.push({
        id: issue.id,
        description: issue.description,
        githubUrl: issue.githubUrl,
        repo: issue.repo,
        prNumber: issue.prNumber,
        oldStatus: issue.status,
        newStatus: issue.status,
        oldPriority: issue.priority,
        newPriority,
        doneDateSet: false,
      });
    }
  }

  // Discover new items
  onProgress?.(total, total, "Scanning for new items");
  const discovered = ghUser ? await discoverNewItems(todoDir, items, ghUser, staleIds, ghClient) : [];
  if (ghUserError) {
    errors.push({ id: "(auth)", description: "GitHub authentication", error: `Could not determine GitHub user: ${ghUserError}` });
  }

  return { results, discovered, errors };
}

function processFetchedItem(
  item: TodoItem,
  data: BatchResult,
  ghUser: string,
  today: string,
): { update: { status: string; priority: string; done: string; blocked: boolean }; summary: UpdateResult } | null {
  const oldStatus = item.blocked ? `[BLOCKED] ${item.status}` : item.status;
  const oldPriority = item.priority;

  if (item.type === "PR") {
    const ciStatus = computeCiStatusFromBatch(data.statusCheckRollup ?? []);
    const ghStatus: GhPrStatus = {
      state: data.state ?? "",
      isDraft: data.isDraft ?? false,
      statusCheckRollup: ciStatus,
      reviewDecision: data.reviewDecision ?? "",
      mergeable: data.mergeable ?? "",
      isInMergeQueue: data.isInMergeQueue ?? false,
    };
    let statusStr = buildStatusString(ghStatus);
    let priority = item.priority;
    let done = "";
    const blocked = false;

    if (ghStatus.state === "MERGED") {
      statusStr = "Merged"; done = today; priority = "P1";
    } else if (ghStatus.state === "CLOSED") {
      statusStr = "Closed"; done = today;
    } else if (ghStatus.isInMergeQueue) {
      priority = "P5";
    } else if (!ghStatus.isDraft && ghStatus.reviewDecision === "APPROVED" && ghStatus.statusCheckRollup === "SUCCESS") {
      priority = "P1";
    }

    const newFullStatus = blocked ? `[BLOCKED] ${statusStr}` : statusStr;
    if (newFullStatus === oldStatus && priority === oldPriority && !done) return null;
    return {
      update: { status: statusStr, priority, done, blocked },
      summary: { id: item.id, description: item.description, githubUrl: item.githubUrl, repo: item.repo, prNumber: item.prNumber, oldStatus, newStatus: newFullStatus, oldPriority, newPriority: priority, doneDateSet: !!done },
    };
  }

  if (item.type === "Review") {
    const state = data.state ?? "";
    const isDraft = data.isDraft ?? false;
    const ci = computeCiStatusFromBatch(data.statusCheckRollup ?? []);
    const mergeState = data.mergeStateStatus ?? "";
    const isInMergeQueue = data.isInMergeQueue ?? false;

    let status = "";
    let priority = item.priority;
    let done = "";
    let blocked = false;

    if (state === "MERGED" || state === "CLOSED") {
      status = state === "MERGED" ? "Merged" : "Closed";
      done = today;
    } else if (isInMergeQueue) {
      status = "In merge queue";
      priority = "P5";
    } else if (ghUser && data.reviews !== undefined) {
      // Check if user is still a requested reviewer or has reviewed
      const userReviews = data.reviews.filter((r) => r.user?.login === ghUser);
      const isRequested = data.reviewRequestedUsers?.includes(ghUser) ?? false;
      const hasReviewed = userReviews.length > 0;

      if (!isRequested && !hasReviewed) {
        // User was removed as reviewer without ever reviewing
        status = "Review request removed"; done = today;
      } else {
        const latestState = hasReviewed ? userReviews[userReviews.length - 1]!.state : "NONE";
        if (latestState === "APPROVED") {
          status = "Approved"; done = today;
        } else if (latestState === "CHANGES_REQUESTED" || latestState === "COMMENTED") {
          status = "Reviewed, awaiting author"; priority = "P5"; blocked = true;
        } else if (isDraft) {
          status = "Draft, not ready for review"; priority = "P3";
        } else {
          status = "Pending";
          if (ci === "FAILURE") { status = "Pending, CI failing"; priority = "P3"; }
        }
      }
    } else {
      const ghStatus: GhPrStatus = {
        state, isDraft, statusCheckRollup: ci,
        reviewDecision: data.reviewDecision ?? "", mergeable: data.mergeable ?? "",
        isInMergeQueue,
      };
      status = buildStatusString(ghStatus);
    }
    if (mergeState === "DIRTY" && !blocked && !done) {
      status = `${status}, merge conflicts`; priority = "P5"; blocked = true;
    }

    const newFullStatus = blocked ? `[BLOCKED] ${status}` : status;
    if (newFullStatus === oldStatus && priority === oldPriority && !done) return null;
    return {
      update: { status, priority, done, blocked },
      summary: { id: item.id, description: item.description, githubUrl: item.githubUrl, repo: item.repo, prNumber: item.prNumber, oldStatus, newStatus: newFullStatus, oldPriority, newPriority: priority, doneDateSet: !!done },
    };
  }

  if (item.type === "Issue") {
    const state = data.state ?? "";
    let status = item.status;
    let done = "";

    if (state === "CLOSED") {
      status = "Closed"; done = today;
    } else if (state === "OPEN") {
      const assignees = data.assignees;
      const isAssigned = ghUser && assignees?.some((a) => a.login === ghUser);
      if (ghUser && !isAssigned) {
        status = "Unassigned"; done = today;
      } else {
        status = "Open";
      }
    }

    if (status === oldStatus && !done) return null;
    return {
      update: { status, priority: item.priority, done, blocked: false },
      summary: { id: item.id, description: item.description, githubUrl: item.githubUrl, repo: item.repo, prNumber: item.prNumber, oldStatus, newStatus: status, oldPriority: item.priority, newPriority: item.priority, doneDateSet: !!done },
    };
  }

  return null;
}

function computeCiStatusFromBatch(checks: Array<Record<string, unknown>>): string {
  if (checks.length === 0) return "";
  const getResult = (c: Record<string, unknown>): string =>
    (c["conclusion"] as string) ?? (c["state"] as string) ?? "";
  if (checks.some((c) => { const r = getResult(c); return r === "FAILURE" || r === "ERROR"; })) return "FAILURE";
  if (checks.every((c) => isPassingStatus(getResult(c)))) return "SUCCESS";
  return "PENDING";
}

export interface DetailPrRef {
  repo: string;
  number: number;
  lineIndex: number;
  statusCellIndex: number;
  priorityCellIndex: number;
  currentStatus: string;
  currentPriority: string;
  title: string;
  githubUrl: string;
}

export function parseDetailPrRefs(content: string): DetailPrRef[] {
  const lines = content.split("\n");
  const refs: DetailPrRef[] = [];

  // Find table rows with PR references and a Status column
  // Supports multiple tables — each header row resets column indices
  let statusColIdx = -1;
  let prColIdx = -1;
  let titleColIdx = -1;
  let priorityColIdx = -1;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line.startsWith("|")) {
      if (inTable) {
        inTable = false;
        statusColIdx = -1;
        prColIdx = -1;
        titleColIdx = -1;
        priorityColIdx = -1;
      }
      continue;
    }

    const cells = line.split("|").map((c) => c.trim());

    // Detect header row to find Status, PR, and Title column indices
    if (cells.some((c) => /^status$/i.test(c))) {
      statusColIdx = cells.findIndex((c) => /^status$/i.test(c));
      prColIdx = cells.findIndex((c) => /^pr$/i.test(c));
      titleColIdx = cells.findIndex((c) => /^title$/i.test(c));
      priorityColIdx = cells.findIndex((c) => /^priority$/i.test(c));
      inTable = true;
      continue;
    }

    // Skip separator rows
    if (cells.some((c) => /^-+$/.test(c))) continue;

    if (statusColIdx === -1) continue;

    // Extract PR reference from the PR column if identified, otherwise from the whole line
    const searchText = prColIdx !== -1 ? (cells[prColIdx] ?? "") : line;
    const urlMatch = searchText.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/(pull|issues)\/(\d+)/);
    const shortMatch = searchText.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/);

    let repo: string;
    let number: number;
    let githubUrl: string;
    if (urlMatch) {
      repo = urlMatch[1]!;
      number = parseInt(urlMatch[3]!, 10);
      const kind = urlMatch[2] === "issues" ? "issues" : "pull";
      githubUrl = `https://github.com/${repo}/${kind}/${number}`;
    } else if (shortMatch) {
      repo = shortMatch[1]!;
      number = parseInt(shortMatch[2]!, 10);
      githubUrl = `https://github.com/${repo}/pull/${number}`;
    } else {
      continue;
    }

    const currentStatus = cells[statusColIdx] ?? "";

    // Extract title from the Title column, or from the link text in the PR column
    let title = "";
    if (titleColIdx !== -1) {
      title = (cells[titleColIdx] ?? "").replace(/^\[.*?\]\(.*?\)\s*/, "").trim();
    }
    if (!title) {
      // Try to get link text: [text](url)
      const linkTextMatch = searchText.match(/\[([^\]]+)\]/);
      if (linkTextMatch) {
        // Strip the repo#number prefix from link text if present
        title = linkTextMatch[1]!.replace(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+#\d+\s*/, "").trim();
      }
    }

    const currentPriority = priorityColIdx !== -1 ? (cells[priorityColIdx] ?? "").trim() : "";

    refs.push({ repo, number, lineIndex: i, statusCellIndex: statusColIdx, priorityCellIndex: priorityColIdx, currentStatus, currentPriority, title, githubUrl });
  }

  return refs;
}

function updateWorkstreamDetailWithData(
  todoDir: string,
  item: TodoItem,
  refs: DetailPrRef[],
  activeRefs: DetailPrRef[],
  batchData: Map<string, BatchResult>,
): { newStatus: string } | null {
  const detailPath = path.join(todoDir, `${item.id}.md`);
  let content = readFileSync(detailPath, "utf-8");
  const lines = content.split("\n");
  let changed = false;

  for (const ref of activeRefs) {
    const key = batchKeyFor(ref.repo, ref.number);
    const data = batchData.get(key);
    if (!data) continue;

    const state = data.state ?? "";
    const isDraft = data.isDraft ?? false;
    const mergeable = data.mergeable ?? "";
    const ci = computeCiStatusFromBatch(data.statusCheckRollup ?? []);

    const isInMergeQueue = data.isInMergeQueue ?? false;

    let newStatus: string;
    if (state === "MERGED") {
      newStatus = "Merged";
    } else if (state === "CLOSED") {
      newStatus = "Closed";
    } else if (isInMergeQueue) {
      newStatus = "In merge queue";
    } else if (isDraft) {
      const parts = ["Draft"];
      if (mergeable === "CONFLICTING") parts.push("merge conflicts");
      else if (ci === "FAILURE") parts.push("CI failing");
      else if (mergeable === "MERGEABLE") parts.push("mergeable");
      newStatus = parts.join(", ");
    } else {
      const parts = ["Open"];
      if (mergeable === "CONFLICTING") parts.push("merge conflicts");
      else if (ci === "FAILURE") parts.push("CI failing");
      else if (ci === "SUCCESS") parts.push("CI passing");
      newStatus = parts.join(", ");
    }

    if (newStatus === ref.currentStatus) continue;

    const line = lines[ref.lineIndex]!;
    const cells = line.split("|");
    if (ref.statusCellIndex < cells.length) {
      cells[ref.statusCellIndex] = ` ${newStatus} `;
      lines[ref.lineIndex] = cells.join("|");
      changed = true;
    }
  }

  if (!changed) return null;

  content = lines.join("\n");
  atomicWrite(detailPath, content);

  // Recompute summary status from the updated detail
  const updatedRefs = parseDetailPrRefs(content);
  let merged = 0;
  let closed = 0;
  const total = updatedRefs.length;
  const nonDone: string[] = [];
  for (const ref of updatedRefs) {
    const s = ref.currentStatus.toLowerCase();
    if (s.includes("merged")) merged++;
    else if (s.includes("closed")) closed++;
    else nonDone.push(`#${ref.number} ${ref.currentStatus.toLowerCase()}`);
  }

  const parts: string[] = [];
  if (merged > 0) parts.push(`${merged}/${total} PRs merged`);
  if (closed > 0) parts.push(`${closed} closed`);
  if (nonDone.length > 0) parts.push(`${nonDone.length} remaining (${nonDone.join(", ")})`);

  const newStatus = parts.join(", ") || item.status;
  if (newStatus === item.status) return null;

  return { newStatus };
}

function parseGhPrJsonRaw(raw: Record<string, unknown>): GhPrStatus {
  return {
    state: raw["state"] as string,
    isDraft: raw["isDraft"] as boolean,
    statusCheckRollup: computeCiStatus(raw),
    reviewDecision: (raw["reviewDecision"] as string) ?? "",
    mergeable: (raw["mergeable"] as string) ?? "",
    isInMergeQueue: raw["mergeQueueEntry"] != null,
  };
}

// --- Discovery ---

export function collectTrackedKeys(todoDir: string, items: TodoItem[], excludeDetailIds?: Set<string>): Set<string> {
  const tracked = new Set<string>();

  function addKey(repo: string, num: string | number): void {
    // Normalize to full org/repo#N form
    const r = String(repo);
    const n = String(num);
    const fullRepo = r.includes("/") ? r : `${SEARCH_ORG}/${r}`;
    tracked.add(`${fullRepo}#${n}`);
  }

  // From parsed items
  for (const item of items) {
    if (item.repo && item.prNumber) {
      addKey(item.repo, item.prNumber);
    }
  }

  // From detail files — match short refs (repo#N), full refs (org/repo#N), and GitHub URLs
  const shortHashPattern = /\[([a-zA-Z0-9_.-]+)#(\d+)\]/g;
  const fullHashPattern = /([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)#(\d+)/g;
  const urlPattern = /github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/(?:pull|issues)\/(\d+)/g;
  try {
    const files = readdirSync(todoDir).filter(
      (f) => f.startsWith("TODO-") && f.endsWith(".md"),
    );
    for (const file of files) {
      // Skip detail files for excluded IDs (e.g. items done > 7 days)
      if (excludeDetailIds) {
        const id = file.replace(".md", "");
        if (excludeDetailIds.has(id)) continue;
      }
      const content = readFileSync(path.join(todoDir, file), "utf-8");
      for (const m of content.matchAll(shortHashPattern)) {
        addKey(m[1]!, m[2]!);
      }
      for (const m of content.matchAll(fullHashPattern)) {
        addKey(m[1]!, m[2]!);
      }
      for (const m of content.matchAll(urlPattern)) {
        addKey(m[1]!, m[2]!);
      }
    }
  } catch { /* directory read failed — use what we have */ }

  return tracked;
}

async function discoverNewItems(
  todoDir: string,
  items: TodoItem[],
  ghUser: string,
  staleIds: Set<string> | undefined,
  ghClient: GitHubClient,
): Promise<DiscoveredItem[]> {
  const tracked = collectTrackedKeys(todoDir, items, staleIds);
  const discovered: DiscoveredItem[] = [];

  // Run all searches in parallel
  const [myPrs, reviewRequests, assignedIssues] = await Promise.all([
    ghClient.searchIssues(`author:${ghUser}+is:open+is:pr+org:${SEARCH_ORG}`),
    ghClient.searchIssues(`user-review-requested:${ghUser}+is:open+is:pr+draft:false+org:${SEARCH_ORG}`),
    ghClient.searchIssues(`assignee:${ghUser}+is:open+is:issue+org:${SEARCH_ORG}`),
  ]);

  // Track review request keys to avoid duplicates with my PRs
  const reviewKeys = new Set<string>();
  for (const pr of reviewRequests) {
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    const key = `${repo}#${pr.number}`;
    reviewKeys.add(key);
    if (tracked.has(key)) continue;
    discovered.push({
      repo,
      prNumber: pr.number,
      title: pr.title,
      url: pr.html_url,
      type: "Review",
      suggestedPriority: "P1",
      author: pr.user.login,
    });
  }

  for (const pr of myPrs) {
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    const key = `${repo}#${pr.number}`;
    if (tracked.has(key) || reviewKeys.has(key)) continue;
    discovered.push({
      repo,
      prNumber: pr.number,
      title: pr.title,
      url: pr.html_url,
      type: "PR",
      suggestedPriority: pr.draft ? "P3" : "P2",
      author: pr.user.login,
    });
  }

  // Discover assigned issues and find linked PRs for each
  // Note: for already-tracked issues, refreshIssueLinks already ran and created/updated
  // detail files. collectTrackedKeys (above) picks up linked PR keys from those files,
  // so we skip the findLinkedPrs call for tracked issues to avoid redundant API calls.
  for (const issue of assignedIssues) {
    const repo = issue.repository_url.replace("https://api.github.com/repos/", "");
    const key = `${repo}#${issue.number}`;
    if (tracked.has(key)) continue;

    // New issue — find linked PRs
    const linkedPrs = await ghClient.findLinkedPrs(repo, issue.number);

    // P4 if no linked PRs (not started), P3+ if there are (work in progress)
    let priority = linkedPrs.length > 0 ? 3 : 4;
    for (const lp of linkedPrs) {
      const pNum = parseInt(lp.priority.replace("P", ""), 10);
      if (!Number.isNaN(pNum) && pNum < priority) priority = pNum;
    }

    const item: DiscoveredItem = {
      repo,
      prNumber: issue.number,
      title: issue.title,
      url: issue.html_url,
      type: "Issue",
      suggestedPriority: `P${priority}`,
      author: issue.user.login,
    };
    if (linkedPrs.length > 0) item.linkedPrs = linkedPrs;
    discovered.push(item);
  }

  return discovered;
}

export function addDiscoveredItems(todoDir: string, newItems: DiscoveredItem[]): void {
  if (newItems.length === 0) return;

  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Find the highest existing TODO-N id
  let maxId = 0;
  for (const line of lines) {
    const match = line.match(/\|\s*TODO-(\d+)\s*\|/);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num > maxId) maxId = num;
    }
  }

  // Find the last table row to insert after
  let lastRowIdx = -1;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.match(/^\|\s*ID/)) { inTable = true; continue; }
    if (inTable && trimmed.match(/^\|\s*-+/)) continue;
    if (inTable && trimmed.startsWith("|")) {
      lastRowIdx = i;
    } else if (inTable && !trimmed.startsWith("|")) {
      break;
    }
  }

  if (lastRowIdx === -1) {
    // Table has no data rows — insert after the separator
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().match(/^\|\s*-+/)) {
        lastRowIdx = i;
        break;
      }
    }
  }

  // Build new rows and collect detail files to create
  const newRows: string[] = [];
  const detailFiles: Array<{ id: string; item: DiscoveredItem }> = [];
  for (const item of newItems) {
    maxId++;
    const id = `TODO-${maxId}`;
    // Short repo name: remove org prefix if it matches SEARCH_ORG
    const shortRepo = item.repo.startsWith(`${SEARCH_ORG}/`)
      ? item.repo.slice(SEARCH_ORG.length + 1)
      : item.repo;
    const desc = `[${shortRepo}#${item.prNumber}](${item.url}) ${item.title}${item.type === "Review" ? ` (${item.author})` : ""}`;
    const status = item.type === "Review" ? "Pending" : "Open";
    newRows.push(`| ${id} | ${desc} | ${item.type} | ${status} | ${item.suggestedPriority} | | |`);

    if (item.linkedPrs && item.linkedPrs.length > 0) {
      detailFiles.push({ id, item });
    }
  }

  // Insert after the last row
  lines.splice(lastRowIdx + 1, 0, ...newRows);
  atomicWrite(filePath, lines.join("\n"));

  // Create detail files for issues with linked PRs
  for (const { id, item } of detailFiles) {
    const shortRepo = item.repo.startsWith(`${SEARCH_ORG}/`)
      ? item.repo.slice(SEARCH_ORG.length + 1)
      : item.repo;
    const detailLines = [
      `# ${item.title}`,
      ``,
      `## Issue`,
      `[${shortRepo}#${item.prNumber}](${item.url})`,
      ``,
      `## PRs`,
      `| PR | Title | Status | Priority |`,
      `|----|-------|--------|----------|`,
    ];
    for (const lp of item.linkedPrs!) {
      const lpShortRepo = lp.repo.startsWith(`${SEARCH_ORG}/`)
        ? lp.repo.slice(SEARCH_ORG.length + 1)
        : lp.repo;
      detailLines.push(`| [${lpShortRepo}#${lp.number}](${lp.url}) | ${lp.title} | ${lp.status} | ${lp.priority} |`);
    }
    detailLines.push(``);
    atomicWrite(path.join(todoDir, `${id}.md`), detailLines.join("\n"));
  }
}

/**
 * For each tracked Issue item, check for linked PRs via the GitHub timeline API.
 * Creates or updates detail files so that linked PRs appear as sub-items
 * rather than standalone TODO entries. Returns the set of PR keys that are now
 * tracked in issue detail files.
 */
export async function refreshIssueLinks(
  todoDir: string,
  items: TodoItem[],
  staleIds?: Set<string>,
  findLinkedPrsFn: (repo: string, issueNumber: number) => Promise<LinkedPr[]> = (r, n) => defaultGitHubClient.findLinkedPrs(r, n),
): Promise<Set<string>> {
  const linkedPrKeys = new Set<string>();
  const issueItems = items.filter(
    (i) => i.type === "Issue" && !i.doneDate && i.repo && i.prNumber,
  );
  if (issueItems.length === 0) return linkedPrKeys;

  // Check linked PRs for all issues in parallel
  const results = await Promise.all(
    issueItems.map(async (issue) => {
      const linkedPrs = await findLinkedPrsFn(issue.repo!, issue.prNumber!);
      return { issue, linkedPrs };
    }),
  );

  for (const { issue, linkedPrs } of results) {
    if (linkedPrs.length === 0) continue;

    // Add all linked PR keys to the result set
    for (const lp of linkedPrs) {
      const fullRepo = lp.repo.includes("/") ? lp.repo : `${SEARCH_ORG}/${lp.repo}`;
      linkedPrKeys.add(`${fullRepo}#${lp.number}`);
    }

    const detailPath = path.join(todoDir, `${issue.id}.md`);

    if (existsSync(detailPath)) {
      // Detail file exists — add any PRs not already listed
      const content = readFileSync(detailPath, "utf-8");
      const existingRefs = parseDetailPrRefs(content);
      const existingKeys = new Set(existingRefs.map((r) => `${r.repo}#${r.number}`));

      const newPrs = linkedPrs.filter((lp) => {
        const fullRepo = lp.repo.includes("/") ? lp.repo : `${SEARCH_ORG}/${lp.repo}`;
        return !existingKeys.has(`${fullRepo}#${lp.number}`);
      });

      if (newPrs.length > 0) {
        // Find the last table row in the PRs section and append
        const lines = content.split("\n");
        let lastTableRow = -1;
        let inPrTable = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!.trim();
          if (line.startsWith("## PRs")) { inPrTable = true; continue; }
          if (inPrTable && line.startsWith("|") && !line.match(/^\|\s*-+/)) {
            // Skip header row
            const cells = line.split("|").map((c) => c.trim());
            if (cells.some((c) => /^pr$/i.test(c) || /^title$/i.test(c) || /^status$/i.test(c))) continue;
            lastTableRow = i;
          }
          if (inPrTable && !line.startsWith("|") && line !== "") break;
        }
        if (lastTableRow === -1) {
          // No data rows yet — find separator row
          for (let i = 0; i < lines.length; i++) {
            if (lines[i]!.trim().match(/^\|\s*-+/) && inPrTable) {
              lastTableRow = i;
              break;
            }
          }
        }
        if (lastTableRow !== -1) {
          const newRows = newPrs.map((lp) => {
            const lpShortRepo = lp.repo.startsWith(`${SEARCH_ORG}/`)
              ? lp.repo.slice(SEARCH_ORG.length + 1)
              : lp.repo;
            return `| [${lpShortRepo}#${lp.number}](${lp.url}) | ${lp.title} | ${lp.status} | ${lp.priority} |`;
          });
          lines.splice(lastTableRow + 1, 0, ...newRows);
          atomicWrite(detailPath, lines.join("\n"));
        }
      }
    } else {
      // No detail file — create one
      const shortRepo = issue.repo!.startsWith(`${SEARCH_ORG}/`)
        ? issue.repo!.slice(SEARCH_ORG.length + 1)
        : issue.repo!;
      const detailLines = [
        `# ${issue.description.replace(/^\[.*?\]\(.*?\)\s*/, "")}`,
        ``,
        `## Issue`,
        `[${shortRepo}#${issue.prNumber}](${issue.githubUrl})`,
        ``,
        `## PRs`,
        `| PR | Title | Status | Priority |`,
        `|----|-------|--------|----------|`,
      ];
      for (const lp of linkedPrs) {
        const lpShortRepo = lp.repo.startsWith(`${SEARCH_ORG}/`)
          ? lp.repo.slice(SEARCH_ORG.length + 1)
          : lp.repo;
        detailLines.push(`| [${lpShortRepo}#${lp.number}](${lp.url}) | ${lp.title} | ${lp.status} | ${lp.priority} |`);
      }
      detailLines.push(``);
      atomicWrite(path.join(todoDir, `${issue.id}.md`), detailLines.join("\n"));
    }
  }

  return linkedPrKeys;
}

export function addManualItem(
  todoDir: string,
  description: string,
  type: string,
  priority: string,
  status: string,
): string {
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Find highest existing TODO-N id
  let maxId = 0;
  for (const line of lines) {
    const match = line.match(/\|\s*TODO-(\d+)\s*\|/);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num > maxId) maxId = num;
    }
  }

  // Find insertion point (after last table row)
  let lastRowIdx = -1;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.match(/^\|\s*ID/)) { inTable = true; continue; }
    if (inTable && trimmed.match(/^\|\s*-+/)) continue;
    if (inTable && trimmed.startsWith("|")) {
      lastRowIdx = i;
    } else if (inTable && !trimmed.startsWith("|")) {
      break;
    }
  }

  if (lastRowIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().match(/^\|\s*-+/)) {
        lastRowIdx = i;
        break;
      }
    }
  }

  if (lastRowIdx === -1) throw new Error("Could not find table in TODO.md");

  const id = `TODO-${maxId + 1}`;
  const safeDesc = description.replace(/\|/g, "\\|");
  const newRow = `| ${id} | ${safeDesc} | ${type} | ${status} | ${priority} | | |`;
  lines.splice(lastRowIdx + 1, 0, newRow);
  atomicWrite(filePath, lines.join("\n"));
  return id;
}

export async function* runClaudePrompt(
  todoDir: string,
  prompt: string,
): AsyncGenerator<ClaudeChunk, void, void> {
  const systemPrompt = [
    `You are managing a TODO list stored in markdown files.`,
    `The TODO data directory is: ${todoDir}`,
    `- TODO.md contains the main table of items (ID, Description, Type, Status, Priority, Due, Done).`,
    `- Detail files (TODO-N.md) contain additional context, linked PRs/issues in markdown tables.`,
    `- When editing these files, preserve the existing markdown table format exactly.`,
  ].join("\n");

  // Add the todo-ui project dir so the /todo skill is available
  // import.meta.dir = src/lib/, so go up two levels to project root
  const todoUiRoot = path.resolve(import.meta.dir, "..", "..");

  const proc = Bun.spawn(
    [
      "claude", "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode", "bypassPermissions",
      "--append-system-prompt", systemPrompt,
      "--add-dir", todoUiRoot,
    ],
    {
      cwd: todoDir,
      stdout: "pipe",
      stderr: "ignore",
    },
  );

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event["type"] === "stream_event") {
          const inner = event["event"] as Record<string, unknown> | undefined;
          if (inner?.["type"] === "content_block_delta") {
            const delta = inner["delta"] as Record<string, unknown> | undefined;
            if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
              yield { kind: "text", text: delta["text"] };
            }
          } else if (inner?.["type"] === "content_block_start") {
            const block = inner["content_block"] as Record<string, unknown> | undefined;
            if (block?.["type"] === "tool_use" && typeof block["name"] === "string") {
              yield { kind: "activity", tool: block["name"] };
            }
          }
        } else if (event["type"] === "result" && event["is_error"] === true) {
          lastError = (event["result"] as string) ?? "";
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(lastError || `claude exited with code ${exitCode}`);
  }
}
