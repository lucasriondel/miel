/**
 * What miel sends the AI provider, as figures and a list rather than prose.
 *
 * A leaf module for the same reason as `google/scopes.ts`: the public landing
 * page discloses these figures and imports them (`@miel/core/claudeUsage`)
 * instead of restating them, so the disclosure cannot quietly disagree with the
 * code. Both the services that impose the limits import them from here too.
 *
 * Nothing here names a vendor, and that is the rule downstream too: which
 * provider receives any of this is the user's own per-task pick (#105), so the
 * copy says what is sent and never who receives it.
 */
import type { ModelTask } from "./providerModels";

/**
 * Messages per triage request. Configurable per install (`triage.batchSize`);
 * this is the default the settings service falls back to.
 */
export const DEFAULT_TRIAGE_BATCH_SIZE = 15;

/** The ceiling the settings service clamps a configured batch size to. */
export const MAX_TRIAGE_BATCH_SIZE = 50;

/**
 * Characters of message body a prompt may carry, applied by every task in
 * {@link BODY_BEARING_TASKS}. It keeps reply's name because reply was the only
 * such task when it was published, and the figure is the one the disclosure
 * quotes — renaming it would move a published number for no gain.
 *
 * Triage still sends only sender, subject and Gmail's snippet.
 */
export const REPLY_BODY_TRUNCATION = 8000;

/** A task whose prompt carries a whole message body, in the words the copy uses. */
export type BodyBearingTask = {
  /** Which task it is, so the list cannot name one that does not exist. */
  task: ModelTask;
  /** What the task does — quoted by the published copy, not paraphrased. */
  label: string;
  /** What of the message goes into that prompt. */
  sends: string;
};

/**
 * The tasks that put a whole message body in a prompt. Each is truncated at
 * {@link REPLY_BODY_TRUNCATION}.
 *
 * Drafting a reply was the only one until promo extraction landed (#156) and a
 * sync started running it over new promotional mail (#159), and the disclosure
 * still said so (#158). The homepage disclosure, the privacy policy and the
 * README's "What the AI sees" all quote these entries rather than writing a
 * sentence of their own, so a third body-bearing task updates three published
 * documents by adding a row here.
 *
 * `claude/tasks.test.ts` holds the other half of that: the set of prompts that
 * actually inline the body they were handed must be exactly this list.
 */
export const BODY_BEARING_TASKS: readonly BodyBearingTask[] = [
  {
    task: "reply",
    label: "drafting a reply",
    sends: "the body of the message being answered",
  },
  {
    task: "promo-extract",
    label: "extracting discount codes from promotional mail",
    sends:
      "the visible text of the message, with its HTML markup stripped out — and only for mail a local, content-only check judged promotional first, so everything else is never sent at all",
  },
];
