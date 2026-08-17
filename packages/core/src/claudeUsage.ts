/**
 * What miel sends to Anthropic's Claude, as numbers rather than prose.
 *
 * A leaf module for the same reason as `google/scopes.ts`: the public landing
 * page discloses these figures and imports them (`@miel/core/claudeUsage`)
 * instead of restating them, so the disclosure cannot quietly disagree with the
 * code. Both the services that impose the limits import them from here too.
 */

/**
 * Messages per triage request. Configurable per install (`triage.batchSize`);
 * this is the default the settings service falls back to.
 */
export const DEFAULT_TRIAGE_BATCH_SIZE = 15;

/** The ceiling the settings service clamps a configured batch size to. */
export const MAX_TRIAGE_BATCH_SIZE = 50;

/**
 * Characters of message body sent when drafting a reply — the one place miel
 * puts a whole message body in a prompt, so the one place a truncation applies.
 * Triage sends only sender, subject and Gmail's snippet.
 */
export const REPLY_BODY_TRUNCATION = 8000;
