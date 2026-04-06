/**
 * Abstraction over GitHub API access. All GitHub calls go through this interface,
 * making it easy to mock for tests.
 */

import type { LinkedPr } from "../types.ts";

export interface GhReview {
  user: { login: string };
  state: string;
  submitted_at?: string;
}

export interface GhSearchItem {
  repository_url: string;
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  user: { login: string };
}

export interface BatchQuery {
  key: string;
  owner: string;
  repo: string;
  number: number;
  isPr: boolean;
  needsReviews: boolean;
}

export interface BatchResult {
  state?: string;
  isDraft?: boolean;
  reviewDecision?: string;
  mergeable?: string;
  mergeStateStatus?: string;
  statusCheckRollup?: Array<Record<string, unknown>>;
  isInMergeQueue?: boolean;
  assignees?: Array<{ login: string }>;
  reviews?: GhReview[];
  reviewRequestedUsers?: string[];
}

export interface GitHubClient {
  getUser(): Promise<string>;
  batchQuery(queries: BatchQuery[]): Promise<Map<string, BatchResult>>;
  searchIssues(query: string): Promise<GhSearchItem[]>;
  findLinkedPrs(repo: string, issueNumber: number): Promise<LinkedPr[]>;
}

const BATCH_SIZE = 30;

export class RealGitHubClient implements GitHubClient {
  async getUser(): Promise<string> {
    const proc = Bun.spawn(["gh", "api", "user", "--jq", ".login"]);
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error("Could not determine GitHub user");
    return output.trim();
  }

