import { describe, expect, test } from "bun:test";
import {
  BODY_BEARING_TASKS,
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import { DEFAULT_PROVIDER } from "@miel/core/providerModels";
import { amount } from "./format";
import { allGuideText } from "./guide";
import {
  ABOUT,
  CLAUDE_DISCLOSURE,
  CONTACT_EMAIL,
  FEATURES,
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

describe("the feature list", () => {
  test("every entry has a name and a body, and no name repeats", () => {
    const names = FEATURES.items.map((feature) => feature.name);
    expect(new Set(names).size).toBe(names.length);
    for (const feature of FEATURES.items) {
      expect(feature.name.length).toBeGreaterThan(0);
      expect(feature.body.length).toBeGreaterThan(0);
    }
  });

  test("its id does not collide with a prose or guide section's", () => {
    const taken = [...HOME.sections.map((section) => section.id), PERMISSIONS.id, ABOUT.id];
    expect(taken).not.toContain(FEATURES.id);
  });

  /* The list is the page's only claim about what the app *does*, so each entry
     must name something built. These are the seven the app ships; an entry
     removed here should be an entry removed from the app, and the wording is
     pinned loosely — by the thing named, not the sentence around it — so the
     copy stays editable. */
  test.each([
    ["Gmail's own category grouping", /categor/i],
    ["the week/month/year pager", /week, a month or a year/i],
    ["several accounts", /accounts/i],
    ["priority triage", /high, medium or low/i],
    ["label and filter suggestions", /filters/i],
    ["promo codes", /discount codes/i],
    ["verification codes", /verification codes/i],
    ["drafted replies", /drafts an answer/i],
  ])("names %s", (_what, pattern) => {
    const text = FEATURES.items.flatMap((feature) => [feature.name, feature.body]).join("\n");
    expect(text).toMatch(pattern);
  });

  test("promises nothing is applied to Gmail without the reader", () => {
    const text = FEATURES.items.map((feature) => feature.body).join("\n");
    expect(text).toMatch(/until you apply it/i);
  });

  test("is part of the homepage copy, not an orphan constant", () => {
    const text = allHomeText();
    expect(text).toContain(FEATURES.heading);
    for (const feature of FEATURES.items) {
      expect(text).toContain(feature.name);
      expect(text).toContain(feature.body);
    }
  });
});

describe('the "What is Miel" section', () => {
  test("has an id of its own, distinct from every part it contains", () => {
    expect(ABOUT.id).toMatch(/^[a-z][a-z0-9-]*$/);
    const parts = [FEATURES.id, ...HOME.sections.map((section) => section.id)];
    expect(parts).not.toContain(ABOUT.id);
  });

  test("names the product, since it is the answer to what the product is", () => {
    expect(ABOUT.heading).toContain(SITE_NAME);
  });

  /* The point of the restructure: five sibling headings became one section a
     reader can navigate to, with the rest as its parts. If a part is ever
     promoted back to a top-level section it has to leave this list, and the
     side menu and the prerender contract both read from these. */
  test("holds the feature list and every prose block", () => {
    expect(HOME.sections.length).toBeGreaterThan(0);
    expect(FEATURES.items.length).toBeGreaterThan(0);
  });

  test("is part of the homepage copy, not an orphan constant", () => {
    expect(allHomeText()).toContain(ABOUT.heading);
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

  /* Issue #158. Reply drafting was the only request carrying a whole body until
     promo extraction landed (#156), and this paragraph still said so — a
     privacy claim that had stopped being true. The list is core's now, so the
     copy quotes it: a third body-bearing task fails here until the paragraph
     names it, and the "one request" wording cannot come back. */
  describe("the requests that carry a whole message body", () => {
    // Case-insensitively: a label is written to sit mid-sentence and the
    // paragraph starts a sentence with it, which is `sentenceCase`'s whole job.
    test.each([...BODY_BEARING_TASKS])("names $task, and what it sends", (task) => {
      expect(text.toLowerCase()).toContain(task.label.toLowerCase());
      expect(text).toContain(task.sends);
    });

    test("no longer claims one of them is the only one", () => {
      expect(text).not.toMatch(/the one request that carries a whole message body/i);
      expect(text).not.toMatch(/only request that carries/i);
    });

    test("says how many there are, rather than leaving the reader to count", () => {
      expect(text).toMatch(new RegExp(`\\b${amount(BODY_BEARING_TASKS.length)}\\b`, "i"));
    });

    test("holds them to the one published truncation", () => {
      expect(text).toMatch(
        new RegExp(`(each|both)[^.]*${REPLY_BODY_TRUNCATION.toLocaleString("en-US")}`, "i"),
      );
    });
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
