import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TodoItem } from "../types.ts";
import { getLogEntries } from "./update-log.ts";
import { parseDetailPrRefs } from "./actions.ts";

export interface StandupSubItem {
  repo: string;
  number: number;
  title: string;
  status: string;
  githubUrl: string;
}

export interface StandupDoneItem {
  id: string;
  description: string;
  type: string;
  githubUrl?: string;
  subItems?: StandupSubItem[];
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
  subItems?: StandupSubItem[];
}

export interface StandupNeedsReviewItem {
  id: string;
  description: string;
  priority: string;
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
    needsReview: StandupNeedsReviewItem[];
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

function getSubItemsForItem(todoDir: string, id: string): StandupSubItem[] {
  const detailPath = path.join(todoDir, `${id}.md`);
  if (!existsSync(detailPath)) return [];
  const content = readFileSync(detailPath, "utf-8");
  const refs = parseDetailPrRefs(content);
  return refs.map((r) => ({
    repo: r.repo,
    number: r.number,
    title: r.title,
    status: r.currentStatus,
    githubUrl: r.githubUrl,
  }));
}

export async function generateStandupReport(todoDir: string, items: TodoItem[]): Promise<StandupReport> {
  const today = dateString(0);
  const yesterday = dateString(-1);

  // Done items (doneDate = yesterday)
  const done: StandupDoneItem[] = items
    .filter((i) => i.doneDate === yesterday)
    .map((i) => ({
      id: i.id,
      description: i.description,
      type: i.type,
      githubUrl: i.githubUrl,
      subItems: getSubItemsForItem(todoDir, i.id),
    }));

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
    .map((i) => ({
      id: i.id, description: i.description, priority: i.priority, status: i.status, type: i.type, githubUrl: i.githubUrl,
      subItems: getSubItemsForItem(todoDir, i.id),
    }));

  // PRs that are open (not draft) and not yet approved — needs review attention
  const needsReview: StandupNeedsReviewItem[] = active
    .filter((i) => i.type === "PR" && i.status && !i.status.toLowerCase().includes("approved") && !i.status.toLowerCase().includes("draft"))
    .map((i) => ({ id: i.id, description: i.description, priority: i.priority, githubUrl: i.githubUrl }));

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
    today: { highPriority, needsReview, overdue, dueToday, blocked },
  };
}

export function buildStandupClaudePrompt(todoDir: string): string {
  return [
    `Today is ${dateString(0)}. Yesterday was ${dateString(-1)}.`,
    "",
    "Generate a concise daily standup report. Gather information from multiple sources:",
    "",
    "## Data sources to check",
    "",
    `1. **TODO list** at ${todoDir}:`,
    "   - TODO.md: main table (ID, Description, Type, Status, Priority, Due, Done)",
    "   - Detail files (TODO-N.md): linked PRs/issues per item",
    "   - update-log.jsonl: recent status changes with timestamps",
    "",
    "2. **GitHub activity** (use `gh` CLI to look beyond just the TODO list):",
    "   - PRs authored, reviewed, merged, or commented on yesterday",
    "   - Issues opened, closed, or commented on yesterday",
    "   - Review requests received or submitted",
    "   - Use `gh search prs` and `gh search issues` with author/reviewed-by/mentions filters",
    "   - Check notifications: `gh api notifications`",
    "",
    "3. **Slack messages** (use Slack CLI or `slack` tool if available):",
    "   - Check channel messages from yesterday — public and private channels are both relevant",
    "   - Do NOT look at direct messages (DMs)",
    "   - Look for discussions about work items, blockers, decisions, and follow-ups",
    "   - Note any action items or commitments made in channels",
    "",
    "4. **Previous standup context** — look at the most recent prior standup report (if available in the TODO dir or recent files) to understand what was planned for yesterday. For each item that was a focus yesterday:",
    "   - Report on actual progress made (or explicitly note if there was no progress and why)",
    "   - If something was blocked or delayed, surface it",
    "   - This continuity is the most valuable part of a standup",
    "",
    "## Output format",
    "",
    "Write a concise standup report with exactly two sections:",
    "**Yesterday** — what was accomplished or progressed (2-5 bullet points max)",
    "**Today** — the key things to work on today (2-5 bullet points max)",
    "",
    "## Writing guidelines",
    "",
    "- Focus on the business value and impact, not status changes.",
    "  BAD: 'PR optimism#1234 status changed from Open to Approved'",
    "  GOOD: 'Got approval on the new rate limiting implementation (optimism#1234)'",
    "  BAD: 'Merged optimism#5678'",
    "  GOOD: 'Landed fix for race condition in batch processor (optimism#5678)'",
    "- Synthesize across sources — if Slack discussion and a GitHub PR both relate to the same topic, combine them into one bullet.",
    "- For continuity: if yesterday's plan said 'work on X' and X wasn't done, note it explicitly ('X still in progress — [reason if known]').",
    "- For Today items, make the action clear: 'Review ...', 'Continue work on ...', 'Merge ...', 'Address feedback on ...'",
    "- Call out any of your own PRs that are open and awaiting review approval — these need attention.",
    "- Reference PRs/issues inline (e.g. optimism#123) where helpful, but lead with what the work accomplishes.",
    "- Skip items that are not meaningful (e.g. automated status changes with no real work done).",
    "- Do not include internal TODO IDs (like TODO-1).",
    "- Do not include section headers beyond Yesterday/Today.",
  ].join("\n");
}
