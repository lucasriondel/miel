import { describe, expect, test } from "bun:test";
import { buildRangeQuery, parseSince, resolveSyncRange } from "./time";

// Gmail search excludes Trash and Spam by default, but our queries should be
// explicit so a future operator/user mistake (e.g. adding `in:anywhere`) can't
// silently start sucking trashed mail back into triage. The acceptance criteria
// on issue #22 also requires this.
describe("sync queries exclude trash", () => {
  test("parseSince adds -in:trash", () => {
    expect(parseSince("7d")).toContain("-in:trash");
  });

  test("buildRangeQuery adds -in:trash", () => {
    const q = buildRangeQuery({
      from: "2026-01-01",
      to: "2026-01-08",
    });
    expect(q).toContain("-in:trash");
  });

  test("resolveSyncRange(since) carries -in:trash through", () => {
    const r = resolveSyncRange({ since: "3d" });
    expect(r.query).toContain("-in:trash");
  });

  test("resolveSyncRange(range) carries -in:trash through", () => {
    const r = resolveSyncRange({
      range: { from: "2026-01-01", to: "2026-01-08" },
    });
    expect(r.query).toContain("-in:trash");
  });
});

// The window reported back is what the query covered, not what was asked for.
// Reconcile concludes "absent from the results ⇒ removed from Gmail" over it,
// so a day the search never reached must not be inside it (#150).
describe("resolveSyncRange reports the searched window", () => {
  test("range: `to` narrows to the start of the excluded `before:` date", () => {
    const r = resolveSyncRange({
      range: { from: "2026-08-31T22:00:00.000Z", to: "2026-09-02T14:41:00.000Z" },
    });
    // `before:2026/09/02` never searches Sept 2, so the window stops before it.
    expect(r.query).toContain("before:2026/09/02");
    expect(r.to.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });

  test("range: a message from the last, unsearched day is outside the window", () => {
    const r = resolveSyncRange({
      range: { from: "2026-08-31T22:00:00.000Z", to: "2026-09-02T14:41:00.000Z" },
    });
    const sentToday = new Date("2026-09-02T09:00:00.000Z");
    expect(sentToday >= r.from && sentToday < r.to).toBe(false);
  });

  test("range: `from` is untouched — `after:` is inclusive of its own date", () => {
    const r = resolveSyncRange({
      range: { from: "2026-08-31T22:00:00.000Z", to: "2026-09-02T14:41:00.000Z" },
    });
    expect(r.from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  test("since: timestamp-based, so the window still runs to `now`", () => {
    const now = new Date("2026-09-02T14:41:00.000Z");
    const r = resolveSyncRange({ since: "7d", now });
    // `newer_than:` is not a calendar date, so nothing is excluded and there is
    // no unsearched tail to trim.
    expect(r.to.toISOString()).toBe(now.toISOString());
  });
});
