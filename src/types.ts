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
  isInMergeQueue: boolean;
}

export type ClaudeChunk =
  | { kind: "text"; text: string }
  | { kind: "activity"; tool: string };

export interface DiscoveredItem {
  repo: string;
  prNumber: number;
  title: string;
  url: string;
  type: "PR" | "Review";
  suggestedPriority: string;
  author: string;
}

export interface UpdateLogEntry {
  timestamp: string;
  results: { id: string; description: string; oldStatus: string; newStatus: string; oldPriority: string; newPriority: string; doneDateSet: boolean }[];
  discoveredCount: number;
  errors: { id: string; description: string; error: string }[];
  source: "auto" | "manual";
}

export type WsMessage =
  | { type: "state"; data: TodoState }
  | { type: "detail"; data: DetailFile }
  | { type: "claude-status"; data: { requestId: string; status: "running" | "done" | "error"; output: string; activity?: string } }
  | { type: "update-progress"; data: { current: number; total: number; phase: string; itemId?: string } }
  | { type: "pending-discovered"; data: { items: DiscoveredItem[]; timestamp: string } }
  | { type: "reload" };
