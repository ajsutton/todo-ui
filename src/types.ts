export interface TodoItem {
  id: string;
  description: string;
  descriptionHtml: string;
  githubUrl: string | undefined;
  repo: string | undefined;
  prNumber: number | undefined;
  type: "Review" | "PR" | "Workstream" | string;
  status: string;
  blocked: boolean;
  priority: string;
  due: string;
  doneDate: string;
}

export interface TodoState {
  items: TodoItem[];
  rawMarkdown: string;
  lastModified: number;
}

export interface DetailFile {
  id: string;
  content: string;
  contentHtml: string;
}

export interface GhPrStatus {
  state: string;
  isDraft: boolean;
  statusCheckRollup: string;
  reviewDecision: string;
  mergeable: string;
}

export type ClaudeChunk =
  | { kind: "text"; text: string }
  | { kind: "activity"; tool: string };

export type WsMessage =
  | { type: "state"; data: TodoState }
  | { type: "detail"; data: DetailFile }
  | { type: "claude-status"; data: { requestId: string; status: "running" | "done" | "error"; output: string; activity?: string } };
