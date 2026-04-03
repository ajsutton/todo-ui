import path from "node:path";
import type { TodoItem } from "../types.ts";
import { getLogEntries } from "./update-log.ts";

export interface StandupDoneItem {
  id: string;
  description: string;
  type: string;
  githubUrl?: string;
}

export interface StandupStatusChange {
  id: string;
  description: string;
  oldStatus: string;
  newStatus: string;
  githubUrl?: string;
}

export interface StandupGitHubActivity {
  title: string;
  url: string;
  repo: string;
  action: string;
}

export interface StandupPriorityItem {
  id: string;
  description: string;
  priority: string;
  status: string;
  type: string;
  githubUrl?: string;
}

export interface StandupOverdueItem {
  id: string;
  description: string;
  priority: string;
  due: string;
  githubUrl?: string;
}

export interface StandupDueTodayItem {
  id: string;
  description: string;
  priority: string;
  githubUrl?: string;
}

export interface StandupReport {
  date: string;
  yesterdayDate: string;
  yesterday: {
    done: StandupDoneItem[];
    statusChanges: StandupStatusChange[];
    githubActivity: StandupGitHubActivity[];
  };
  today: {
    highPriority: StandupPriorityItem[];
    overdue: StandupOverdueItem[];
    dueToday: StandupDueTodayItem[];
    blocked: StandupDoneItem[];
  };
}

