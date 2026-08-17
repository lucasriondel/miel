import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import {
  HINT_MIN_LENGTH,
  HINT_PREFIX,
  HINT_SUFFIX,
  MIN_KEY_LENGTH,
  maskCredential,
} from "@miel/core/credentialMasking";
import { count } from "./format";
import { CONTACT_EMAIL } from "./site";
// Which vendors these pages must name, derived from core's catalogue (#114) so
// that a fourth one fails here until the copy names it too.
import { HOSTED_VENDOR_NAMES } from "./vendors";
import { allLegalText, type LegalPage } from "./legal";
import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

/**
 * The prose of these two pages is verified by reading it. What is asserted here
 * is the set of facts the pages are required to state — the ones a reader is
 * relying on before they hand an app access to their mailbox — plus the one
 * claim that must stay hedged because nobody has verified it.
 */
const PAGES: readonly [string, LegalPage][] = [
  ["privacy policy", PRIVACY],
  ["terms of service", TERMS],
];

describe.each(PAGES)("%s", (_name, page) => {
  test("has a path, a title and a single top-level heading", () => {
    expect(page.path).toMatch(/^\/[a-z-]+$/);
    expect(page.title).toContain("Miel");
    expect(page.heading.length).toBeGreaterThan(0);
  });

  test("every section has a stable unique id, a heading and body copy", () => {
    const ids = page.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of page.sections) {
      expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.body.length + (section.bullets?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  test("shows the contact address", () => {
    expect(allLegalText(page)).toContain(CONTACT_EMAIL);
  });

  test("says when it was last written, so a reader can judge how current it is", () => {
    expect(page.lastUpdated).toMatch(/\d{4}/);
    expect(allLegalText(page)).toContain(page.lastUpdated);
  });
});

describe("privacy policy: what is fetched and stored", () => {
  const text = allLegalText(PRIVACY);

  test("lists every category the database actually holds", () => {
    for (const pattern of [
      /header/i,
      /plain text and .*HTML|text and HTML/i,
      /label/i,
      /thread/i,
      /filter/i,
      /profile/i,
    ]) {
      expect(text).toMatch(pattern);
    }
  });

  test("names Postgres and says the database is the reader's own", () => {
    expect(text).toMatch(/Postgres/i);
    expect(text).toMatch(/your own|your machine|hardware you control/i);
  });

  test("names Claude's own output as stored data, not just the mail", () => {
    expect(text).toMatch(/priority/i);
    expect(text).toMatch(/reasoning/i);
  });
});

describe("privacy policy: transfer to the AI provider", () => {
  const text = allLegalText(PRIVACY);

  /* Issue #106: triage runs through whichever provider the reader picked —
     the local Claude Code CLI, Anthropic, Google or OpenAI — so a page that
     says message content goes to Anthropic is wrong for two of the four. This
     mirrors the neutrality `site.test.ts` already pins on the homepage
     disclosure: name the choice, never one vendor as the recipient. */
  test("describes the recipient as the provider the reader picked", () => {
    expect(text).toMatch(/AI provider/i);
    expect(text).toMatch(/you pick|your deployment|whichever/i);
  });

  /* Issue #115: this asserted only that each vendor appeared somewhere in the
     joined page, which the very copy it exists to forbid also satisfies — "Miel
     sends your mail to Anthropic" passes for as long as Google and OpenAI are
     named in some other section, however far away. The invariant its name
     states is co-occurrence: wherever a vendor is named as a place message
     content can go, the alternatives to it are named in the same breath.

     Scoped to the sections that describe the AI provider, because elsewhere on
     this page "Google" is Gmail's owner rather than a vendor that gets sent
     anything — the Gmail-transfer paragraph names it alone, correctly. */
  const AI_SECTION_IDS: readonly string[] = ["what-goes-to-the-ai-provider", "model-training"];

  test("names no vendor without naming the alternatives to it", () => {
    const sections = PRIVACY.sections.filter((section) => AI_SECTION_IDS.includes(section.id));
    // A renamed id would empty the scope and pass everything below.
    expect(sections).toHaveLength(AI_SECTION_IDS.length);

    const paragraphs = sections.flatMap((section) => [...section.body, ...(section.bullets ?? [])]);
    const naming = paragraphs.filter((paragraph) =>
      HOSTED_VENDOR_NAMES.some((vendor) => paragraph.includes(vendor)),
    );
    // Nothing named at all is not neutrality: the reader is owed the choice.
    expect(naming.length).toBeGreaterThan(0);

    for (const paragraph of naming) {
      for (const vendor of HOSTED_VENDOR_NAMES) {
        expect(paragraph).toContain(vendor);
      }
    }
  });

  /* Not part of `allLegalText`, and the one place a stale vendor name survives
     the prose rewrite: it is the page's meta description, read by anyone who
     sees the link before the page. */
  test("does not promise one vendor in the page's meta description", () => {
    expect(PRIVACY.description).not.toMatch(/Anthropic|OpenAI|Gemini/i);
    expect(PRIVACY.description).toMatch(/AI provider/i);
  });

  test("does not anchor a section on one vendor's name", () => {
    for (const section of PRIVACY.sections) {
      expect(section.id).not.toMatch(/anthropic|openai|gemini/);
    }
  });

  test("states both purposes: classification and reply drafting", () => {
    expect(text).toMatch(/priorit/i);
    expect(text).toMatch(/repl/i);
  });

  test("quotes the batch sizes the sync service actually applies", () => {
    expect(text).toContain(String(DEFAULT_TRIAGE_BATCH_SIZE));
    expect(text).toContain(String(MAX_TRIAGE_BATCH_SIZE));
  });

  test("quotes the truncation the reply service actually applies", () => {
    expect(text).toContain(REPLY_BODY_TRUNCATION.toLocaleString("en-US"));
    expect(text).toMatch(/truncat/i);
  });
});

describe("privacy policy: the training claim", () => {
  const trainingCopy = allLegalText(PRIVACY)
    .split("\n")
    .filter((line) => /train/i.test(line))
    .join("\n");

  test("is addressed at all rather than left for the reader to wonder about", () => {
    expect(trainingCopy.length).toBeGreaterThan(0);
  });

  test("is hedged: it says the answer depends and has not been verified here", () => {
    expect(trainingCopy).toMatch(/depends|not verified|unconfirmed|cannot confirm/i);
  });

  test("never asserts that these inputs are excluded from training", () => {
    expect(trainingCopy).not.toMatch(
      /(?:is|are|will)(?: not| never)(?: be)? used (?:to|for) train/i,
    );
    expect(trainingCopy).not.toMatch(/never used (?:to|for) train/i);
    expect(trainingCopy).not.toMatch(/excluded from (?:model )?train/i);
    expect(trainingCopy).not.toMatch(/(?:does|do) not train/i);
  });

  /* Issue #106: several credential kinds now, not two, and they are agreements
     with different companies. The refusal to make a training claim gets
     stronger for it — so the page has to send the reader to the terms of the
     vendor they picked, which means naming every one rather than one of them. */
  test("points the reader at the terms of whichever vendor they picked", () => {
    for (const vendor of HOSTED_VENDOR_NAMES) {
      expect(trainingCopy).toContain(vendor);
    }
    expect(trainingCopy).toMatch(/terms/i);
  });
});

describe("privacy policy: tokens, retention and deletion", () => {
  const text = allLegalText(PRIVACY);

  test("states that the OAuth refresh token is encrypted at rest", () => {
    expect(text).toMatch(/refresh token/i);
    expect(text).toMatch(/encrypted at rest/i);
  });

  /* Issue #106, after #104: the Google token is no longer the only secret in
     the database. A hosted provider's API key is pasted into the app and stored
     beside it, which is a fact about where a reader's secrets live. */
  test("says the AI provider's API key is kept the same way, in the app rather than a file", () => {
    const credentials = PRIVACY.sections.find((section) => section.id === "credentials");
    const body = (credentials?.body ?? []).join("\n");
    expect(body).toMatch(/API key/i);
    expect(body).toMatch(/settings|in the app/i);
    expect(body).toMatch(/ciphertext|encrypted/i);
  });

  test("states that retention is indefinite with no automatic expiry", () => {
    expect(text).toMatch(/indefinite/i);
    expect(text).toMatch(/no automatic expiry|does not expire|nothing expires/i);
  });

  test("says deletion is by email request", () => {
    expect(text).toMatch(/delet/i);
    expect(text).toMatch(new RegExp(`email|${CONTACT_EMAIL}`, "i"));
  });

  test("does not imply an in-app disconnect or delete button exists", () => {
    expect(text).toMatch(/no in-app|there is no .*(disconnect|delete)/i);
  });
});

/** A secret of exactly this many characters, to mask. */
const key = (length: number) => "k".repeat(length);

/* Issue #113: the page promised the prefix-and-suffix hint unconditionally, and
   `maskCredential` does not give one for a key between the shortest the app
   accepts and the shortest it can hint at without the hint being most of the
   secret. The masking is the safer behaviour, so it is the copy that gets
   pinned — to the function and its constants, not to a restatement of them. */
describe("privacy policy: the masked key hint", () => {
  const credentialsCopy = (
    PRIVACY.sections.find((section) => section.id === "credentials")?.body ?? []
  ).join("\n");

  test("quotes the characters the mask actually reveals", () => {
    const [prefix, suffix] = maskCredential(key(HINT_MIN_LENGTH)).split("…");
    expect(prefix).toHaveLength(HINT_PREFIX);
    expect(suffix).toHaveLength(HINT_SUFFIX);
    expect(credentialsCopy).toMatch(new RegExp(`first ${count(HINT_PREFIX)} characters`));
    expect(credentialsCopy).toMatch(new RegExp(`last ${count(HINT_SUFFIX)}`));
  });

  test("names the length below which there is no hint at all", () => {
    expect(maskCredential(key(HINT_MIN_LENGTH - 1))).toBe("…");
    expect(credentialsCopy).toContain(count(HINT_MIN_LENGTH));
    expect(credentialsCopy).toMatch(/shorter|too short/i);
    expect(credentialsCopy).toMatch(/none of|no characters|nothing of/i);
  });

  /* The gap is the whole bug: a key of MIN_KEY_LENGTH..HINT_MIN_LENGTH-1 saves
     and is then shown with no hint, so an unconditional promise is false for a
     length the app accepts. */
  test("makes the hint conditional, since a key the app accepts may get none", () => {
    expect(MIN_KEY_LENGTH).toBeLessThan(HINT_MIN_LENGTH);
    expect(maskCredential(key(MIN_KEY_LENGTH))).toBe("…");
    expect(credentialsCopy).toMatch(/only for|only when|but only|at least|or more/i);
  });

  test("is true of the masking at every key length the app accepts", () => {
    for (let length = MIN_KEY_LENGTH; length <= HINT_MIN_LENGTH + 20; length++) {
      const revealed = maskCredential(key(length)).replaceAll("…", "").length;
      expect(revealed).toBe(length < HINT_MIN_LENGTH ? 0 : HINT_PREFIX + HINT_SUFFIX);
    }
  });
});

describe("terms of service", () => {
  const text = allLegalText(TERMS);

  test("provides the software as-is with no warranty", () => {
    expect(text).toMatch(/as[- ]is/i);
    expect(text).toMatch(/without warranty|no warranty|warranties of any kind/i);
  });

  test("makes a self-hoster responsible for the instance they run", () => {
    expect(text).toMatch(/self-host/i);
    expect(text).toMatch(/responsib/i);
  });

  /* Issue #106: the terms put the AI vendor's agreement on the reader, which
     only holds if the page means whichever vendor they picked. Naming one made
     the sentence false for the others. */
  test("puts the AI agreement on whichever vendor the reader picked", () => {
    expect(text).toMatch(/AI provider/i);
    for (const vendor of HOSTED_VENDOR_NAMES) {
      expect(text).toContain(vendor);
    }
  });

  test("separates the software's licence from any instance I run", () => {
    expect(text).toMatch(/licen[cs]/i);
    expect(text).toMatch(/separate|does not grant|no right of access/i);
  });

  test("promises no uptime and no data preservation for the owner's deployment", () => {
    expect(text).toMatch(/uptime/i);
    expect(text).toMatch(/no commitment to preserve|data may be lost|without notice/i);
  });
});
