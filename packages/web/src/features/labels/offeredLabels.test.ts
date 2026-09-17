import { describe, expect, test } from "bun:test";
import type { Label } from "../../api/types";
import { offeredLabels } from "./offeredLabels";

// What the one picker offers, before either face draws it (#169). The filter
// field is the reason this is a module of its own: an account with eighty labels
// is a scroll box nobody can aim at, and the narrowing has to answer the same
// way whichever of the two triggers opened the panel.

const label = (over: Partial<Label> & { id: string; name: string }): Label => ({
  accountId: "acc-1",
  gmailLabelId: `Label_${over.id}`,
  type: "user",
  colorBg: null,
  colorFg: null,
  ...over,
});

const WORK = label({ id: "l1", name: "Work" });
const INVOICES = label({ id: "l2", name: "Invoices" });
const ACME = label({ id: "l3", name: "Clients/Acme" });
const INBOX = label({ id: "l4", name: "INBOX", type: "system" });

const names = (query: string) =>
  offeredLabels([WORK, INBOX, ACME, INVOICES], query).map((l) => l.name);

describe("offeredLabels", () => {
  test("an empty query is every label of the account, sorted by name", () => {
    expect(names("")).toEqual(["Clients/Acme", "Invoices", "Work"]);
  });

  test("leaves Gmail's own mailboxes out, whatever is typed", () => {
    expect(names("")).not.toContain("INBOX");
    expect(names("inbox")).toEqual([]);
  });

  test("narrows to a case-insensitive substring of the name", () => {
    expect(names("inv")).toEqual(["Invoices"]);
    expect(names("WORK")).toEqual(["Work"]);
  });

  test("matches the whole name, so a nested label answers to its parent", () => {
    expect(names("clients")).toEqual(["Clients/Acme"]);
    expect(names("acme")).toEqual(["Clients/Acme"]);
  });

  test("a query of nothing but whitespace narrows nothing", () => {
    expect(names("   ")).toEqual(["Clients/Acme", "Invoices", "Work"]);
    // …and one typed with a stray space either side still finds its label.
    expect(names("  work ")).toEqual(["Work"]);
  });

  test("a query nothing matches is empty rather than everything", () => {
    expect(names("zzz")).toEqual([]);
  });
});
