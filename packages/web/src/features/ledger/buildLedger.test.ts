// The fold from three sources into one list of rows. Pure, and given `now`, so
// "2 min", which promo is next to expire and the order the ledger reads in are
// all assertable without a clock.
import { describe, expect, test } from "bun:test";
import type { Label, PromoSuggestion, SuggestedFilter } from "../../api/types";
import type { VerificationEntry } from "../codes/collectVerificationCodes";
import { buildLedger } from "./buildLedger";

const NOW = new Date("2026-09-06T12:00:00.000Z").getTime();

const suggestion = (over: Partial<SuggestedFilter> = {}): SuggestedFilter => ({
  id: "f1",
  accountId: "acc-1",
  accountEmail: "me@example.com",
  criteriaFrom: "@northwind-labs.com",
  criteriaSubject: null,
  criteriaQuery: null,
  addLabelId: null,
  addLabelName: "Work",
  reasoning: "12 messages manually labeled Work this month",
  status: "pending",
  createdAt: new Date(NOW).toISOString(),
  ...over,
});

const code = (over: Partial<VerificationEntry> = {}): VerificationEntry => ({
  accountId: "acc-1",
  gmailMessageId: "m1",
  sender: "GitHub",
  code: { type: "code", value: "482913" },
  internalDate: new Date(NOW - 2 * 60_000).toISOString(),
  ...over,
});

const promo = (over: Partial<PromoSuggestion> = {}): PromoSuggestion => ({
  id: "p1",
  accountId: "acc-1",
  gmailMessageId: "m9",
  code: "AUTUMN30",
  discount: "30% off everything",
  terms: "Full-price items only",
  expiresAt: "2026-09-11T23:59:59.999Z",
  merchant: "Uniqlo",
  ...over,
});

const build = (over: Partial<Parameters<typeof buildLedger>[0]> = {}) =>
  buildLedger(
    { suggestions: [], labelsByName: new Map<string, Label>(), codes: [], promos: [], ...over },
    NOW,
  );

describe("the order the ledger is read in", () => {
  test("groups by kind: filters, then codes, then promos", () => {
    const items = build({
      suggestions: [suggestion()],
      codes: [code()],
      promos: [promo()],
    });

    expect(items.map((i) => i.kind)).toEqual(["filter", "code", "promo"]);
  });

  // The trade the fixed order makes on purpose: a promo expiring tomorrow sits
  // below a code from this morning, because the kind column is what the eye
  // scans and a list that reorders between renders is one nobody can point at.
  test("keeps a soon-expiring promo below the codes", () => {
    const items = build({
      codes: [code()],
      promos: [promo({ expiresAt: new Date(NOW + 60_000).toISOString() })],
    });

    expect(items.map((i) => i.kind)).toEqual(["code", "promo"]);
  });

  test("sorts the promos by deadline, soonest first", () => {
    const items = build({
      promos: [
        promo({ id: "late", expiresAt: "2026-12-01T23:59:59.999Z" }),
        promo({ id: "soon", expiresAt: "2026-09-08T23:59:59.999Z" }),
      ],
    });

    expect(items.map((i) => i.id)).toEqual(["promo:soon", "promo:late"]);
  });

  // An unstated expiry is not an urgent one — and is not an expired one either.
  test("puts a promo with no end date last among the promos", () => {
    const items = build({
      promos: [promo({ id: "open", expiresAt: null }), promo({ id: "dated" })],
    });

    expect(items.map((i) => i.id)).toEqual(["promo:dated", "promo:open"]);
  });

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
  test("a filter names the pattern it is about and keeps its reasoning", () => {
    const [item] = build({ suggestions: [suggestion()] });

    expect(item.issuer).toBe("@northwind-labs.com");
    expect(item.context).toBe("12 messages manually labeled Work this month");
  });

  test("a filter with no from falls through to its subject, then its query", () => {
    const [bySubject] = build({
      suggestions: [suggestion({ criteriaFrom: null, criteriaSubject: "Invoice" })],
    });
    const [byQuery] = build({
      suggestions: [
        suggestion({ criteriaFrom: null, criteriaSubject: null, criteriaQuery: "has:attachment" }),
      ],
    });

    expect(bySubject.issuer).toBe("Invoice");
    expect(byQuery.issuer).toBe("has:attachment");
  });

  // A magic link is its own kind: there is no value worth reading, so the row
  // shows the act instead of a chip.
  test("a link is a kind of its own, not a code", () => {
    const [item] = build({
      codes: [code({ code: { type: "link", value: "https://notion.so/magic?t=abc" } })],
    });

    expect(item.kind).toBe("link");
  });

  test("the promo's colour is the merchant, and an unnamed shop is not a header", () => {
    const [named] = build({ promos: [promo()] });
    const [unnamed] = build({ promos: [promo({ merchant: null })] });

    expect(named.issuer).toBe("Uniqlo");
    expect(unnamed.issuer).toBe("—");
  });

  test("the promo's deadline is a bare date, and an unstated one is a dash", () => {
    const [dated] = build({ promos: [promo()] });
    const [open] = build({ promos: [promo({ expiresAt: null })] });

    expect(dated.when).toContain("11");
    expect(open.when).toBe("—");
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

test("the ids are unique across the kinds so nothing collides as a key", () => {
  const items = build({
    suggestions: [suggestion({ id: "same" })],
    codes: [code()],
    promos: [promo({ id: "same" })],
  });

  expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
});
