import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { UpdateLogEntry } from "../types.ts";

const LOG_FILENAME = "update-log.json";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function logPath(todoDir: string): string {
  return path.join(todoDir, LOG_FILENAME);
}

function readLog(todoDir: string): UpdateLogEntry[] {
  const p = logPath(todoDir);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as UpdateLogEntry[];
  } catch {
    return [];
  }
}

function writeLog(todoDir: string, entries: UpdateLogEntry[]): void {
  writeFileSync(logPath(todoDir), JSON.stringify(entries, null, 2));
}

export function appendLogEntry(todoDir: string, entry: UpdateLogEntry): void {
  const entries = readLog(todoDir);
  entries.push(entry);
  writeLog(todoDir, pruneOldEntries(entries));
}

export function getLogEntries(todoDir: string, limit = 100, offset = 0): { entries: UpdateLogEntry[]; total: number } {
  const all = pruneOldEntries(readLog(todoDir));
  // Return newest first
  const sorted = all.slice().reverse();
  return {
    entries: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}

export function pruneLog(todoDir: string): number {
  const entries = readLog(todoDir);
  const pruned = pruneOldEntries(entries);
  if (pruned.length !== entries.length) {
    writeLog(todoDir, pruned);
  }
  return entries.length - pruned.length;
}

function pruneOldEntries(entries: UpdateLogEntry[]): UpdateLogEntry[] {
  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  return entries.filter((e) => e.timestamp >= cutoff);
}
