import { describe, test, expect } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { gmailLabelDeltasForBatchAction } from "./apply";

// The four flag actions carry nothing, so they are the action alone; the label
// action carries which label, already resolved to the Gmail id the service
// looked up on the account (#147). That is why this takes an object rather than
// a bare string — the payload travels with the action it belongs to, and the
// switch stays exhaustive over the union.

describe("gmailLabelDeltasForBatchAction", () => {
  test("read removes UNREAD", () => {
    expect(gmailLabelDeltasForBatchAction({ action: "read" })).toEqual({
      add: [],
      remove: ["UNREAD"],
    });
  });

  test("unread adds UNREAD (symmetric to read)", () => {
    expect(gmailLabelDeltasForBatchAction({ action: "unread" })).toEqual({
      add: ["UNREAD"],
      remove: [],
    });
  });

  test("archive removes INBOX only", () => {
    expect(gmailLabelDeltasForBatchAction({ action: "archive" })).toEqual({
      add: [],
      remove: ["INBOX"],
    });
  });

  test("trash adds TRASH and removes INBOX", () => {
    expect(gmailLabelDeltasForBatchAction({ action: "trash" })).toEqual({
      add: ["TRASH"],
      remove: ["INBOX"],
    });
  });

  test("label adds the label it names and removes nothing", () => {
    expect(gmailLabelDeltasForBatchAction({ action: "label", gmailLabelId: "Label_7" })).toEqual({
      add: ["Label_7"],
      remove: [],
    });
  });
});
