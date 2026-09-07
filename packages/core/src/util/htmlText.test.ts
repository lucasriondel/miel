// The stripped visible text of a message (#156): what the promo-extract task
// reads instead of raw HTML. A marketing mail is mostly table scaffolding,
// inlined CSS and tracking markup, none of which the model should be paying to
// read — and a `<style>` block reads as prose to a model that is only ever
// handed a string.
//
// Pure, so it is unit-tested directly rather than through a prompt.
// Run: bun test src/util/htmlText.test.ts
import { describe, expect, test } from "bun:test";
import { htmlToVisibleText } from "./htmlText";

describe("htmlToVisibleText", () => {
  test("keeps the words and drops the markup around them", () => {
    expect(htmlToVisibleText("<p>Take <b>20%</b> off</p>")).toBe("Take 20% off");
  });

  test("drops what style and script blocks contain, not just their tags", () => {
    const html = `<style>.promo{color:red}</style><script>track("open")</script><p>SAVE20</p>`;

    expect(htmlToVisibleText(html)).toBe("SAVE20");
  });

  test("decodes the entities a code or a price arrives wrapped in", () => {
    expect(htmlToVisibleText("<p>&pound;10 off &amp; free shipping</p>")).toBe(
      "£10 off & free shipping",
    );
    expect(htmlToVisibleText("<p>Ends&nbsp;Sunday</p>")).toBe("Ends Sunday");
    expect(htmlToVisibleText("<p>&#82;&#x41;IN20</p>")).toBe("RAIN20");
  });

  test("decodes each entity once, so an escaped entity stays escaped text", () => {
    expect(htmlToVisibleText("<p>&amp;nbsp;</p>")).toBe("&nbsp;");
  });

  test("collapses every run of whitespace to one space and trims", () => {
    expect(htmlToVisibleText("  <p>Take\n\n\t20%   off</p>  ")).toBe("Take 20% off");
  });

  test("separates the text of adjacent elements rather than gluing it", () => {
    expect(htmlToVisibleText("<td>SAVE20</td><td>ends Sunday</td>")).toBe("SAVE20 ends Sunday");
  });

  test("drops comments, doctypes and the attributes that carry tracking urls", () => {
    const html = `<!doctype html><!-- utm_source=newsletter --><a href="https://t.example.com/x?utm=1">Shop now</a>`;

    expect(htmlToVisibleText(html)).toBe("Shop now");
  });

  test("passes a plain-text body through, since a mail may have no html part", () => {
    expect(htmlToVisibleText("Use code SAVE20\nbefore Sunday")).toBe(
      "Use code SAVE20 before Sunday",
    );
  });

  test("answers with an empty string for a body that is all markup", () => {
    expect(htmlToVisibleText("<style>.a{color:red}</style>")).toBe("");
  });
});
