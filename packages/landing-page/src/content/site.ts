/**
 * All homepage copy lives here as plain data so it can be asserted on in a unit
 * test without rendering a component, and so the prerendered-output test can
 * check the same strings against the built HTML.
 */
import {
  BODY_BEARING_TASKS,
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import { amount, bodyBearingSentences, count } from "./format";
import type { IconName } from "./icons";

export const SITE_NAME = "Miel";

/**
 * The repository is private today; this is its eventual public URL, so the link
 * starts working the moment visibility is flipped with no follow-up edit here.
 */
export const GITHUB_URL = "https://github.com/lucasriondel/miel";

export const CONTACT_EMAIL = "lucasriondelpro@gmail.com";

export type Section = {
  /** Anchor id, also used as the React key. */
  id: string;
  heading: string;
  body: string[];
};

export type Home = {
  title: string;
  tagline: string;
  intro: string[];
  callToAction: { label: string; href: string };
  /**
   * The subsections of "What is Miel" — rendered as `<h3>`s inside that one
   * section rather than as sections of their own. See `ABOUT`.
   */
  sections: Section[];
  contactHeading: string;
  contactIntro: string;
};

/**
 * "What is Miel" — the one section answering the question a reader arrives
 * with, and the first entry in the side menu, above Motivation.
 *
 * It is a *container*, not a block of prose: the feature grid and the four
 * prose blocks under it were five sibling `<h2>`s with no anchor between them
 * and the hero, so a reader who wanted to know what the thing was had nothing
 * to click and no single place the answer lived. They are subsections now —
 * one `<h2>` with the side menu's anchor on it, `FEATURES` and then
 * `HOME.sections` as `<h3>`s under it — which is why `HOME.sections` no longer
 * carries `what-it-does` as a top-level id and why the prerender contract
 * counts one section here rather than five.
 */
export const ABOUT = {
  id: "what-is-miel",
  navLabel: `What is ${SITE_NAME}`,
  heading: `What is ${SITE_NAME}`,
} as const;

export const HOME: Home = {
  title: `${SITE_NAME} — self-hosted Gmail triage`,
  tagline: "Self-hosted Gmail triage, powered by AI.",
  intro: [
    `${SITE_NAME} fetches your Gmail, asks an AI to sort each message by priority and suggest labels, and shows you the result in a local web app where you review, apply, or reply in one pass.`,
    `It is open source and self-hosted: you run it on your own machine or your own server, against your own Google account. There is no signup, no hosted product, and no account with me — because there is nothing to sign up for.`,
  ],
  callToAction: {
    label: "Get the code on GitHub",
    href: GITHUB_URL,
  },
  sections: [
    {
      id: "what-it-does",
      heading: `What ${SITE_NAME} does`,
      body: [
        "It syncs messages from your Gmail account and stores them locally in Postgres.",
        "It sends each message's sender, subject and preview to the AI for triage, which returns a priority and suggested labels along with its reasoning.",
        "It surfaces the triaged inbox in a web UI where you can apply label suggestions, archive or trash threads, draft replies, and manage Gmail filters.",
      ],
    },
    {
      id: "who-it-is-for",
      heading: "Who it is for",
      body: [
        "People with a noisy Gmail inbox who are comfortable running a Docker container, a Postgres database, and a couple of dev servers on hardware they control.",
        "If you would rather not run software yourself, Miel is not for you — there is no hosted version to point you at.",
      ],
    },
    {
      id: "self-hosted",
      heading: "Self-hosted and open source",
      body: [
        "The whole thing is open source. Clone the repository, read exactly what it does with your mail, and run it yourself.",
        "Your mail, your database, your machine. Nothing is sent to a server I operate.",
      ],
    },
    {
      id: "what-you-need",
      heading: "What you need to run it",
      body: [
        "Your own Google Cloud OAuth client. Miel talks to Gmail through the Google API on your behalf, and each self-hoster supplies their own client ID and secret — you create a project in the Google Cloud console, enable the Gmail API, and configure a consent screen for your own use. Plan for that setup cost before you start.",
        "Credentials for your AI provider, so Miel can classify your messages and draft replies.",
        "Docker for Postgres, and Bun to run the app.",
      ],
    },
  ],
  contactHeading: "Contact",
  contactIntro: "Questions about Miel, or about what it does with your data:",
};

export type Feature = {
  /** Short heading, the thing itself. */
  name: string;
  /** One sentence on what it does for the reader. */
  body: string;
  /** The Lucide glyph shown above the name, drawn inline from `icons.ts`. */
  icon: IconName;
};

/**
 * The feature list — what the reader gets, before the page turns to what
 * running it costs them.
 *
 * It is the first subsection of `ABOUT`, above the prose blocks, because it
 * answers "what does it do", which is the question a reader arrives with,
 * while those answer "should I run it". Each entry is one built feature, named
 * the way the app names it, and nothing here is aspirational — the page must
 * not advertise something an install does not do.
 *
 * Its `id` is still its own anchor, but it is no longer a top-level section:
 * the side menu links to `ABOUT` and this is an `<h3>` inside it, so the menu
 * stays one entry per answer rather than one per heading.
 */
export const FEATURES = {
  id: "features",
  heading: "What you get",
  intro:
    "The inbox Miel builds out of your Gmail, and the things it works out for you while it is there.",
  items: [
    {
      name: "The Google Inbox layout, back again",
      icon: "layout-grid",
      body: "Messages grouped by Gmail's own system categories inside each priority band, and a pager that steps through your mail a week, a month or a year at a time instead of one endless scroll.",
    },
    {
      name: "Several accounts at once",
      icon: "users-round",
      body: "Connect as many Gmail accounts as you like and switch between them in place; each one keeps its own labels, filters and triage.",
    },
    {
      name: "Priority triage",
      icon: "gauge",
      body: "Every message is read and ranked high, medium or low, with the reasoning attached, so the inbox opens already sorted by what is worth your attention.",
    },
    {
      name: "Filter and label suggestions",
      icon: "tags",
      body: "Miel proposes labels for a message, new labels worth creating, and Gmail filters to stop the noise at the door. Nothing reaches Gmail until you apply it.",
    },
    {
      name: "Promo codes, kept",
      icon: "ticket-percent",
      body: "Discount codes are pulled out of marketing mail as it arrives, with the discount, terms and expiry beside them, and saving one keeps a copy of the mail after the original is gone.",
    },
    {
      name: "Login codes and links, surfaced",
      icon: "key-round",
      body: "One-time verification codes are lifted to the top of the inbox the moment they land, so signing in does not mean opening the mail that carries the code.",
    },
    {
      name: "Replies drafted for you",
      icon: "pen-line",
      body: "Open a message and Miel drafts an answer in your own words, which you edit and send from a compose window without leaving the page.",
    },
  ] satisfies readonly Feature[],
} as const;

/**
 * The permission table's frame. The rows themselves come from `scopes.ts`,
 * which derives them from the canonical scope list.
 */
export const PERMISSIONS = {
  id: "permissions",
  heading: "What Miel asks Google for",
  intro: [
    "Miel requests five Google permissions. Below is each one: the wording Google itself will show you on the consent screen, and the feature that needs it.",
    "The consent wording is reproduced as Google writes it, not softened. The mail permission is described there as permanently deleting your email — Miel never does that, but you will read that sentence when you connect an account, and you should read it here first.",
  ],
  tableCaption:
    "Google permissions Miel requests, with Google's consent-screen wording and the feature that requires each",
  columns: {
    permission: "Permission",
    consent: "What Google's consent screen says",
    feature: "What Miel uses it for",
  },
  notes: [
    "Miel never permanently deletes mail: trashing a thread moves it to Gmail's bin, where Gmail's own thirty-day rule takes over. The mail permission still cannot be narrowed while archiving and trashing are features — the read-only and labels permissions together cover neither changing labels in bulk nor trashing a thread.",
  ],
} as const;

/**
 * The AI-provider disclosure. The figures come from `@miel/core/claudeUsage`,
 * the same constants the sync and reply services apply, so the published
 * numbers cannot drift from the ones in force.
 *
 * The provider is described generically rather than named, and since #105 that
 * is not a hedge: a deployment picks the local Claude Code CLI, Anthropic,
 * Google or OpenAI per task, so no single vendor name would be true of every
 * install. The installation guide still names the CLI, because it is the
 * default and what a reader has to type.
 */
export const CLAUDE_DISCLOSURE = {
  id: "claude",
  heading: "What Miel sends to the AI provider",
  body: [
    `Miel does not classify your mail itself. It sends it to the AI provider your deployment is configured against, which returns a priority, suggested labels and its reasoning. Your message content therefore leaves your machine and is processed by that provider under their terms. This is the one part of ${SITE_NAME} that is not purely local, and if it is not acceptable to you, do not connect an account.`,
    `For triage, each request carries the sender, subject, the short preview snippet Gmail provides and the labels already on the message — up to ${count(DEFAULT_TRIAGE_BATCH_SIZE)} messages per request by default, and at most ${count(MAX_TRIAGE_BATCH_SIZE)} if you raise the batch size in settings. Through the local CLI, the provider may ask Miel for a full message body when the preview is not enough to decide; a provider called over its API cannot, and is never sent one.`,
    `Miel makes ${amount(BODY_BEARING_TASKS.length)} kinds of request that carry a whole message body, each truncated to the first ${count(REPLY_BODY_TRUNCATION)} characters — anything past that is never sent. ${bodyBearingSentences()} Filter suggestions send the sender, subject and snippet only.`,
    `You supply your own AI provider credentials, so the account these requests are billed to and governed by is yours, not mine. Read that provider's terms before you connect an account — you choose which one runs each task in settings, and the setup guide names the one Miel uses by default.`,
  ],
} as const;

/** Every string on the homepage, joined — the seam the copy tests assert on. */
export function allHomeText(): string {
  return [
    HOME.title,
    HOME.tagline,
    ...HOME.intro,
    HOME.callToAction.label,
    ABOUT.heading,
    FEATURES.heading,
    FEATURES.intro,
    ...FEATURES.items.flatMap((feature) => [feature.name, feature.body]),
    ...HOME.sections.flatMap((section) => [section.heading, ...section.body]),
    PERMISSIONS.heading,
    ...PERMISSIONS.intro,
    PERMISSIONS.tableCaption,
    ...Object.values(PERMISSIONS.columns),
    ...PERMISSIONS.notes,
    CLAUDE_DISCLOSURE.heading,
    ...CLAUDE_DISCLOSURE.body,
    HOME.contactHeading,
    HOME.contactIntro,
    CONTACT_EMAIL,
  ].join("\n");
}
