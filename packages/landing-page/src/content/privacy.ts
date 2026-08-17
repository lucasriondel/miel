/**
 * The privacy policy, written against the code rather than from a template.
 *
 * Every claim here is one the repository can be checked against: the stored
 * categories are the columns of `packages/core/src/db/schema.ts`, the batch and
 * truncation figures are imported from the constants the services apply, and
 * the encryption sentence describes `util/crypto.ts` including its
 * development fallback. The masked-hint sentence quotes
 * `@miel/core/credentialMasking` the same way, including the case it used to
 * gloss over: a key too short to hint at safely gets no hint (#113). Where a fact is not verifiable — whether a vendor's
 * terms exclude these inputs from training, which depends on the credential the
 * deployment uses — the page says so instead of guessing.
 *
 * No vendor is named as *the* recipient of message content (#106). Since #105 a
 * deployment picks its provider per task — the local Claude Code CLI, Anthropic,
 * Google or OpenAI — so the page names the choice and the reader's place in it.
 * Vendors are named only where the reader has to act on the name: which terms
 * to go and read.
 */
import {
  DEFAULT_TRIAGE_BATCH_SIZE,
  MAX_TRIAGE_BATCH_SIZE,
  REPLY_BODY_TRUNCATION,
} from "@miel/core/claudeUsage";
import { HINT_MIN_LENGTH, HINT_PREFIX, HINT_SUFFIX } from "@miel/core/credentialMasking";
import { count } from "./format";
import { LEGAL_LAST_UPDATED, type LegalPage } from "./legal";
import { CONTACT_EMAIL, SITE_NAME } from "./site";

