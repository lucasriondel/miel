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
