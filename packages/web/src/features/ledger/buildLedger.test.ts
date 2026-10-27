// The fold from the sources into one list of rows. Pure, and given `now`, so
// "2 min" and the order the ledger reads in are assertable without a clock.
import { describe, expect, test } from "bun:test";
import type { VerificationEntry } from "../codes/collectVerificationCodes";
import { buildLedger } from "./buildLedger";

const NOW = new Date("2026-09-06T12:00:00.000Z").getTime();

const code = (over: Partial<VerificationEntry> = {}): VerificationEntry => ({
  accountId: "acc-1",
  gmailMessageId: "m1",
  sender: "GitHub",
  code: { type: "code", value: "482913" },
  internalDate: new Date(NOW - 2 * 60_000).toISOString(),
  ...over,
});

const build = (over: Partial<Parameters<typeof buildLedger>[0]> = {}) =>
  buildLedger({ codes: [], ...over }, NOW);

describe("the order the ledger is read in", () => {
  // The oldest code is the one about to stop working.
  test("sorts the codes oldest first", () => {
    const items = build({
      codes: [
        code({ gmailMessageId: "fresh", internalDate: new Date(NOW - 60_000).toISOString() }),
        code({ gmailMessageId: "stale", internalDate: new Date(NOW - 20 * 60_000).toISOString() }),
      ],
    });

    expect(items.map((i) => i.id)).toEqual(["code:acc-1:stale:482913", "code:acc-1:fresh:482913"]);
  });
});

describe("what a row carries", () => {
  // A magic link is its own kind: there is no value worth reading, so the row
  // shows the act instead of a chip.
  test("a link is a kind of its own, not a code", () => {
    const [item] = build({
      codes: [code({ code: { type: "link", value: "https://notion.so/magic?t=abc" } })],
    });

    expect(item.kind).toBe("link");
  });
});

describe("how a code states its age", () => {
  test("in the shortest form that is still true", () => {
    const at = (ms: number) =>
      build({ codes: [code({ internalDate: new Date(NOW - ms).toISOString() })] })[0].when;

    expect(at(30_000)).toBe("now");
    expect(at(2 * 60_000)).toBe("2 min");
    expect(at(3 * 60 * 60_000)).toBe("3 h");
  });
});
