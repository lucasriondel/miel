import { describe, expect, test } from "bun:test";
import type { ListedMessage, Priority } from "../api/types";
import { bucketMessages } from "./inboxBuckets";

const makeMessage = (priority: Priority | null, idx: number): ListedMessage => ({
  accountId: "acc-1",
  accountEmail: "a@b.com",
  gmailMessageId: `m-${idx}`,
  gmailThreadId: `t-${idx}`,
  fromEmail: "from@x.com",
  fromName: null,
  toEmails: [],
  subject: null,
  snippet: null,
  internalDate: "2026-06-29T00:00:00Z",
  isArchived: false,
  isTrashed: false,
  priority,
  triageId: null,
  labels: [],
  attachments: [],
  pendingSuggestions: { existing: [], new: [] },
});

describe("bucketMessages", () => {
  test("groups by priority and collects nulls in untriaged", () => {
    const buckets = bucketMessages([
      makeMessage("high", 1),
      makeMessage("medium", 2),
      makeMessage("low", 3),
      makeMessage(null, 4),
      makeMessage("high", 5),
    ]);
    expect(buckets.high.map((m) => m.gmailMessageId)).toEqual(["m-1", "m-5"]);
    expect(buckets.medium.map((m) => m.gmailMessageId)).toEqual(["m-2"]);
    expect(buckets.low.map((m) => m.gmailMessageId)).toEqual(["m-3"]);
    expect(buckets.untriaged.map((m) => m.gmailMessageId)).toEqual(["m-4"]);
  });

  test("returns empty buckets when input is empty", () => {
    const buckets = bucketMessages([]);
    expect(buckets.high).toEqual([]);
    expect(buckets.medium).toEqual([]);
    expect(buckets.low).toEqual([]);
    expect(buckets.untriaged).toEqual([]);
  });
});
