/**
 * All homepage copy lives here as plain data so it can be asserted on in a unit
 * test without rendering a component, and so the prerendered-output test can
 * check the same strings against the built HTML.
 */
import {
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import { count } from "./format";

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
  sections: Section[];
  contactHeading: string;
  contactIntro: string;
};

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
    `Drafting a reply is the one request that carries a whole message body, and it is truncated to the first ${count(REPLY_BODY_TRUNCATION)} characters — anything past that is never sent. Filter suggestions send the sender, subject and snippet only.`,
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
