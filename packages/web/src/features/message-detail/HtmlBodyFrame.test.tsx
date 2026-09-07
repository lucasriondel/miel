import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HtmlBodyFrame } from "./HtmlBodyFrame";

// #148: a left-click on a link in an HTML body did nothing. The wrapped
// document has always asked for `_blank`, but the frame's sandbox granted
// `allow-same-origin` alone, so the browser blocked the auxiliary browsing
// context the base tag asks for and dropped the click — only Cmd/middle-click,
// which the browser handles outside the page, ever opened anything.
//
// The sandbox is the only thing standing between untrusted third-party HTML and
// the app, so what is pinned here is both halves: the one capability that was
// added, and the list that must stay denied. Sandbox enforcement itself is the
// browser's, not happy-dom's — what a render can answer is which flags the
// frame ships with, and that is what these assert.

const LINK_BODY = '<p>rich body</p><a href="https://example.com/x">link</a>';

const renderFrame = (html = LINK_BODY) => {
  render(<HtmlBodyFrame html={html} imagesEnabled={false} />);
  return screen.getByTitle("message-body") as HTMLIFrameElement;
};

const sandboxTokens = (frame: HTMLIFrameElement) =>
  (frame.getAttribute("sandbox") ?? "").split(/\s+/).filter(Boolean);

describe("what the body frame may do", () => {
  test("may open a link in a new browsing context", () => {
    expect(sandboxTokens(renderFrame())).toContain("allow-popups");
  });

  test("and the tab it opens is a normal tab, not a sandboxed one", () => {
    // Without this the popup inherits the frame's own flag set: the site the
    // user chose to visit would load with its scripts, forms and downloads
    // disabled, which is a link that opens but does not work.
    expect(sandboxTokens(renderFrame())).toContain("allow-popups-to-escape-sandbox");
  });

  test("still asks anchors for a new tab rather than navigating itself", () => {
    expect(renderFrame().getAttribute("srcdoc")).toContain('<base target="_blank">');
  });

  test("keeps same-origin, which is what the height measuring reads", () => {
    // Load-bearing for reasons unrelated to links: the parent reaches into
    // `contentDocument` to size the frame, and without it messages get clipped.
    expect(sandboxTokens(renderFrame())).toContain("allow-same-origin");
  });
});

describe("what it still may not do", () => {
  test("runs no script and submits no form", () => {
    const tokens = sandboxTokens(renderFrame("<script>window.x = 1</script><form></form>"));
    expect(tokens).not.toContain("allow-scripts");
    expect(tokens).not.toContain("allow-forms");
  });

  test("cannot navigate the page it is embedded in", () => {
    for (const token of sandboxTokens(renderFrame())) {
      expect(token.startsWith("allow-top-navigation")).toBe(false);
    }
  });

  test("grants nothing beyond the three flags it names", () => {
    // A whitelist rather than a blacklist: a flag added later has to be argued
    // for here, which is the only way this stays a list of denials.
    expect(sandboxTokens(renderFrame()).toSorted()).toEqual([
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-same-origin",
    ]);
  });
});