function dateString(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function getGhUser(): Promise<string> {
  try {
    const proc = Bun.spawn(["gh", "api", "user", "--jq", ".login"], { stderr: "ignore" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return "";
  }
}

interface GhSearchItem {
  title: string;
  html_url: string;
  repository_url: string;
}

async function ghSearch(query: string): Promise<GhSearchItem[]> {
  try {
    const proc = Bun.spawn(
      ["gh", "api", `search/issues?q=${query}&per_page=30`],
      { stderr: "ignore" },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];
    const data = JSON.parse(output) as { items?: GhSearchItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

async function fetchGitHubActivity(ghUser: string, yesterday: string): Promise<StandupGitHubActivity[]> {
  const activities: StandupGitHubActivity[] = [];

  const [merged, reviewed] = await Promise.all([
    ghSearch(`author:${ghUser}+is:pr+merged:${yesterday}..${yesterday}`),
    ghSearch(`reviewed-by:${ghUser}+is:pr+updated:${yesterday}..${yesterday}`),
  ]);

  const seenUrls = new Set<string>();

  for (const item of merged) {
    const repo = item.repository_url.replace("https://api.github.com/repos/", "");
    activities.push({ title: item.title, url: item.html_url, repo, action: "merged" });
    seenUrls.add(item.html_url);
  }

  for (const item of reviewed) {
    if (seenUrls.has(item.html_url)) continue;
    const repo = item.repository_url.replace("https://api.github.com/repos/", "");
    activities.push({ title: item.title, url: item.html_url, repo, action: "reviewed" });
    seenUrls.add(item.html_url);
  }

  return activities;
}

export async function generateStandupReport(todoDir: string, items: TodoItem[]): Promise<StandupReport> {
  const today = dateString(0);
  const yesterday = dateString(-1);

  // Done items (doneDate = yesterday)
  const done: StandupDoneItem[] = items
    .filter((i) => i.doneDate === yesterday)
    .map((i) => ({ id: i.id, description: i.description, type: i.type, githubUrl: i.githubUrl }));

  // Status changes from update log entries yesterday
  const { entries } = getLogEntries(todoDir, 200, 0);
  const yesterdayEntries = entries.filter((e) => e.timestamp.slice(0, 10) === yesterday);

  const statusChanges: StandupStatusChange[] = [];
  const seenIds = new Set<string>();
  for (const entry of yesterdayEntries) {
    for (const result of entry.results) {
      if (result.oldStatus !== result.newStatus && !seenIds.has(result.id)) {
        seenIds.add(result.id);
        const item = items.find((i) => i.id === result.id);
        statusChanges.push({
          id: result.id,
          description: result.description,
          oldStatus: result.oldStatus,
          newStatus: result.newStatus,
          githubUrl: item?.githubUrl,
        });
      }
    }
  }

  // GitHub activity
  let githubActivity: StandupGitHubActivity[] = [];
  try {
    const ghUser = await getGhUser();
    if (ghUser) {
      githubActivity = await fetchGitHubActivity(ghUser, yesterday);
    }
  } catch {
    // Best-effort — ignore failures
  }

  // Today's priorities
  const active = items.filter((i) => !i.doneDate);

  const highPriority: StandupPriorityItem[] = active
    .filter((i) => i.priority === "P0" || i.priority === "P1")
    .map((i) => ({ id: i.id, description: i.description, priority: i.priority, status: i.status, type: i.type, githubUrl: i.githubUrl }));

  const overdue: StandupOverdueItem[] = active
    .filter((i) => i.due && i.due < today)
    .map((i) => ({ id: i.id, description: i.description, priority: i.priority, due: i.due, githubUrl: i.githubUrl }));

  const dueToday: StandupDueTodayItem[] = active
    .filter((i) => i.due === today)
    .map((i) => ({ id: i.id, description: i.description, priority: i.priority, githubUrl: i.githubUrl }));

  const blocked: StandupDoneItem[] = active
    .filter((i) => i.blocked)
    .map((i) => ({ id: i.id, description: i.description, type: i.type, githubUrl: i.githubUrl }));

  return {
    date: today,
    yesterdayDate: yesterday,
    yesterday: { done, statusChanges, githubActivity },
    today: { highPriority, overdue, dueToday, blocked },
  };
}

function stripDescriptionLinks(desc: string): string {
  // Strip markdown link prefixes like [org/repo#123](url) from description
  return desc.replace(/^\[.*?\]\(.*?\)\s*/, "").trim();
}

export function buildStandupClaudePrompt(report: StandupReport): string {
  const lines: string[] = [
    `Today is ${report.date}. Generate a concise daily standup report based on the following activity data.`,
    "",
    "## Yesterday's Activity",
    "",
    `### Completed items (marked done on ${report.yesterdayDate}):`,
  ];

  if (report.yesterday.done.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of report.yesterday.done) {
      lines.push(`- [${item.id}] ${stripDescriptionLinks(item.description)} (${item.type})`);
    }
  }

  lines.push("", "### Status changes from update log:");
  if (report.yesterday.statusChanges.length === 0) {
    lines.push("(none)");
  } else {
    for (const c of report.yesterday.statusChanges) {
      lines.push(`- [${c.id}] ${stripDescriptionLinks(c.description)}: ${c.oldStatus} → ${c.newStatus}`);
    }
  }

  lines.push("", "### GitHub activity:");
  if (report.yesterday.githubActivity.length === 0) {
    lines.push("(none)");
  } else {
    for (const a of report.yesterday.githubActivity) {
      lines.push(`- ${a.action} ${a.repo}: ${a.title}`);
    }
  }

  lines.push("", "## Today's Priorities", "");

  lines.push("### High priority items (P0/P1):");
  if (report.today.highPriority.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of report.today.highPriority) {
      lines.push(`- [${item.id}] ${item.priority}: ${stripDescriptionLinks(item.description)} — ${item.status}`);
    }
  }

  if (report.today.overdue.length > 0) {
    lines.push("", "### Overdue items:");
    for (const item of report.today.overdue) {
      lines.push(`- [${item.id}] ${stripDescriptionLinks(item.description)} (due ${item.due}, ${item.priority})`);
    }
  }

  if (report.today.dueToday.length > 0) {
    lines.push("", "### Due today:");
    for (const item of report.today.dueToday) {
      lines.push(`- [${item.id}] ${stripDescriptionLinks(item.description)} (${item.priority})`);
    }
  }

  if (report.today.blocked.length > 0) {
    lines.push("", "### Blocked:");
    for (const item of report.today.blocked) {
      lines.push(`- [${item.id}] ${stripDescriptionLinks(item.description)}`);
    }
  }

  lines.push(
    "",
    "## Instructions",
    "",
    "Write a concise standup report with exactly two sections:",
    "**Yesterday** — what was accomplished or progressed (2-5 bullet points max, focus on meaningful work)",
    "**Today** — the key things to work on today (2-5 bullet points max, focus on highest impact)",
    "",
    "Be brief and specific. Mention PR/issue references where relevant. Skip items that are not meaningful",
    "(e.g. automated status changes with no real work done). Do not include section headers beyond Yesterday/Today.",
  );

  return lines.join("\n");
}
