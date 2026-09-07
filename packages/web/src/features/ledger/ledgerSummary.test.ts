// The header's count, which is read once on arrival to decide whether the
// ledger is worth working through.
import { describe, expect, test } from "bun:test";
import type { LedgerItem } from "./ledgerItem";
import { ledgerSummary } from "./ledgerSummary";

const item = (kind: LedgerItem["kind"], id: string): LedgerItem =>
  ({ id, kind, issuer: "x", context: null, when: "—", urgency: 0 }) as LedgerItem;

describe("how the ledger counts itself", () => {
  test("the total, then a breakdown by kind", () => {
    expect(
      ledgerSummary([
        item("filter", "f1"),
        item("code", "c1"),
        item("code", "c2"),
        item("promo", "p1"),
      ]),
    ).toBe("4 items · 1 filter · 2 codes · 1 promo");
  });

  // A ledger holding one kind says so in three words rather than naming two
  // zeroes the user would have to read past.
  test("leaves out the kinds it has none of", () => {
    expect(ledgerSummary([item("code", "c1"), item("code", "c2")])).toBe("2 items · 2 codes");
  });

  test("says one item, singular, when there is one", () => {
    expect(ledgerSummary([item("promo", "p1")])).toBe("1 item · 1 promo");
  });

  // The kind column tells a link from a code where the difference matters —
  // what the row's value is. A summary that split them would be naming an
  // implementation detail of the detector.
  test("counts a magic link as a code", () => {
    expect(ledgerSummary([item("code", "c1"), item("link", "l1")])).toBe("2 items · 2 codes");
  });
});
