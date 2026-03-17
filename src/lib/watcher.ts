import { watch, readFileSync, existsSync, type FSWatcher } from "node:fs";
import path from "node:path";
import { parseTodoMarkdown } from "./parser.ts";
import { renderMarkdown } from "./markdown.ts";
import type { TodoState, DetailFile } from "../types.ts";

export class TodoWatcher {
  private todoDir: string;
  private todoFilePath: string;
  private state: TodoState;
  private detailCache: Map<string, DetailFile> = new Map();
  private callbacks: Set<(state: TodoState) => void> = new Set();
  private watcher: FSWatcher;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(todoDir: string) {
    this.todoDir = todoDir;
    this.todoFilePath = path.join(todoDir, "TODO.md");
    this.state = this.readAndParse();

    this.watcher = watch(todoDir, { recursive: false }, (_event, filename) => {
      if (this.debounceTimer !== undefined) {
        clearTimeout(this.debounceTimer);
      }

      // Invalidate detail cache if a detail file changed
      if (filename && filename.startsWith("TODO-") && filename.endsWith(".md")) {
        const id = filename.replace(".md", "");
        this.detailCache.delete(id);
      }

      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        const newState = this.readAndParse();
        if (newState.rawMarkdown !== this.state.rawMarkdown) {
          this.state = newState;
          this.notifyAll();
        }
      }, 100);
    });
  }

  getState(): TodoState {
    return this.state;
  }

  getDetail(id: string): DetailFile | undefined {
    const cached = this.detailCache.get(id);
    if (cached) {
      return cached;
    }

    const number = id.replace("TODO-", "");
    const filePath = path.join(this.todoDir, `TODO-${number}.md`);

    if (!existsSync(filePath)) {
      return undefined;
    }

    const content = readFileSync(filePath, "utf-8");
    const detail: DetailFile = {
      id,
      content,
      contentHtml: renderMarkdown(content),
    };
    this.detailCache.set(id, detail);
    return detail;
  }

  onStateChange(callback: (state: TodoState) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  reload(): void {
    this.state = this.readAndParse();
    this.detailCache.clear();
    this.notifyAll();
  }

  switchDir(todoDir: string): void {
    if (todoDir === this.todoDir) return;
    this.watcher.close();
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.todoDir = todoDir;
    this.todoFilePath = path.join(todoDir, "TODO.md");
    this.detailCache.clear();
    this.state = this.readAndParse();
    this.watcher = watch(todoDir, { recursive: false }, (_event, filename) => {
      if (this.debounceTimer !== undefined) {
        clearTimeout(this.debounceTimer);
      }
      if (filename && filename.startsWith("TODO-") && filename.endsWith(".md")) {
        const id = filename.replace(".md", "");
        this.detailCache.delete(id);
      }
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = undefined;
        const newState = this.readAndParse();
        if (newState.rawMarkdown !== this.state.rawMarkdown) {
          this.state = newState;
          this.notifyAll();
        }
      }, 100);
    });
    this.notifyAll();
  }

  getDir(): string {
    return this.todoDir;
  }

  close(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.watcher.close();
    this.callbacks.clear();
  }

  private readAndParse(): TodoState {
    const raw = readFileSync(this.todoFilePath, "utf-8");
    const items = parseTodoMarkdown(raw);
    return {
      items,
      rawMarkdown: raw,
      lastModified: Date.now(),
    };
  }

  private notifyAll(): void {
    for (const cb of this.callbacks) {
      cb(this.state);
    }
  }
}
