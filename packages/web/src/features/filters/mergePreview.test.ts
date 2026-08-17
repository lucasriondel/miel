import { describe, expect, test } from "bun:test";
import type { GmailFilter } from "../../api/types";
import { buildMergePreview, describeMergeSources, describeSurvivingSources } from "./mergePreview";

const makeFilter = (
  gmailFilterId: string,
  criteria: GmailFilter["criteria"],
  action: GmailFilter["action"],
): GmailFilter => ({
  id: `row-${gmailFilterId}`,
  accountId: "acc-1",
  gmailFilterId,
  criteria,
  action,
  syncedAt: "2026-08-01T00:00:00Z",
});

describe("buildMergePreview", () => {
  test("shows the OR'd criteria as the one query the merged filter will carry", () => {
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter("f2", { subject: "monthly report" }, { addLabelIds: ["L2"] }),
    ]);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.criteria).toEqual({
      query: "{from:a@x.com OR subject:(monthly report)}",
    });
  });

  test("shows the union of the sources' actions", () => {
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter(
        "f2",
        { from: "b@x.com" },
        { addLabelIds: ["L2"], removeLabelIds: ["INBOX"], forward: "z@x.com" },
      ),
    ]);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.action).toEqual({
      addLabelIds: ["L1", "L2"],
      removeLabelIds: ["INBOX"],
      forward: "z@x.com",
    });
  });

  test("omits empty action lists, matching what the server will send Gmail", () => {
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter("f2", { from: "b@x.com" }, { addLabelIds: ["L1"] }),
    ]);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.action).toEqual({ addLabelIds: ["L1"] });
    expect("removeLabelIds" in preview.action).toBe(false);
    expect("forward" in preview.action).toBe(false);
  });

  test("reports the sources it merged, so the card can name the count", () => {
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter("f2", { from: "b@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter("f3", { from: "c@x.com" }, { addLabelIds: ["L1"] }),
    ]);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.sourceCount).toBe(3);
  });

  test("an unmergeable selection is rejected here, before any request goes out", () => {
    // One filter adds a label another removes: Gmail can't hold both, and the
    // server would refuse it too. Saying so in the preview costs no round trip
    // and leaves the account untouched.
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
      makeFilter("f2", { from: "b@x.com" }, { removeLabelIds: ["L1"] }),
    ]);

    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.message).toMatch(/L1/);
  });

  test("fewer than two filters is not a merge", () => {
    const preview = buildMergePreview([
      makeFilter("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
    ]);

    expect(preview.ok).toBe(false);
    if (preview.ok) return;
    expect(preview.message).toMatch(/at least 2/i);
  });

  test("an unexpected failure still reads as a problem rather than throwing", () => {
    // buildMergePreview runs on every render of the confirm step; a throw there
    // would take the whole filters page down with it.
    const preview = buildMergePreview([
      makeFilter("f1", { size: 500, sizeComparison: "" }, { addLabelIds: ["L1"] }),
      makeFilter("f2", { from: "b@x.com" }, { addLabelIds: ["L1"] }),
    ]);

    expect(preview.ok).toBe(false);
  });
});

describe("describeMergeSources", () => {
  test("names the count in the singular and the plural", () => {
    expect(describeMergeSources(2)).toBe("Merge 2 filters into one");
    expect(describeMergeSources(5)).toBe("Merge 5 filters into one");
  });
});

describe("describeSurvivingSources", () => {
  test("names how many originals outlived the merge, and what that means", () => {
    expect(describeSurvivingSources(1)).toBe(
      "Merged, but Gmail would not delete 1 original filter. It is still active alongside the merged one.",
    );
    expect(describeSurvivingSources(3)).toBe(
      "Merged, but Gmail would not delete 3 original filters. They are still active alongside the merged one.",
    );
  });
});
