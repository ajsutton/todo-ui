import type { TodoItem } from "../types.ts";

const GITHUB_LINK_RE = /\[([^\]]+)\]\((https:\/\/github\.com\/[^)]+)\)\s*(.*)/;
const GITHUB_URL_PARTS_RE = /github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/;

function renderDescriptionHtml(description: string): string {
  return description.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
}

function parseTableRow(row: string): string[] {
  const cells = row.split("|");
  // Split on | gives empty strings at start/end for rows like "| a | b |"
  // Drop first and last empty entries
  if (cells.length >= 2) {
    return cells.slice(1, -1).map((c) => c.trim());
  }
  return cells.map((c) => c.trim());
}

export function parseTodoMarkdown(content: string): TodoItem[] {
  const lines = content.split("\n");
  const items: TodoItem[] = [];

  let tableStarted = false;
  let separatorSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!tableStarted) {
      if (trimmed.startsWith("| ID")) {
        tableStarted = true;
      }
      continue;
    }

    if (!separatorSeen) {
      if (trimmed.startsWith("|--") || trimmed.startsWith("| --") || trimmed.startsWith("|-")) {
        separatorSeen = true;
      }
      continue;
    }

    if (!trimmed.startsWith("|")) {
      break;
    }

    const cells = parseTableRow(trimmed);
    const id = cells[0] ?? "";
    const description = cells[1] ?? "";
    const type = cells[2] ?? "";
    const status = cells[3] ?? "";
    const priority = cells[4] ?? "";
    const due = cells[5] ?? "";
    const doneDate = cells[6] ?? "";

    if (!id) {
      continue;
    }

    let githubUrl: string | undefined;
    let repo: string | undefined;
    let prNumber: number | undefined;

    const linkMatch = description.match(GITHUB_LINK_RE);
    if (linkMatch) {
      githubUrl = linkMatch[2];
      if (githubUrl) {
        const urlMatch = githubUrl.match(GITHUB_URL_PARTS_RE);
        if (urlMatch) {
          repo = urlMatch[1];
          prNumber = urlMatch[2] ? Number(urlMatch[2]) : undefined;
        }
      }
    }

    const blocked = status.startsWith("[BLOCKED]");
    const displayStatus = blocked ? status.slice("[BLOCKED]".length).trim() : status;

    items.push({
      id,
      description,
      descriptionHtml: renderDescriptionHtml(description),
      githubUrl,
      repo,
      prNumber,
      type,
      status: displayStatus,
      blocked,
      priority,
      due,
      doneDate,
    });
  }

  return items;
}
