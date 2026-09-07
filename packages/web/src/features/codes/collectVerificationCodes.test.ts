import { describe, it, expect } from "bun:test";
import { collectVerificationCodes } from "./collectVerificationCodes";
import type { ListedMessage } from "../../api/types";

const NOW = new Date("2026-08-11T12:00:00.000Z").getTime();

const message = (over: Partial<ListedMessage> = {}): ListedMessage => ({
  accountId: "acc1",
  accountEmail: "me@example.com",
  gmailMessageId: "m1",
  gmailThreadId: "t1",
  fromEmail: "noreply@github.com",
  fromName: "GitHub",
  toEmails: ["me@example.com"],
  subject: "Your verification code is 482913",
  snippet: null,
  internalDate: new Date(NOW - 60_000).toISOString(),
  isArchived: false,
  isTrashed: false,
  priority: "high",
  triageId: null,
  labels: [],
  attachments: [],
  pendingSuggestions: { existing: [], new: [] },
  ...over,
});

describe("collectVerificationCodes", () => {
  it("returns a pill for a message carrying a code", () => {
    const entries = collectVerificationCodes([message()], NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0].code.value).toBe("482913");
    expect(entries[0].sender).toBe("GitHub");
  });

  it("falls back to the address when there is no sender name", () => {
    const entries = collectVerificationCodes([message({ fromName: null })], NOW);
    expect(entries[0].sender).toBe("noreply@github.com");
  });

  it("skips messages without a code", () => {
    expect(
      collectVerificationCodes([message({ subject: "Deployment failed in packages/web" })], NOW),
    ).toHaveLength(0);
  });

  it("skips trashed and archived messages", () => {
    expect(
      collectVerificationCodes(
        [
          message({ gmailMessageId: "m1", isTrashed: true }),
          message({ gmailMessageId: "m2", isArchived: true }),
        ],
        NOW,
      ),
    ).toHaveLength(0);
  });

  it("skips codes older than a day", () => {
    const stale = message({
      internalDate: new Date(NOW - 36 * 60 * 60 * 1000).toISOString(),
    });
    expect(collectVerificationCodes([stale], NOW)).toHaveLength(0);
  });

  it("sorts newest first", () => {
    const older = message({
      gmailMessageId: "old",
      subject: "Your verification code is 111213",
      internalDate: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    });
    const entries = collectVerificationCodes([older, message()], NOW);
    expect(entries.map((e) => e.gmailMessageId)).toEqual(["m1", "old"]);
  });

  it("caps the number of pills", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      message({
        gmailMessageId: `m${i}`,
        subject: `Your verification code is 48291${i}`,
      }),
    );
    expect(collectVerificationCodes(many, NOW).length).toBeLessThanOrEqual(6);
  });

  it("takes only the first code per message", () => {
    const entries = collectVerificationCodes(
      [message({ subject: "Code: 482913 and backup code: 771204" })],
      NOW,
    );
    expect(entries).toHaveLength(1);
  });
});
