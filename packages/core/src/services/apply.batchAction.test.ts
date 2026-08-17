import { describe, test, expect } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { gmailLabelDeltasForBatchAction } from "./apply";

describe("gmailLabelDeltasForBatchAction", () => {
  test("read removes UNREAD", () => {
    expect(gmailLabelDeltasForBatchAction("read")).toEqual({
      add: [],
      remove: ["UNREAD"],
    });
  });

  test("unread adds UNREAD (symmetric to read)", () => {
    expect(gmailLabelDeltasForBatchAction("unread")).toEqual({
      add: ["UNREAD"],
      remove: [],
    });
  });

  test("archive removes INBOX only", () => {
    expect(gmailLabelDeltasForBatchAction("archive")).toEqual({
      add: [],
      remove: ["INBOX"],
    });
  });

  test("trash adds TRASH and removes INBOX", () => {
    expect(gmailLabelDeltasForBatchAction("trash")).toEqual({
      add: ["TRASH"],
      remove: ["INBOX"],
    });
  });
});
