import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmationCodePanel } from "./ConfirmationCodePanel";
import type { ConfirmationDetection } from "../../utils/detectConfirmation";

// The confirmation panel is the block #86 converts, because it needed no
// restructuring to take the three shapes. Detection and delete behavior are out
// of scope here — this asserts the surface, since a server render reaches every
// class the panel decides.

const detection: ConfirmationDetection = {
  found: true,
  description: "Verification code from GitHub",
  codes: [
    { type: "code", value: "492013", label: "Verification code" },
    { type: "link", value: "https://example.com/confirm?t=abc", label: "Magic link" },
  ],
};

const render = (props?: { onDelete?: () => void; isDeleting?: boolean }) =>
  renderToStaticMarkup(
    <ConfirmationCodePanel
      detection={detection}
      onDelete={props?.onDelete}
      isDeleting={props?.isDeleting}
    />,
  );

/** The `<button>` element that carries the delete action, idle or in flight. */
const deleteButton = (html: string) =>
  html.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*(?:Delete message|Deleting)[\s\S]*?<\/button>/,
  )?.[0] ?? "";

/** Class attributes of every `<button>` in a fragment of markup. */
const buttonClasses = (html: string) =>
  [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

describe("the panel's surface", () => {
  test("is the shared rounded-3xl card, not the old rounded-xl one", () => {
    const html = render();
    expect(html).toContain("rounded-3xl");
    expect(html).not.toContain("rounded-xl");
  });

  test("drops the accent gradient wash — §1 tints by lowering alpha on a flat fill", () => {
    expect(render()).not.toContain("bg-gradient");
  });

  test("heads with a gousse-low check glyph and a muted section label (§4)", () => {
    const html = render();
    expect(html).toContain("text-gousse-low");
    expect(html).toMatch(/<h2[^>]*class="[^"]*text-gousse-muted[^"]*"[^>]*>\s*Verification Items/);
    expect(html).not.toMatch(/<h2[^>]*text-gousse-accent/);
  });

  test("still renders the detection's description and every code", () => {
    const html = render();
    expect(html).toContain("Verification code from GitHub");
    expect(html).toContain("492013");
    expect(html).toContain("https://example.com/confirm?t=abc");
    expect(html).toContain("Magic link");
  });

  test("renders nothing when there is nothing to confirm", () => {
    expect(
      renderToStaticMarkup(<ConfirmationCodePanel detection={{ found: false, codes: [] }} />),
    ).toBe("");
  });
});

describe("its controls", () => {
  test("gives both icon buttons a round 40px hit area (§5)", () => {
    const iconButtons = buttonClasses(render()).filter((c) => c.includes("h-10"));
    // One copy button per code, plus the open-link button on the link.
    expect(iconButtons.length).toBe(3);
    for (const cls of iconButtons) {
      expect(cls).toContain("w-10");
      expect(cls).toContain("rounded-full");
    }
  });

  test("shapes the delete control as a pill keeping its gousse-high hover (§3)", () => {
    const html = render({ onDelete: () => {} });
    const [deleteClasses] = buttonClasses(html).filter((c) => c.includes("gousse-high"));
    expect(deleteClasses).toBeDefined();
    expect(deleteClasses).toContain("rounded-full");
    expect(deleteClasses).toContain("hover:bg-gousse-high/10");
    expect(deleteClasses).toContain("hover:text-gousse-high");
    expect(html).toContain("Delete message");
  });

  test("omits the delete footer when the page passes no handler", () => {
    expect(render()).not.toContain("Delete message");
  });

  test("presses every control with active:scale-[0.96] and a named transition (§5)", () => {
    const classes = buttonClasses(render({ onDelete: () => {} }));
    expect(classes.length).toBe(4);
    for (const cls of classes) {
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
      expect(cls).toMatch(/transition-\[/);
    }
  });

  // #92: the delete is a real request now, so the panel has to say so. The page
  // owns the pending flag (it owns the mutation); the panel only reflects it.
  test("leaves the delete control live when no delete is in flight", () => {
    const html = render({ onDelete: () => {} });
    // `disabled:opacity-50` lives in the class list either way — the attribute
    // is the thing being asserted.
    expect(deleteButton(html)).not.toContain('disabled=""');
    expect(html).not.toContain('role="status"');
  });

  test("disables the delete control and spins it while the request is in flight", () => {
    const html = render({ onDelete: () => {}, isDeleting: true });
    const button = deleteButton(html);
    expect(button).toContain('disabled=""');
    expect(button).toContain('role="status"');
    expect(button).toContain("Deleting…");
  });

  // §1: chrome color always comes from a token so it tracks the theme.
  test("hard-codes no color for chrome", () => {
    expect(render({ onDelete: () => {} })).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
