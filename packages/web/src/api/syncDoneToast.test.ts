import { describe, expect, test } from "bun:test";
import { syncDoneSummary } from "./syncDoneToast";

describe("the line a finished sync leaves", () => {
  test("sums new mail and codes over every account's run", () => {
    expect(
      syncDoneSummary([
        { fetched: 10, promosFound: 2 },
        { fetched: 4, promosFound: 1 },
      ]),
    ).toEqual({ message: "Sync done · 14 new, 3 codes to review", codes: 3 });
  });

  test("says one code in the singular", () => {
    expect(syncDoneSummary([{ fetched: 1, promosFound: 1 }]).message).toBe(
      "Sync done · 1 new, 1 code to review",
    );
  });

  test("leaves the codes off when there are none", () => {
    expect(syncDoneSummary([{ fetched: 14, promosFound: 0 }])).toEqual({
      message: "Sync done · 14 new",
      codes: 0,
    });
  });
});
