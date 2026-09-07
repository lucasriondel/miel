import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplyPills } from "./ReplyPills";

// The reply block at rest: two pills and nothing else (#91), still the way into
// the floating window #96 replaced the inline composer with. What the window
// itself does — open, minimize, generate, send, discard — is exercised as a
// user does it in `replyWindow.test.tsx`; what is left here is the shape
// DESIGN.md legislates for the two controls that open it (§3 radius, §5 press
// and hit area), which no behaviour test asserts.

const markup = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

/** Class attributes of every `<button>` in a fragment of markup. */
const buttonClasses = (html: string) =>
  [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

describe("ReplyPills — the resting state", () => {
  const html = markup(<ReplyPills onReply={() => {}} onDraftWithClaude={() => {}} />);

  test("is a primary Reply and a ghost Draft with AI, and nothing else", () => {
    expect(buttonClasses(html).length).toBe(2);
    expect(html).toContain("Reply");
    expect(html).toContain("Draft with AI");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
  });

  test("opens in place — the pills are buttons, not links (no route change)", () => {
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });

  test("shapes both as pills with a 40px minimum hit height (§3, §5)", () => {
    for (const cls of buttonClasses(html)) {
      expect(cls).toContain("rounded-full");
      expect(cls).toContain("min-h-10");
    }
  });

  test("presses with active:scale-[0.96] and a named transition (§5)", () => {
    for (const cls of buttonClasses(html)) {
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
    }
  });
});
