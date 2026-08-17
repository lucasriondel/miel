import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import { DEFAULT_PROVIDER } from "@miel/core/providerModels";
import { allGuideText } from "./guide";
import {
  CLAUDE_DISCLOSURE,
  CONTACT_EMAIL,
  GITHUB_URL,
  HOME,
  PERMISSIONS,
  SITE_NAME,
  allHomeText,
} from "./site";

describe("landing page content", () => {
  test("names the product", () => {
    expect(SITE_NAME).toBe("Miel");
    expect(HOME.tagline.length).toBeGreaterThan(0);
  });

  test("points at the repository's eventual public URL", () => {
    expect(GITHUB_URL).toBe("https://github.com/lucasriondel/miel");
  });

  test("exposes the contact address", () => {
    expect(CONTACT_EMAIL).toBe("lucasriondelpro@gmail.com");
  });

  test("states what Miel is", () => {
    expect(allHomeText()).toMatch(/Gmail/i);
    expect(allHomeText()).toMatch(/triage/i);
  });

  test("states that Miel is self-hosted and open source", () => {
    const text = allHomeText();
    expect(text).toMatch(/self-hosted/i);
    expect(text).toMatch(/open source/i);
  });

  test("states there is no signup and no hosted product", () => {
    const text = allHomeText();
    expect(text).toMatch(/no signup/i);
  });

  test("states that the self-hoster supplies their own Google Cloud OAuth client", () => {
    expect(allHomeText()).toMatch(/your own Google Cloud OAuth client/i);
  });

  test("every section has a stable unique id, a heading and body copy", () => {
    const ids = HOME.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of HOME.sections) {
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  test("offers a single call to action, pointing at GitHub", () => {
    expect(HOME.callToAction.href).toBe(GITHUB_URL);
    expect(HOME.callToAction.label.length).toBeGreaterThan(0);
  });
});

describe("permission table framing", () => {
  test("gives the table a caption and a name for each column", () => {
    expect(PERMISSIONS.tableCaption.length).toBeGreaterThan(0);
    for (const heading of Object.values(PERMISSIONS.columns)) {
      expect(heading.length).toBeGreaterThan(0);
    }
  });

  test("warns the reader that the consent wording is Google's, delete language included", () => {
    const intro = PERMISSIONS.intro.join("\n");
    expect(intro).toMatch(/consent screen/i);
    expect(intro).toMatch(/delet/i);
  });

  test("answers the delete-mail wording next to the table rather than in a cell", () => {
    const notes = PERMISSIONS.notes.join("\n");
    expect(notes).toMatch(/never permanently deletes/i);
    expect(notes).toMatch(/cannot be narrowed/i);
  });
});

describe("AI provider disclosure", () => {
  const text = CLAUDE_DISCLOSURE.body.join("\n");

  /* The vendor name was deliberately taken out of this section: the page now
     says "the AI provider" instead of naming Anthropic. What must not go with
     it is the disclosure itself — that a third party receives the mail, and
     that the reader is expected to go read that party's terms. Those are what
     this asserts now, in place of the two name checks. */
  test("says a third party receives the mail, and points at its terms", () => {
    expect(text).toMatch(/AI provider/i);
    expect(text).toMatch(/processed by that provider under their terms/i);
    expect(text).toMatch(/read that provider's terms/i);
  });

  test("says message content leaves the machine", () => {
    expect(text).toMatch(/leaves your machine/i);
  });

  test("names the batch size the sync service actually uses", () => {
    expect(text).toContain(String(DEFAULT_TRIAGE_BATCH_SIZE));
    expect(text).toContain(String(MAX_TRIAGE_BATCH_SIZE));
  });

  test("names the truncation length the reply service actually applies", () => {
    expect(text).toContain(REPLY_BODY_TRUNCATION.toLocaleString("en-US"));
  });

  test("is part of the homepage copy, not an orphan constant", () => {
    expect(allHomeText()).toContain(CLAUDE_DISCLOSURE.heading);
    expect(allHomeText()).toContain(PERMISSIONS.heading);
  });

  /* Issue #112. This section stays vendor-neutral (#106) — no single name is
     true of every install — so instead of naming the default it sends the
     reader to the setup guide for it. That is a promise made in one file about
     the copy in another, and until now each half was pinned on its own: the
     guide's own suite checks that it names DEFAULT_PROVIDER, and nothing at all
     checked that the homepage still points there or that the pointer resolves.
     Delete the naming from the guide and the disclosure is left promising
     something no page delivers, which is the state this issue found. */
  describe("the default it defers to the setup guide for", () => {
    test("defers rather than naming the default on a page that must stay neutral", () => {
      expect(text).toMatch(/setup guide names the one .*uses by default/i);
      expect(text).not.toMatch(/\b(Anthropic|Google|OpenAI)\b/);
    });

    test("the guide it points at names that default, so the pointer resolves", () => {
      const guide = allGuideText();
      expect(guide).toContain(DEFAULT_PROVIDER);
      expect(guide).toMatch(
        new RegExp(`${DEFAULT_PROVIDER}[^.]*\\bdefault\\b|\\bdefault[^.]*${DEFAULT_PROVIDER}`, "i"),
      );
    });
  });
});