  async batchQuery(queries: BatchQuery[]): Promise<Map<string, BatchResult>> {
    const results = new Map<string, BatchResult>();
    if (queries.length === 0) return results;

    for (let i = 0; i < queries.length; i += BATCH_SIZE) {
      const batch = queries.slice(i, i + BATCH_SIZE);
      const fragments: string[] = [];

      for (const q of batch) {
        if (q.isPr) {
          fragments.push(`
            ${q.key}: repository(owner: "${q.owner}", name: "${q.repo}") {
              pullRequest(number: ${q.number}) {
                state
                isDraft
                reviewDecision
                mergeable
                mergeStateStatus
                mergeQueueEntry { id }
                statusCheckRollup: commits(last: 1) {
                  nodes {
                    commit {
                      statusCheckRollup {
                        contexts(first: 100) {
                          nodes {
                            ... on CheckRun { conclusion }
                            ... on StatusContext { state }
                          }
                        }
                      }
                    }
                  }
                }
                ${q.needsReviews ? `reviews(last: 50) { nodes { author { login } state submittedAt } }
                reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } ... on Team { name } } } }` : ""}
              }
            }`);
        } else {
          fragments.push(`
            ${q.key}: repository(owner: "${q.owner}", name: "${q.repo}") {
              issue(number: ${q.number}) {
                state
                assignees(first: 20) { nodes { login } }
              }
            }`);
        }
      }

      const query = `query { ${fragments.join("\n")} }`;
      const proc = Bun.spawn(["gh", "api", "graphql", "-f", `query=${query}`]);
      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;
      if (exitCode !== 0) continue;

      let data: Record<string, Record<string, unknown>>;
      try {
        const parsed = JSON.parse(output) as { data?: Record<string, Record<string, unknown>> };
        data = parsed.data ?? {};
      } catch { continue; }

      for (const q of batch) {
        const repoData = data[q.key] as Record<string, Record<string, unknown>> | undefined;
        if (!repoData) continue;

        const node = q.isPr ? repoData["pullRequest"] : repoData["issue"];
        if (!node) continue;

        const result: BatchResult = {};

        if (q.isPr) {
          const pr = node as Record<string, unknown>;
          result.state = pr["state"] as string;
          result.isDraft = pr["isDraft"] as boolean;
          result.reviewDecision = (pr["reviewDecision"] as string) ?? "";
          result.mergeable = (pr["mergeable"] as string) ?? "";
          result.mergeStateStatus = (pr["mergeStateStatus"] as string) ?? "";
          result.isInMergeQueue = pr["mergeQueueEntry"] != null;

          const commits = pr["statusCheckRollup"] as Record<string, unknown> | undefined;
          const commitNodes = (commits?.["nodes"] as Array<Record<string, unknown>>) ?? [];
          const lastCommit = commitNodes[0];
          if (lastCommit) {
            const rollup = (lastCommit["commit"] as Record<string, unknown>)?.["statusCheckRollup"] as Record<string, unknown> | undefined;
            const contexts = rollup?.["contexts"] as Record<string, unknown> | undefined;
            result.statusCheckRollup = (contexts?.["nodes"] as Array<Record<string, unknown>>) ?? [];
          }

          if (q.needsReviews) {
            const reviewsData = pr["reviews"] as Record<string, unknown> | undefined;
            const reviewNodes = (reviewsData?.["nodes"] as Array<Record<string, unknown>>) ?? [];
            result.reviews = reviewNodes.map((r) => ({
              user: { login: ((r["author"] as Record<string, unknown>)?.["login"] as string) ?? "" },
              state: (r["state"] as string) ?? "",
              submitted_at: (r["submittedAt"] as string) ?? "",
            }));

            const reqData = pr["reviewRequests"] as Record<string, unknown> | undefined;
            const reqNodes = (reqData?.["nodes"] as Array<Record<string, unknown>>) ?? [];
            result.reviewRequestedUsers = reqNodes
              .map((n) => {
                const reviewer = n["requestedReviewer"] as Record<string, unknown> | undefined;
                return (reviewer?.["login"] as string) ?? "";
              })
              .filter(Boolean);
          }
        } else {
          const issue = node as Record<string, unknown>;
          result.state = issue["state"] as string;
          const assigneesData = issue["assignees"] as Record<string, unknown> | undefined;
          result.assignees = ((assigneesData?.["nodes"] as Array<{ login: string }>) ?? []);
        }

        results.set(q.key, result);
      }
    }

    return results;
  }

  async searchIssues(query: string): Promise<GhSearchItem[]> {
    const proc = Bun.spawn(["gh", "api", `search/issues?q=${query}&per_page=50`]);
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];
    try {
      const data = JSON.parse(output) as { items?: GhSearchItem[] };
      return data.items ?? [];
    } catch { return []; }
  }

  async findLinkedPrs(repo: string, issueNumber: number): Promise<LinkedPr[]> {
    const proc = Bun.spawn(["gh", "api", `repos/${repo}/issues/${issueNumber}/timeline?per_page=100`]);
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];

    let events: Array<Record<string, unknown>>;
    try {
      events = JSON.parse(output) as Array<Record<string, unknown>>;
    } catch { return []; }

    const linkedPrs: LinkedPr[] = [];
    const seen = new Set<string>();

    for (const event of events) {
      if (event["event"] !== "cross-referenced") continue;
      const source = event["source"] as Record<string, unknown> | undefined;
      if (!source) continue;
      const issue = source["issue"] as Record<string, unknown> | undefined;
      if (!issue) continue;
      if (!issue["pull_request"]) continue;
      if (issue["state"] !== "open") continue;

      const prUrl = issue["html_url"] as string;
      const prNumber = issue["number"] as number;
      const prRepo = (issue["repository_url"] as string).replace("https://api.github.com/repos/", "");
      const key = `${prRepo}#${prNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isDraft = !!(issue["draft"] as boolean);
      const prPriority = isDraft ? "P3" : "P2";
      const status = isDraft ? "Draft" : "Open";

      linkedPrs.push({
        repo: prRepo,
        number: prNumber,
        title: issue["title"] as string,
        url: prUrl,
        status,
        priority: prPriority,
        isDraft,
      });
    }

    return linkedPrs;
  }
}

/**
 * Mock GitHub client for testing. Configure responses before use.
 */
export class MockGitHubClient implements GitHubClient {
  user = "testuser";
  batchResults = new Map<string, BatchResult>();
  /** Results keyed by query substring. Falls back to empty array. */
  searchResultsByQuery = new Map<string, GhSearchItem[]>();
  linkedPrsByIssue = new Map<string, LinkedPr[]>();

  async getUser(): Promise<string> {
    return this.user;
  }

  async batchQuery(queries: BatchQuery[]): Promise<Map<string, BatchResult>> {
    const results = new Map<string, BatchResult>();
    for (const q of queries) {
      const result = this.batchResults.get(q.key);
      if (result) results.set(q.key, result);
    }
    return results;
  }

  async searchIssues(query: string): Promise<GhSearchItem[]> {
    // Match on query substring keys (e.g. "is:pr" or "is:issue")
    for (const [key, items] of this.searchResultsByQuery) {
      if (query.includes(key)) return items;
    }
    return [];
  }

  async findLinkedPrs(repo: string, issueNumber: number): Promise<LinkedPr[]> {
    return this.linkedPrsByIssue.get(`${repo}#${issueNumber}`) ?? [];
  }

  /** Helper: set search results for queries containing the given substring */
  setSearchResults(querySubstring: string, items: GhSearchItem[]): void {
    this.searchResultsByQuery.set(querySubstring, items);
  }

  /** Helper: register linked PRs for an issue */
  setLinkedPrs(repo: string, issueNumber: number, prs: LinkedPr[]): void {
    this.linkedPrsByIssue.set(`${repo}#${issueNumber}`, prs);
  }

  /** Helper: register a batch result for a repo/number */
  setBatchResult(repo: string, number: number, result: BatchResult): void {
    const key = `r_${repo.replace(/[^a-zA-Z0-9]/g, "_")}_${number}`;
    this.batchResults.set(key, result);
  }
}

/** Default client instance used when no client is passed */
export const defaultGitHubClient = new RealGitHubClient();
