// The batch request's fifth action is the only one with a payload, so the wire
// shape is a discriminated union rather than an enum plus a hopeful optional
// field (#147): "label" without a label is refused at the edge, and the four
// that carry nothing are parsed exactly as they were.
//
// Schemas only — no db, no environment, so this needs no Postgres.
import { describe, expect, test } from "bun:test";
import { BatchMessageActionRequest } from "./api";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const LABEL = "22222222-2222-4222-8222-222222222222";
const TARGET = { accountId: ACCOUNT, gmailMessageIds: ["m1", "m2"] };

describe("BatchMessageActionRequest", () => {
  test("takes the four flag actions with nothing else", () => {
    for (const action of ["read", "unread", "archive", "trash"] as const) {
      expect(BatchMessageActionRequest.parse({ ...TARGET, action })).toEqual({ ...TARGET, action });
    }
  });

  test("takes a label action with the label it applies", () => {
    expect(BatchMessageActionRequest.parse({ ...TARGET, action: "label", labelId: LABEL })).toEqual(
      {
        ...TARGET,
        action: "label",
        labelId: LABEL,
      },
    );
  });

  test("refuses a label action that names no label", () => {
    expect(BatchMessageActionRequest.safeParse({ ...TARGET, action: "label" }).success).toBe(false);
  });

  test("refuses a label id that is not one of ours", () => {
    expect(
      BatchMessageActionRequest.safeParse({ ...TARGET, action: "label", labelId: "Label_7" })
        .success,
    ).toBe(false);
  });

  test("still refuses an empty selection and an unknown action", () => {
    expect(
      BatchMessageActionRequest.safeParse({ ...TARGET, gmailMessageIds: [], action: "read" })
        .success,
    ).toBe(false);
    expect(BatchMessageActionRequest.safeParse({ ...TARGET, action: "spam" }).success).toBe(false);
  });
});
