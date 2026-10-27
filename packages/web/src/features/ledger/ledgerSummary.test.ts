// The header's count, which is read once on arrival to decide whether the
// ledger is worth working through.
import { describe, expect, test } from "bun:test";
import type { LedgerItem } from "./ledgerItem";
import { ledgerSummary } from "./ledgerSummary";

const item = (kind: LedgerItem["kind"], id: string): LedgerItem =>
  ({ id, kind, issuer: "x", context: null, when: "—", urgency: 0 }) as LedgerItem;

describe("how the ledger counts itself", () => {
  test("the total, then the codes", () => {
    expect(ledgerSummary([item("code", "c1"), item("code", "c2")])).toBe("2 items · 2 codes");
  });

  test("says one item, singular, when there is one", () => {
    expect(ledgerSummary([item("code", "c1")])).toBe("1 item · 1 code");
  });

  // The kind column tells a link from a code where the difference matters —
  // what the row's value is. A summary that split them would be naming an
  // implementation detail of the detector.
  test("counts a magic link as a code", () => {
    expect(ledgerSummary([item("code", "c1"), item("link", "l1")])).toBe("2 items · 2 codes");
  });
});
