import type { LogEntry } from "../../api/types";

export function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remSeconds}s`;
}

export function formatCounts(entry: LogEntry): string {
  if (entry.type === "sync") {
    return `fetched ${entry.messagesFetched} · ${entry.messagesNew} new`;
  }
  const failed = entry.failedBatches > 0 ? ` · ${entry.failedBatches} failed` : "";
  return `triaged ${entry.triaged} / ${entry.candidates}${failed}`;
}

export function statusLabel(status: LogEntry["status"]): string {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  return "Failed";
}

export function statusClass(status: LogEntry["status"]): string {
  if (status === "running") {
    return "bg-gousse-medium-bg text-gousse-medium-text";
  }
  if (status === "completed") {
    return "bg-gousse-tint-green text-gousse-tint-green-ink";
  }
  return "bg-gousse-high-bg text-gousse-high-text";
}

export function triggerLabel(trigger: LogEntry["trigger"]): string {
  return trigger === "automatic" ? "Automatic" : "Manual";
}
