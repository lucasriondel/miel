import { describe, expect, test } from "bun:test";
import type { ListedMessage } from "../api/types";
import { categoryOf, groupByCategory, senderRun } from "./categoryGroups";

const label = (name: string) => ({
  id: name,
  gmailLabelId: name,
  name,
  colorBg: null,
  colorFg: null,
});

interface Over {
  id?: string;
  from?: string | null;
  fromEmail?: string;
  labels?: string[];
}

const message = ({
  id = "m-1",
  from = null,
  fromEmail = "x@y.com",
  labels = [],
}: Over = {}): ListedMessage => ({
  accountId: "acc-1",
  accountEmail: "a@b.com",
  gmailMessageId: id,
  gmailThreadId: `t-${id}`,
  fromEmail,
  fromName: from,
  toEmails: [],
  subject: null,
  snippet: null,
  internalDate: "2026-06-29T00:00:00Z",
  isArchived: false,
  isTrashed: false,
  priority: null,
  triageId: null,
  labels: labels.map(label),
  attachments: [],
  pendingSuggestions: { existing: [], new: [] },
});

describe("categoryOf", () => {
  test("reads the message's Gmail category label", () => {
    expect(categoryOf(message({ labels: ["CATEGORY_PROMOTIONS"] }))).toBe("CATEGORY_PROMOTIONS");
  });

  test("falls back to Primary when Gmail tagged no category", () => {
    // An account with the category tabs off tags almost nothing, so treating
    // "untagged" as its own group would split Primary in two.
    expect(categoryOf(message({ labels: ["INBOX", "UNREAD"] }))).toBe("CATEGORY_PERSONAL");
  });

  test("ignores labels that are not categories", () => {
    expect(categoryOf(message({ labels: ["STARRED", "Keep/Orders"] }))).toBe("CATEGORY_PERSONAL");
  });
});

describe("groupByCategory", () => {
  test("orders the groups the way the sidebar lists them", () => {
    const groups = groupByCategory([
      message({ id: "m-1", labels: ["CATEGORY_SOCIAL"] }),
      message({ id: "m-2", labels: ["CATEGORY_PROMOTIONS"] }),
      message({ id: "m-3", labels: ["CATEGORY_PERSONAL"] }),
      message({ id: "m-4", labels: ["CATEGORY_UPDATES"] }),
    ]);

    expect(groups.map((g) => g.category)).toEqual([
      "CATEGORY_PERSONAL",
      "CATEGORY_PROMOTIONS",
      "CATEGORY_UPDATES",
      "CATEGORY_SOCIAL",
    ]);
  });

  test("keeps each group's messages in the order they arrived", () => {
    const groups = groupByCategory([
      message({ id: "m-1", labels: ["CATEGORY_UPDATES"] }),
      message({ id: "m-2", labels: ["CATEGORY_PERSONAL"] }),
      message({ id: "m-3", labels: ["CATEGORY_UPDATES"] }),
    ]);

    const updates = groups.find((g) => g.category === "CATEGORY_UPDATES");
    expect(updates?.messages.map((m) => m.gmailMessageId)).toEqual(["m-1", "m-3"]);
  });

  test("names only the categories that have messages", () => {
    const groups = groupByCategory([message({ labels: ["CATEGORY_FORUMS"] })]);

    expect(groups.map((g) => g.category)).toEqual(["CATEGORY_FORUMS"]);
  });

  test("has nothing to group when there are no messages", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("senderRun", () => {
  test("names each sender once, at their newest message's place", () => {
    const run = senderRun([
      message({ id: "m-1", from: "Simon" }),
      message({ id: "m-2", from: "Charlene" }),
      message({ id: "m-3", from: "Charlene" }),
      message({ id: "m-4", from: "Ada" }),
    ]);

    expect(run).toEqual(["Simon", "Charlene", "Ada"]);
  });

  test("falls back to the address when there is no display name", () => {
    expect(senderRun([message({ from: null, fromEmail: "noreply@sncf.fr" })])).toEqual([
      "noreply@sncf.fr",
    ]);
  });

  test("treats a blank display name as absent", () => {
    expect(senderRun([message({ from: "   ", fromEmail: "a@b.com" })])).toEqual(["a@b.com"]);
  });
});
