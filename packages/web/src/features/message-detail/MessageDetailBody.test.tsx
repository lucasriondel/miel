import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageDetailBody } from "./MessageDetailBody";
import type { MessageDetail } from "../../api/types";

// Slice 4 of #85: the body block takes the shared surfaces and the pill
// segmented control. This package has no DOM harness, so what is asserted is
// the markup the block decides at first render — the classes DESIGN.md
// legislates (§1 active fill, §2 depth, §3 shape, §4 section label, §5 press)
// plus which of the three body surfaces each kind of message lands on.
// Switching modes, toggling images and the iframe's post-load resizing are
// browser behavior and stay manual acceptance criteria; the resize logic is
// pinned here by a source assertion instead.

const message = (over: Partial<MessageDetail>): MessageDetail => ({
  accountId: "acc-1",
  accountEmail: "me@example.com",
  gmailMessageId: "msg-1",
  gmailThreadId: "thr-1",
  fromEmail: "sender@example.com",
  fromName: "Sender",
  toEmails: ["me@example.com"],
  subject: "Subject",
  snippet: "snippet",
  bodyText: null,
  bodyHtml: null,
  internalDate: "2026-08-11T10:00:00.000Z",
  isArchived: false,
  isTrashed: false,
  rawHeaders: null,
  labels: [],
  attachments: [],
  latestTriageId: null,
  triageHistory: [],
  ...over,
});

const render = (over: Partial<MessageDetail>) =>
  renderToStaticMarkup(<MessageDetailBody message={message(over)} />);

/** Class attributes of every `<button>` in a fragment of markup. */
const buttonClasses = (html: string) =>
  [...html.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map(([, cls]) => cls!);

const withText = { bodyText: "plain body line" };
const withHtml = { bodyHtml: "<p>rich body</p>" };
const withRemoteImages = {
  bodyHtml: '<p>rich body</p><img src="https://cdn.example.com/pixel.png">',
};

describe("which surface each kind of message lands on", () => {
  test("a text-only message renders the <pre> view and no iframe", () => {
    const html = render(withText);
    expect(html).toContain("<pre");
    expect(html).toContain("plain body line");
    expect(html).not.toContain("<iframe");
  });

  test("an HTML-only message renders the iframe and no <pre>", () => {
    const html = render(withHtml);
    expect(html).toContain("<iframe");
    expect(html).toContain("rich body");
    expect(html).not.toContain("<pre");
  });

  test("a message with no body renders the placeholder alone", () => {
    const html = render({});
    expect(html).toContain("No body content available for this message.");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("Message Body");
  });
});

// §2/§3: card radius, depth from a shadow ramp, hairline at reduced alpha.
const surfaceOf = (html: string, tag: "pre" | "iframe" | "div") =>
  html.match(new RegExp(`<${tag}\\b[^>]*class="([^"]*)"`))?.[1] ?? "";

describe("the three body surfaces", () => {
  test("the plain-text view sits on the shared card surface", () => {
    const cls = surfaceOf(render(withText), "pre");
    expect(cls).toContain("rounded-3xl");
    expect(cls).toContain("shadow-gousse-md");
    expect(cls).toMatch(/border border-gousse-line\/\d+/);
  });

  test("the iframe sits on the shared card surface", () => {
    const cls = surfaceOf(render(withHtml), "iframe");
    expect(cls).toContain("rounded-3xl");
    expect(cls).toContain("shadow-gousse-md");
    expect(cls).toMatch(/border border-gousse-line\/\d+/);
  });

  test("the placeholder keeps its dashed edge on the shared surface", () => {
    const cls = surfaceOf(render({}), "div");
    expect(cls).toContain("rounded-3xl");
    expect(cls).toContain("border-dashed");
    expect(cls).toContain("shadow-gousse-sm");
  });

  test("no surface keeps the old rounded-xl or a gradient wash", () => {
    for (const html of [render(withText), render(withHtml), render({})]) {
      expect(html).not.toContain("rounded-xl");
      expect(html).not.toContain("bg-gradient");
    }
  });
});

describe("the block heading", () => {
  test("is a muted section label, never accent (§4)", () => {
    const html = render(withText);
    expect(html).toMatch(/<h2[^>]*class="[^"]*text-gousse-muted[^"]*"[^>]*>\s*Message Body/);
    expect(html).toContain("uppercase");
    expect(html).not.toContain("text-gousse-accent");
  });
});

describe("the HTML/Text switch", () => {
  const both = { ...withText, ...withHtml };

  test("only appears when the message carries both bodies", () => {
    expect(render(both)).toContain('role="radiogroup"');
    expect(render(withText)).not.toContain('role="radiogroup"');
    expect(render(withHtml)).not.toContain('role="radiogroup"');
  });

  test("is the pill segmented control with an accent/15 active fill (§1, §3)", () => {
    const html = render(both);
    expect(html).toContain("bg-gousse-accent/15");
    // Never the square track with a hard accent fill this block used to carry.
    expect(html).not.toContain("bg-gousse-accent text-white");
    for (const cls of buttonClasses(html).filter((c) => c.includes("px-3.5"))) {
      expect(cls).toContain("rounded-full");
    }
  });

  test("exposes the selected segment to assistive tech", () => {
    const html = render(both);
    expect(html).toContain('aria-label="Body format"');
    const checked = [...html.matchAll(/<button[^>]*aria-checked="true"[^>]*>([^<]*)/g)];
    // HTML wins the default when a message has both bodies.
    expect(checked.map(([, label]) => label)).toEqual(["HTML"]);
  });
});

describe("the remote-images toggle", () => {
  test("appears only for HTML bodies that reference remote images", () => {
    expect(render(withRemoteImages)).toContain("Show remote images");
    expect(render(withHtml)).not.toContain("Show remote images");
    expect(render(withText)).not.toContain("Show remote images");
  });

  test("is a pill exposing its off state to assistive tech (§3)", () => {
    const html = render(withRemoteImages);
    const [toggle] = buttonClasses(html).filter((c) => c.includes("rounded-full"));
    expect(toggle).toBeDefined();
    expect(html).toContain('aria-pressed="false"');
  });

  test("leaves remote images blocked until it is switched on", () => {
    const html = render(withRemoteImages);
    expect(html).toContain("data-blocked-src");
    expect(html).not.toMatch(/[^-]src=(?:"|&quot;)https:\/\/cdn\.example\.com/);
  });
});

describe("interaction (§5)", () => {
  test("presses every control with active:scale-[0.96] and a named transition", () => {
    const classes = buttonClasses(render({ ...withText, ...withRemoteImages }));
    // Two segments plus the images toggle.
    expect(classes.length).toBe(3);
    for (const cls of classes) {
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
      expect(cls).toMatch(/transition-\[/);
    }
  });
});

describe("the iframe's auto-sizing", () => {
  // The issue's one hard boundary: this slice restyles the frame and leaves the
  // measuring alone. A change to any of these silently clips long messages.
  test("keeps the resize observation, image listeners and rounding compensation", async () => {
    const source = await Bun.file(new URL("./HtmlBodyFrame.tsx", import.meta.url)).text();
    expect(source).toContain("new ResizeObserver(measure)");
    expect(source).toContain("observer.observe(doc.body)");
    expect(source).toContain('img.addEventListener("load", measure, { once: true })');
    expect(source).toContain('img.addEventListener("error", measure, { once: true })');
    expect(source).toContain("doc.body.scrollHeight + 2");
  });

  test("renders the frame sandboxed to same-origin only", () => {
    expect(render(withHtml)).toContain('sandbox="allow-same-origin"');
  });
});
