import { afterEach, describe, expect, test } from "bun:test";
import {
  _resetSyncLockForTests,
  isSyncInFlight,
  releaseSyncLock,
  tryAcquireSyncLock,
} from "./syncLock";

afterEach(() => {
  _resetSyncLockForTests();
});

describe("syncLock", () => {
  test("first tryAcquire succeeds; second is rejected until release", () => {
    expect(isSyncInFlight()).toBe(false);
    expect(tryAcquireSyncLock()).toBe(true);
    expect(isSyncInFlight()).toBe(true);
    expect(tryAcquireSyncLock()).toBe(false);
    releaseSyncLock();
    expect(isSyncInFlight()).toBe(false);
    expect(tryAcquireSyncLock()).toBe(true);
  });

  test("release is idempotent — repeat calls stay released", () => {
    tryAcquireSyncLock();
    releaseSyncLock();
    releaseSyncLock();
    expect(isSyncInFlight()).toBe(false);
    expect(tryAcquireSyncLock()).toBe(true);
  });
});
