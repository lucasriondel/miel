// The rules the worp header editor runs on (#119), tested where they live:
// this package has no DOM harness, so the draft is a pure module and the hook
// around it is a `useState` and nothing else.
//
// Three failures are what this exists to prevent, and each has a section
// below: a draft that keeps describing headers the server no longer has, a
// removal that demands the other headers' secrets back before it will save,
// and a name that is only judged once it has been round-tripped to a 400.
import { describe, expect, test } from "bun:test";
import {
  emptyRow,
  reviewDraft,
  rowsFromStored,
  seedDraft,
  syncedDraft,
  withCloudflareAccess,
} from "./worpHeaderDraft";
import type { HeaderDraftRow } from "./worpHeaderDraft";
import type { MaskedHeader } from "../../api/types";

const stored = (...names: string[]): MaskedHeader[] =>
  names.map((name) => ({ name, valueHint: `${name.slice(0, 3)}…xyz` }));

/** A row as the user leaves it: a name typed, a value typed, or both. */
const typed = (name: string, value: string): HeaderDraftRow => ({
  ...emptyRow(name),
  value,
});

describe("rowsFromStored", () => {
  test("gives every stored header a row that remembers the name it arrived under", () => {
    const rows = rowsFromStored(stored("X-A", "X-B"));

    expect(rows.map((r) => r.name)).toEqual(["X-A", "X-B"]);
    expect(rows.map((r) => r.storedName)).toEqual(["X-A", "X-B"]);
    // The server sends a mask, never the value, so there is nothing to prefill.
    expect(rows.map((r) => r.value)).toEqual(["", ""]);
  });

  test("gives each row a distinct id, so React keys and per-row messages line up", () => {
    const rows = rowsFromStored(stored("X-A", "X-B"));
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe("syncedDraft — the editor follows the server", () => {
  test("reseeds when a refetch changes which headers are stored", () => {
    const state = seedDraft(stored("X-A"));

    const synced = syncedDraft(state, stored("X-A", "X-B"));

    expect(synced.rows.map((r) => r.name)).toEqual(["X-A", "X-B"]);
  });

  test("reseeds when a stored value changed under us, hint and all", () => {
    const state = seedDraft(stored("X-A"));
    const rotated: MaskedHeader[] = [{ name: "X-A", valueHint: "new…999" }];

    expect(syncedDraft(state, rotated).rows[0].valueHint).toBe("new…999");
  });

  // The other half of the same rule: a poll that reports the same headers must
  // not throw away what the user is halfway through typing.
  test("keeps the draft as it is when the server reports the same headers", () => {
    const state = seedDraft(stored("X-A"));
    const editing = { ...state, rows: [...state.rows, typed("X-New", "secret")] };

    expect(syncedDraft(editing, stored("X-A"))).toBe(editing);
  });
});

describe("reviewDraft — what gets sent", () => {
  test("an untouched draft has nothing to save and says so", () => {
    const state = seedDraft(stored("X-A"));

    const review = reviewDraft(state.rows, stored("X-A"));

    expect(review.patch).toBeNull();
    expect(review.hint?.text).toMatch(/no changes/i);
  });

  // The bug this issue is named for: removing one stored header used to
  // require retyping every other stored header's secret before Save would
  // light up — while the hint on screen recommended removal as the way out.
  test("removing one of several stored headers saves without the others' values", () => {
    const state = seedDraft(stored("X-A", "X-B", "X-C"));
    const rows = state.rows.filter((r) => r.name !== "X-B");

    const review = reviewDraft(rows, stored("X-A", "X-B", "X-C"));

    expect(review.hint).toBeNull();
    expect(review.patch).toEqual({ "X-B": null });
  });

  test("a header left untouched is not named in the patch at all", () => {
    const state = seedDraft(stored("X-A", "X-B"));
    const rows = state.rows.map((r) => (r.name === "X-A" ? { ...r, value: "fresh" } : r));

    expect(reviewDraft(rows, stored("X-A", "X-B")).patch).toEqual({ "X-A": "fresh" });
  });

  test("a header the editor never saw is not in the patch either", () => {
    // Someone else's save added X-Z between this page's load and this save.
    const review = reviewDraft([typed("X-New", "secret")], stored());

    expect(review.patch).toEqual({ "X-New": "secret" });
  });

  test("removing every row clears the map by naming each stored header", () => {
    const review = reviewDraft([], stored("X-A", "X-B"));

    expect(review.patch).toEqual({ "X-A": null, "X-B": null });
  });

  test("renaming a stored header removes the old name and needs the value retyped", () => {
    const state = seedDraft(stored("X-A"));
    const renamed = state.rows.map((r) => ({ ...r, name: "X-B" }));

    // Without a value there is nothing to store the new name with.
    expect(reviewDraft(renamed, stored("X-A")).patch).toBeNull();
    const withValue = renamed.map((r) => ({ ...r, value: "secret" }));
    expect(reviewDraft(withValue, stored("X-A")).patch).toEqual({ "X-A": null, "X-B": "secret" });
  });

  test("trims what is typed — a pasted token's trailing newline is not the token", () => {
    expect(reviewDraft([typed("  X-A  ", " secret\n")], stored()).patch).toEqual({
      "X-A": "secret",
    });
  });

  test("ignores a row that is entirely blank — an Add header not yet filled in", () => {
    const state = seedDraft(stored("X-A"));
    const rows = [...state.rows, emptyRow()];

    expect(reviewDraft(rows, stored("X-A")).hint?.text).toMatch(/no changes/i);
  });
});

describe("reviewDraft — names are judged here, not by the server", () => {
  test("flags an invalid name in the field and refuses to build a patch", () => {
    const row = typed("Bad Header", "secret");

    const review = reviewDraft([row], stored());

    expect(review.rowProblems[row.id]).toMatch(/valid header name/i);
    expect(review.patch).toBeNull();
  });

  test("flags a header miel sets itself", () => {
    const row = typed("authorization", "Bearer x");

    const review = reviewDraft([row], stored());

    expect(review.rowProblems[row.id]).toMatch(/miel sets/i);
    expect(review.patch).toBeNull();
  });

  // Building the map used to collapse these last-wins, so one of the two rows
  // on screen was silently not what got sent.
  test("flags a duplicate name rather than letting one row swallow the other", () => {
    const first = typed("X-A", "one");
    const second = typed("X-A", "two");

    const review = reviewDraft([first, second], stored());

    expect(review.rowProblems[first.id]).toBeUndefined();
    expect(review.rowProblems[second.id]).toMatch(/already listed/i);
    expect(review.patch).toBeNull();
  });

  // Field names are case-insensitive, so these two are one header.
  test("treats a differently-cased repeat as a duplicate", () => {
    const rows = [typed("X-A", "one"), typed("x-a", "two")];

    expect(reviewDraft(rows, stored()).patch).toBeNull();
  });

  test("a value with no name is reported rather than dropped on save", () => {
    const review = reviewDraft([typed("", "secret")], stored());

    expect(review.hint?.text).toMatch(/name/i);
    expect(review.patch).toBeNull();
  });

  test("a new header with no value is reported — there is nothing to store", () => {
    const review = reviewDraft([typed("X-A", "")], stored());

    expect(review.hint?.text).toMatch(/value/i);
    expect(review.patch).toBeNull();
  });
});

// The contract the Save button is wired to. Stated as one invariant because
// the states that broke it before were exactly the ones nobody enumerated: a
// dead button whose only explanation recommended what the user had just done.
describe("reviewDraft — the hint and the button cannot disagree", () => {
  const storedTwo = stored("X-A", "X-B");
  const seeded = seedDraft(storedTwo).rows;
  const states: [string, HeaderDraftRow[]][] = [
    ["nothing at all", []],
    ["untouched", seeded],
    ["a blank row added", [...seeded, emptyRow()]],
    ["one removed", seeded.slice(1)],
    ["all removed", []],
    ["one retyped", seeded.map((r, i) => (i === 0 ? { ...r, value: "fresh" } : r))],
    ["a new pair", [...seeded, typed("X-New", "secret")]],
    ["a new name, no value", [...seeded, typed("X-New", "")]],
    ["a value, no name", [...seeded, typed("", "secret")]],
    ["an invalid name", [...seeded, typed("Bad Header", "secret")]],
    ["a reserved name", [...seeded, typed("Authorization", "Bearer x")]],
    ["a duplicate", [...seeded, typed("X-A", "again")]],
    ["a renamed row", seeded.map((r, i) => (i === 0 ? { ...r, name: "X-Z" } : r))],
  ];

  for (const [label, rows] of states) {
    test(`says why Save is off, and only then, with ${label}`, () => {
      const review = reviewDraft(rows, label === "nothing at all" ? stored() : storedTwo);

      // Exactly one of the two: a patch to send, or a hint saying why not.
      expect(review.patch === null).toBe(review.hint !== null);
    });
  }

  test("a row-level problem is announced above the button too, not only in the field", () => {
    const review = reviewDraft([typed("Bad Header", "secret")], stored());

    expect(review.hint?.tone).toBe("problem");
    expect(review.hint?.text.length ?? 0).toBeGreaterThan(0);
  });
});

describe("withCloudflareAccess", () => {
  test("adds the pair, ready for two pastes", () => {
    const rows = withCloudflareAccess([]);

    expect(rows.map((r) => r.name)).toEqual(["CF-Access-Client-Id", "CF-Access-Client-Secret"]);
    expect(rows.every((r) => r.value === "")).toBe(true);
  });

  test("adds only what is missing, whatever case it is stored under", () => {
    const rows = withCloudflareAccess(rowsFromStored(stored("cf-access-client-id")));

    expect(rows.map((r) => r.name)).toEqual(["cf-access-client-id", "CF-Access-Client-Secret"]);
  });
});
