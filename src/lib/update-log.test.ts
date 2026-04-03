import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendLogEntry, getLogEntries, pruneLog } from "./update-log.ts";
import type { UpdateLogEntry } from "../types.ts";

function makeEntry(overrides: Partial<UpdateLogEntry> = {}): UpdateLogEntry {
  return {
    timestamp: new Date().toISOString(),
    results: [],
    discoveredCount: 0,
    errors: [],
    source: "manual",
    ...overrides,
  };
}

describe("update-log", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "update-log-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("appendLogEntry", () => {
    it("creates the log file on first write", () => {
      const entry = makeEntry();
      appendLogEntry(tmpDir, entry);
      expect(existsSync(join(tmpDir, "update-log.json"))).toBe(true);
    });

    it("appends entries to an existing log", () => {
      appendLogEntry(tmpDir, makeEntry({ discoveredCount: 1 }));
      appendLogEntry(tmpDir, makeEntry({ discoveredCount: 2 }));
      const { entries, total } = getLogEntries(tmpDir);
      expect(total).toBe(2);
      // entries come back newest-first; both discoveredCounts should be present
      const counts = entries.map((e) => e.discoveredCount).sort();
      expect(counts).toEqual([1, 2]);
    });

    it("prunes old entries when appending", () => {
      // Write an entry that is older than 7 days
      const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const logPath = join(tmpDir, "update-log.json");
      writeFileSync(logPath, JSON.stringify([makeEntry({ timestamp: oldTimestamp })]), "utf-8");

      appendLogEntry(tmpDir, makeEntry());
      const { total } = getLogEntries(tmpDir);
      // Old entry should be pruned; only the new one remains
      expect(total).toBe(1);
    });
  });

  describe("getLogEntries", () => {
    it("returns empty result when log file does not exist", () => {
      const { entries, total } = getLogEntries(tmpDir);
      expect(entries).toEqual([]);
      expect(total).toBe(0);
    });

    it("returns entries newest first", () => {
      const t1 = new Date(Date.now() - 2000).toISOString();
      const t2 = new Date(Date.now() - 1000).toISOString();
      const t3 = new Date().toISOString();
      appendLogEntry(tmpDir, makeEntry({ timestamp: t1, discoveredCount: 1 }));
      appendLogEntry(tmpDir, makeEntry({ timestamp: t2, discoveredCount: 2 }));
      appendLogEntry(tmpDir, makeEntry({ timestamp: t3, discoveredCount: 3 }));

      const { entries } = getLogEntries(tmpDir);
      expect(entries[0]!.discoveredCount).toBe(3);
      expect(entries[1]!.discoveredCount).toBe(2);
      expect(entries[2]!.discoveredCount).toBe(1);
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        appendLogEntry(tmpDir, makeEntry({ discoveredCount: i }));
      }
      const { entries, total } = getLogEntries(tmpDir, 2);
      expect(entries).toHaveLength(2);
      expect(total).toBe(5);
    });

    it("respects offset parameter", () => {
      for (let i = 0; i < 5; i++) {
        appendLogEntry(tmpDir, makeEntry({ discoveredCount: i }));
      }
      const { entries } = getLogEntries(tmpDir, 100, 3);
      expect(entries).toHaveLength(2);
    });

    it("returns empty array from corrupt JSON file", () => {
      writeFileSync(join(tmpDir, "update-log.json"), "not valid json", "utf-8");
      const { entries, total } = getLogEntries(tmpDir);
      expect(entries).toEqual([]);
      expect(total).toBe(0);
    });

    it("excludes entries older than 7 days", () => {
      const oldTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const logPath = join(tmpDir, "update-log.json");
      writeFileSync(
        logPath,
        JSON.stringify([
          makeEntry({ timestamp: oldTimestamp, discoveredCount: 99 }),
          makeEntry({ discoveredCount: 1 }),
        ]),
        "utf-8",
      );
      const { entries, total } = getLogEntries(tmpDir);
      expect(total).toBe(1);
      expect(entries[0]!.discoveredCount).toBe(1);
    });
  });

  describe("pruneLog", () => {
    it("returns 0 when no entries are pruned", () => {
      appendLogEntry(tmpDir, makeEntry());
      const pruned = pruneLog(tmpDir);
      expect(pruned).toBe(0);
    });

    it("returns 0 when log file does not exist", () => {
      const pruned = pruneLog(tmpDir);
      expect(pruned).toBe(0);
    });

    it("removes old entries and returns count", () => {
      const logPath = join(tmpDir, "update-log.json");
      const oldTs = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      writeFileSync(
        logPath,
        JSON.stringify([
          makeEntry({ timestamp: oldTs }),
          makeEntry({ timestamp: oldTs }),
          makeEntry(),
        ]),
        "utf-8",
      );
      const pruned = pruneLog(tmpDir);
      expect(pruned).toBe(2);

      const { total } = getLogEntries(tmpDir);
      expect(total).toBe(1);
    });

    it("does not remove recent entries when pruning", () => {
      appendLogEntry(tmpDir, makeEntry());
      pruneLog(tmpDir);
      // File still exists with same content
      const { total } = getLogEntries(tmpDir);
      expect(total).toBe(1);
    });
  });
});
