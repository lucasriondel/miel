import { describe, expect, test } from "bun:test";
import { syncStatusLabel } from "./syncStatusLabel";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("syncStatusLabel", () => {
  test("a mailbox never synced says so", () => {
    expect(syncStatusLabel(null, NOW)).toBe("Not synced yet");
    expect(syncStatusLabel(null, NOW, true)).toBe("never");
  });

  test("says how long ago, in the sidebar's two lengths", () => {
    expect(syncStatusLabel(ago(20_000), NOW)).toBe("Synced just now");
    expect(syncStatusLabel(ago(2 * 60_000), NOW)).toBe("Synced 2 min ago");
    expect(syncStatusLabel(ago(2 * 60_000), NOW, true)).toBe("2m ago");
    expect(syncStatusLabel(ago(3 * 3_600_000), NOW, true)).toBe("3h ago");
    expect(syncStatusLabel(ago(2 * 86_400_000), NOW)).toBe("Synced 2 days ago");
  });
});
