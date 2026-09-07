import { describe, expect, test } from "bun:test";
import { recipientLine } from "./recipientLine";

// #88 collapses To/Date/Account behind a disclosure. The one thing that must not
// disappear with them is the fact that a message went to more than one person —
// otherwise a reply-all lands as a surprise. This is the line that says so.

describe("recipientLine", () => {
  test("says nothing when the message has one recipient", () => {
    expect(recipientLine(["me@example.com"], "me@example.com")).toBeNull();
    expect(recipientLine(["kelly@corp.example"], "me@example.com")).toBeNull();
  });

  test("says nothing when the message has no recipients at all", () => {
    expect(recipientLine([], "me@example.com")).toBeNull();
  });

  test("names the reader as `me` when the account is among the recipients", () => {
    expect(
      recipientLine(
        ["me@example.com", "kelly@corp.example", "ryan@corp.example"],
        "me@example.com",
      ),
    ).toBe("to me + 2 others");
  });

  test("finds the account wherever it sits in the list", () => {
    expect(recipientLine(["kelly@corp.example", "me@example.com"], "me@example.com")).toBe(
      "to me + 1 other",
    );
  });

  test("falls back to the first recipient when the account is not addressed", () => {
    expect(recipientLine(["kelly@corp.example", "ryan@corp.example"], "me@example.com")).toBe(
      "to kelly@corp.example + 1 other",
    );
  });

  test("singularizes a lone other", () => {
    expect(recipientLine(["me@example.com", "kelly@corp.example"], "me@example.com")).toBe(
      "to me + 1 other",
    );
  });

  // Addresses reach us bare from `parseAddressList`, but the decoded sync path
  // passes `to` through untouched, so a display form can slip in.
  test("matches the account through casing, padding and a display name", () => {
    expect(
      recipientLine([" Kelly <kelly@corp.example> ", "Me <ME@Example.com>"], "me@example.com"),
    ).toBe("to me + 1 other");
  });

  test("shows only the address of a first recipient carrying a display name", () => {
    expect(
      recipientLine(["Kelly Kapoor <kelly@corp.example>", "ryan@corp.example"], "me@example.com"),
    ).toBe("to kelly@corp.example + 1 other");
  });
});
