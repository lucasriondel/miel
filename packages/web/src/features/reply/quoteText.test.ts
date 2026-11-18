import { describe, expect, test } from "bun:test";
import { quoteFields, unquote } from "./quoteText";

const attribution = "On Thu 30 Oct 2025 at 18:02, Claire Martin <claire@example.com> wrote:";

describe("unquote", () => {
  test("drops the attribution and the markers, keeping the original's lines", () => {
    const text = `${attribution}\n> We're thinking 8pm.\n>\n> Bring Nathalie.`;
    expect(unquote({ attribution, text })).toBe("We're thinking 8pm.\n\nBring Nathalie.");
  });

  test("leaves a quote without its attribution line whole", () => {
    expect(unquote({ attribution, text: "> one\n> two" })).toBe("one\ntwo");
  });
});

describe("quoteFields", () => {
  test("an untouched quote names nothing — the server quotes the stored original", () => {
    expect(quoteFields(null)).toEqual({});
  });

  test("a trimmed quote travels as the text the user kept", () => {
    expect(quoteFields("Bring Nathalie.")).toEqual({ quotedText: "Bring Nathalie." });
  });

  test("an emptied quote is a quote removed", () => {
    expect(quoteFields("  \n")).toEqual({ includeQuote: false });
  });
});
