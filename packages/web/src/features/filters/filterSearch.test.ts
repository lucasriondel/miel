import { describe, expect, test } from "bun:test";
import type { GmailFilter, Label } from "../../api/types";
import { searchFilters } from "./filterSearch";

const makeFilter = (
  id: string,
  criteria: GmailFilter["criteria"],
  action: GmailFilter["action"] = {},
): GmailFilter => ({
  id,
  accountId: "acc-1",
  gmailFilterId: `gm-${id}`,
  criteria,
  action,
  syncedAt: "2026-08-01T00:00:00Z",
});

const makeLabel = (gmailLabelId: string, name: string): Label => ({
  id: `l-${gmailLabelId}`,
  accountId: "acc-1",
  gmailLabelId,
  name,
  type: "user",
  colorBg: null,
  colorFg: null,
});

const labels = new Map<string, Label>(
  [
    makeLabel("Label_1", "Receipts"),
    makeLabel("Label_2", "Newsletters"),
    makeLabel("Label_3", "CATEGORY_PROMOTIONS"),
  ].map((l) => [l.gmailLabelId, l]),
);

const ids = (filters: GmailFilter[]) => filters.map((f) => f.id);

describe("searchFilters", () => {
  test("returns every filter for an empty or whitespace-only query", () => {
    const all = [makeFilter("a", { from: "stripe.com" }), makeFilter("b", { subject: "Invoice" })];
    expect(ids(searchFilters(all, "", labels))).toEqual(["a", "b"]);
    expect(ids(searchFilters(all, "   ", labels))).toEqual(["a", "b"]);
  });

  test("matches criteria from / to / subject / query on a case-insensitive substring", () => {
    const all = [
      makeFilter("from", { from: "billing@Stripe.com" }),
      makeFilter("to", { to: "Team+Ops@example.com" }),
      makeFilter("subject", { subject: "Weekly Digest" }),
      makeFilter("query", { query: "has:attachment larger:5M" }),
      makeFilter("other", { from: "nothing@example.org" }),
    ];
    expect(ids(searchFilters(all, "stripe", labels))).toEqual(["from"]);
    expect(ids(searchFilters(all, "OPS@", labels))).toEqual(["to"]);
    expect(ids(searchFilters(all, "digest", labels))).toEqual(["subject"]);
    expect(ids(searchFilters(all, "larger:5m", labels))).toEqual(["query"]);
  });

  test("matches the resolved label name of the add-label action, not the raw id", () => {
    const all = [
      makeFilter("receipts", { from: "billing@x.com" }, { addLabelIds: ["Label_1"] }),
      makeFilter("news", { from: "hello@y.com" }, { addLabelIds: ["Label_2"] }),
    ];
    expect(ids(searchFilters(all, "receipt", labels))).toEqual(["receipts"]);
    // The raw Gmail id is an implementation detail — it must not match.
    expect(ids(searchFilters(all, "Label_1", labels))).toEqual([]);
  });

  test("matches the friendly name of a system category label", () => {
    const all = [
      makeFilter("promo", { from: "deals@x.com" }, { addLabelIds: ["Label_3"] }),
      makeFilter("inbox", { from: "boss@x.com" }, { addLabelIds: ["INBOX"] }),
    ];
    expect(ids(searchFilters(all, "promotions", labels))).toEqual(["promo"]);
    expect(ids(searchFilters(all, "inbox", labels))).toEqual(["inbox"]);
  });

  test("falls back to the raw id for a label the account has not synced", () => {
    const all = [makeFilter("unknown", {}, { addLabelIds: ["Label_99"] })];
    expect(ids(searchFilters(all, "label_99", labels))).toEqual(["unknown"]);
  });

  test("ignores fields outside the searchable set", () => {
    const all = [
      makeFilter("negated", { negatedQuery: "unsubscribe" }),
      makeFilter("forward", {}, { forward: "archive@example.com" }),
      makeFilter("removed", {}, { removeLabelIds: ["INBOX"] }),
    ];
    expect(ids(searchFilters(all, "unsubscribe", labels))).toEqual([]);
    expect(ids(searchFilters(all, "archive@", labels))).toEqual([]);
    expect(ids(searchFilters(all, "inbox", labels))).toEqual([]);
  });

  test("keeps the original order and returns several matches at once", () => {
    const all = [
      makeFilter("a", { from: "news@stripe.com" }),
      makeFilter("b", { subject: "unrelated" }),
      makeFilter("c", { query: "from:stripe.com" }),
    ];
    expect(ids(searchFilters(all, "stripe", labels))).toEqual(["a", "c"]);
  });

  test("trims the query before matching", () => {
    const all = [makeFilter("a", { subject: "Invoice" })];
    expect(ids(searchFilters(all, "  invoice  ", labels))).toEqual(["a"]);
  });

  test("returns nothing when no filter matches", () => {
    const all = [makeFilter("a", { from: "x@y.com" }, { addLabelIds: ["Label_1"] })];
    expect(ids(searchFilters(all, "zzz", labels))).toEqual([]);
  });
});
