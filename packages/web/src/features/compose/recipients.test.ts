import { describe, expect, test } from "bun:test";
import { formatAddressList, invalidAddresses, parseAddressList } from "./recipients";

// The compose window's To and Cc are one text field each, the way every mail
// client writes them, so the list the API is sent is a parse of what was typed
// (#96). Separators are whatever a user pastes — a comma, a semicolon, a
// newline out of a spreadsheet — and the field is never rewritten under the
// caret, so the parse has to tolerate the half-typed states in between.

describe("parseAddressList", () => {
  test("splits on commas, semicolons and newlines, trimming each address", () => {
    expect(parseAddressList("a@b.c, d@e.f; g@h.i\nj@k.l")).toEqual([
      "a@b.c",
      "d@e.f",
      "g@h.i",
      "j@k.l",
    ]);
  });

  test("drops empty entries, so a trailing separator is not an address", () => {
    expect(parseAddressList("a@b.c, ")).toEqual(["a@b.c"]);
    expect(parseAddressList("   ")).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
  });

  test("keeps a display name attached to its address", () => {
    expect(parseAddressList('"Alice Doe" <alice@example.com>, bob@example.com')).toEqual([
      '"Alice Doe" <alice@example.com>',
      "bob@example.com",
    ]);
  });
});

describe("formatAddressList", () => {
  test("writes the list back as the comma-separated line a user reads", () => {
    expect(formatAddressList(["a@b.c", "d@e.f"])).toBe("a@b.c, d@e.f");
    expect(formatAddressList([])).toBe("");
  });
});

describe("invalidAddresses", () => {
  test("nothing to report on an empty or well-formed field", () => {
    expect(invalidAddresses("")).toEqual([]);
    expect(invalidAddresses("a@b.c, Bob <bob@example.com>")).toEqual([]);
  });

  test("names the entries that are not addresses at all", () => {
    expect(invalidAddresses("a@b.c, nonsense, also bad,")).toEqual(["nonsense", "also bad"]);
  });

  // The field is validated as it is typed, and every address passes through
  // "al" on its way to "alice@example.com" — flagging the entry under the caret
  // would paint the window red for the whole time the user is working in it.
  // Anything with a separator after it is finished, and fair to judge.
  test("never judges the entry still being typed", () => {
    expect(invalidAddresses("ali")).toEqual([]);
    expect(invalidAddresses("alice@")).toEqual([]);
    expect(invalidAddresses("alice@example.com, bo")).toEqual([]);
    expect(invalidAddresses("alice@example.com, bo,")).toEqual(["bo"]);
    expect(invalidAddresses("alice@example.com, bo, ")).toEqual(["bo"]);
  });
});
