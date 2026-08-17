import { describe, expect, test } from "bun:test";
import { formatCounts, formatDuration, statusLabel, triggerLabel } from "./formatRun";
import type { SyncLogEntry, TriageLogEntry } from "../../api/types";

const syncEntry = (overrides: Partial<SyncLogEntry> = {}): SyncLogEntry => ({
  type: "sync",
  id: "s1",
  accountId: "a1",
  accountEmail: "user@example.com",
  trigger: "manual",
  status: "completed",
  startedAt: "2026-06-29T10:00:00Z",
  finishedAt: "2026-06-29T10:00:03Z",
  error: null,
  messagesFetched: 7,
  messagesNew: 2,
  rangeFrom: "2026-06-28T00:00:00Z",
  rangeTo: "2026-06-29T00:00:00Z",
  ...overrides,
});

const triageEntry = (overrides: Partial<TriageLogEntry> = {}): TriageLogEntry => ({
  type: "triage",
  id: "t1",
  accountId: "a1",
  accountEmail: "user@example.com",
  trigger: "automatic",
  status: "completed",
  startedAt: "2026-06-29T10:00:00Z",
  finishedAt: "2026-06-29T10:00:01Z",
  error: null,
  candidates: 10,
  triaged: 9,
  suggestedNewLabels: 2,
  failedBatches: 1,
  syncWindowId: null,
  ...overrides,
});

describe("formatRun helpers", () => {
  test("formatDuration handles ms and seconds", () => {
    expect(formatDuration("2026-06-29T10:00:00Z", "2026-06-29T10:00:00.500Z")).toBe("500ms");
    expect(formatDuration("2026-06-29T10:00:00Z", "2026-06-29T10:00:03Z")).toBe("3.0s");
    expect(formatDuration("2026-06-29T10:00:00Z", "2026-06-29T10:02:05Z")).toBe("2m 5s");
    expect(formatDuration("2026-06-29T10:00:00Z", null)).toBe("—");
  });

  test("formatCounts renders sync and triage shapes", () => {
    expect(formatCounts(syncEntry())).toBe("fetched 7 · 2 new");
    expect(formatCounts(triageEntry())).toBe("triaged 9 / 10 · 1 failed");
    expect(formatCounts(triageEntry({ failedBatches: 0 }))).toBe("triaged 9 / 10");
  });

  test("statusLabel + triggerLabel are user-facing strings", () => {
    expect(statusLabel("running")).toBe("Running");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel("failed")).toBe("Failed");
    expect(triggerLabel("manual")).toBe("Manual");
    expect(triggerLabel("automatic")).toBe("Automatic");
  });
});
