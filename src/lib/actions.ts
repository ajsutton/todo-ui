import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { TodoItem, GhPrStatus, ClaudeChunk } from "../types.ts";

export function buildStatusString(ghStatus: GhPrStatus): string {
  const parts: string[] = [];

  if (ghStatus.state === "MERGED") {
    parts.push("Merged");
  } else if (ghStatus.state === "CLOSED") {
    parts.push("Closed");
  } else if (ghStatus.isDraft) {
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

export function setDue(todoDir: string, id: string, due: string): void {
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new Error(`Invalid date "${due}". Must be YYYY-MM-DD or empty to clear.`);
  }
  const filePath = path.join(todoDir, "TODO.md");
  const content = readFileSync(filePath, "utf-8");
  const updated = replaceCells(content, id, new Map([[CELL_DUE, due]]));
  atomicWrite(filePath, updated);
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
      (c) => getResult(c) === "SUCCESS",
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
    "state,isDraft,statusCheckRollup,reviewDecision,mergeable",
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

export async function* runClaudePrompt(
  cwd: string,
  prompt: string,
): AsyncGenerator<ClaudeChunk, void, void> {
  const proc = Bun.spawn(
    [
      "claude", "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode", "bypassPermissions",
    ],
    {
      cwd,
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
