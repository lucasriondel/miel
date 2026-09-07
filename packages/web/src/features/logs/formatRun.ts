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
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "completed") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
}

export function triggerLabel(trigger: LogEntry["trigger"]): string {
  return trigger === "automatic" ? "Automatic" : "Manual";
}