export const PRIVACY: LegalPage = {
  path: "/privacy",
  navLabel: "Privacy policy",
  title: `Privacy policy — ${SITE_NAME}`,
  description: `What ${SITE_NAME} does with your Gmail data: what it fetches, what it stores, what it sends to the AI provider you pick, and how to have it deleted.`,
  heading: "Privacy policy",
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: [
    `${SITE_NAME} reads your mailbox, so you are entitled to know exactly what it does with it. This page describes the software as it is actually built — the data it fetches, where that data sits, what leaves your machine, and what happens to it afterwards. It is not a template.`,
  ],
  sections: [
    {
      id: "who-is-responsible",
      heading: "Who holds your data",
      body: [
        `${SITE_NAME} is self-hosted software. If you run it, you run it on your own machine or your own server, against a Google Cloud OAuth client you created and a Postgres database you control. Your mail is fetched into that database and stays there. I never see it, I have no copy of it, and there is no server of mine involved at any point.`,
        "That makes you, not me, the person responsible for the instance you run and for the data in it. What this page describes, in the sections about what is fetched and what is sent onwards, is what the software does when you run it — so that you know what you are taking responsibility for.",
        `Separately, I run one instance of ${SITE_NAME} for my own mail. Where this page says something about "the instance I run", that is the one it means. Nobody else has an account on it; there is nothing to sign up for.`,
      ],
    },
    {
      id: "what-is-stored",
      heading: "What Miel fetches from Gmail and stores",
      body: [
        "When you sync an account, Miel fetches messages through the Gmail API and writes them into its Postgres database. It stores, per message:",
      ],
      bullets: [
        "Headers: the sender's name and address, the recipient addresses, the subject, the date Gmail assigned, the Gmail message and thread identifiers, and the raw header map as Gmail returned it.",
        "Bodies: the full message body in both forms — plain text and HTML — along with the short preview snippet Gmail provides.",
        "Labels: every Gmail label on your account, and which labels are on which message, plus whether Miel has archived or trashed the message.",
        "Threads: the thread each message belongs to, so a conversation can be shown and acted on as one.",
        "Attachments: filename, media type and size. The attachment's contents are not stored — the bytes are fetched from Gmail only at the moment you open or download one.",
        "Filters: the Gmail filters on your account, with their criteria and actions, and any filter Miel has suggested to you.",
        "Account profile: the connected account's email address, display name and avatar URL, the permissions you granted, and when you connected it.",
        "The AI's output: for each message, the priority it assigned, the reasoning it gave, the labels it suggested, and which model produced them — plus a log of each sync and triage run with counts, timings and any error.",
      ],
    },
    {
      id: "what-goes-to-the-ai-provider",
      heading: "What leaves your machine: your AI provider",
      body: [
        `Miel does not classify mail itself. It sends it to the AI provider you pick in settings — Anthropic's Claude through the local Claude Code CLI or Anthropic's API, or Google's or OpenAI's API — which returns a priority, suggested labels and its reasoning, and which drafts replies when you ask for one. That provider is the only place your message content leaves your machine, and it is the part of ${SITE_NAME} you should decide about before you connect an account.`,
        `Triage sends the sender, subject, Gmail's preview snippet and the labels already on the message — batched, at up to ${count(DEFAULT_TRIAGE_BATCH_SIZE)} messages per request by default and at most ${count(MAX_TRIAGE_BATCH_SIZE)} if you raise the batch size in settings. Full bodies are not part of that request. Through the Claude Code CLI, and only there, the model can ask Miel for one message's body through the local API when the preview is not enough to decide; a provider called over its API has no way to and is never sent one.`,
        `Drafting a reply is the one request that carries a whole message body, and it is truncated to the first ${count(REPLY_BODY_TRUNCATION)} characters — anything beyond that is never sent. Filter suggestions send the sender, subject and snippet only.`,
        "You supply your own credential for whichever provider you pick, so these requests are made on your account and are governed by whatever agreement you have with that vendor — not by anything between you and me.",
      ],
    },
    {
      id: "model-training",
      heading: "Whether your provider trains on it",
      body: [
        "Honest answer: this page cannot tell you. Whether a vendor may use these inputs for model training depends on the credential your deployment uses — Miel can be pointed at Claude through the Claude Code CLI with a Claude subscription credential, or at Anthropic's, Google's or OpenAI's API with an API key, and those are different agreements with different terms.",
        "I have not verified what any of those agreements says about training, and I am not going to publish a reassurance I have not checked. Before you connect an account, read the current terms and privacy policy of the vendor whose credential you intend to use — Anthropic's, Google's or OpenAI's — and decide from those.",
      ],
    },
    {
      id: "other-transfers",
      heading: "What leaves your machine: everything else",
      body: [
        "Google, necessarily: Miel talks to the Gmail API on your behalf to fetch mail, change labels, archive or trash threads, send the replies you approve, and read or create filters. That traffic goes to Google under the permissions you granted, which are listed in full on the homepage.",
        "One optional integration exists: if — and only if — you configure it, an attachment you explicitly choose to send can be relayed to a separate document-filing service of mine. It is off unless both of its environment variables are set, it never fires on its own, and it moves nothing but the one file you picked.",
        "Nothing else. Miel has no analytics, no error-reporting service, no advertising, and no telemetry of any kind. These public pages set no cookies and run no JavaScript at all.",
      ],
    },
    {
      id: "credentials",
      heading: "Your credentials",
      body: [
        "Connecting an account gives Miel a Google OAuth refresh token — a long-lived key to your mailbox. It is encrypted at rest with AES-256-GCM under a key from the deployment's own environment, and stored only as ciphertext. The short-lived access tokens exchanged for it are held in memory for the duration of a request and never written to the database.",
        `If you pick a provider that Miel calls over its API rather than the local CLI, its API key is held the same way and in the same place: you paste it into the app's settings instead of into a file, and it is stored as ciphertext under that same encryption key. Nothing logs it, and it is never shown back to you in full. What settings shows after saving is a masked hint — the first ${count(HINT_PREFIX)} characters and the last ${count(HINT_SUFFIX)}, enough to tell one key from another when you rotate — but only for a key of at least ${count(HINT_MIN_LENGTH)} characters. A shorter key than that is still accepted and then shown as a bare ellipsis, with none of its characters revealed at all: on a secret that short, a hint would be most of the secret.`,
        "One caveat, stated because it is true rather than because it flatters: in local development, if the encryption key is unset, both are stored verbatim and the app warns you. Production configuration refuses to start without the key, so a deployed instance always encrypts.",
        "You can revoke Miel's access to your Google account at any time from your Google account's permissions page, without asking me. Revoking stops any further fetching immediately; it does not delete what has already been fetched into the database, which is the next section.",
      ],
    },
    {
      id: "retention",
      heading: "How long it is kept",
      body: [
        "Indefinitely. There is no automatic expiry, no retention window, and no scheduled cleanup: a message fetched today is still in the database in a year unless someone removes it. If a message disappears from Gmail between syncs, Miel marks its row as removed rather than deleting it, so the triage history stays intact.",
        "If you self-host, this is entirely in your hands — it is your database, and dropping it, or deleting a single account's rows, removes everything associated with that account in one step.",
      ],
    },
    {
      id: "deletion",
      heading: "Deleting your data",
      body: [
        `There is no in-app disconnect button and no "delete my data" flow. Neither has been built, and this page is not going to imply otherwise. For the one instance I run, deletion is by email request: write to ${CONTACT_EMAIL} and I will delete the account and everything attached to it.`,
        "For your own instance there is nobody to ask — you delete the account row and the database removes the messages, labels, triages, suggestions, filters and run logs that depend on it.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      body: [
        "If the software changes what it collects or where it sends it, this page changes with it, and the date at the top moves. There is no mailing list to notify, because there are no accounts.",
      ],
    },
  ],
  contactHeading: "Questions, or a deletion request",
  contactIntro: "Anything about what Miel does with your data, or a request to delete it:",
};
