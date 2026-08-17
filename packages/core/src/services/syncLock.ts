// Process-wide in-memory guard against overlapping sync runs. Shared by the
// automatic scheduler and the manual WebSocket trigger so that a scheduled tick
// waits for a running manual sync (and vice versa). All callers coexist in the
// same Bun API process, so a module-scoped flag is sufficient — no cross-process
// coordination is needed.

let inFlight = false;

export function isSyncInFlight(): boolean {
  return inFlight;
}

export function tryAcquireSyncLock(): boolean {
  if (inFlight) return false;
  inFlight = true;
  return true;
}

export function releaseSyncLock(): void {
  inFlight = false;
}

// Test-only. Resets the module-scoped flag so a test can start from a clean
// state; production code should always pair tryAcquireSyncLock with
// releaseSyncLock in a try/finally.
export function _resetSyncLockForTests(): void {
  inFlight = false;
}
