import { Schema } from "effect";
import { z } from "zod";

/** Drafting an answer to a stored message: the original, inlined (truncated). */
export const ReplyGenInput = z.object({
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  body: z.string(),
  userInstruction: z.string(),
});
export type ReplyGenInputT = z.infer<typeof ReplyGenInput>;

/**
 * Drafting a new message — the compose window with no message behind it.
 *
 * Still the `reply` task, not a fifth one: the design lists Triage, Reply and
 * Promo codes as the tasks a user picks a model for, and writing a mail is what
 * this task does whether or not it answers one. What it lacks is the point: no
 * `from` and no `body`, because there is no received message, so this input
 * inlines nothing anyone sent — `BODY_BEARING_TASKS` is unchanged by it.
 * `to` and `subject` are hints the user may have typed already.
 */
export const NewMailGenInput = z.object({
  /** The mailbox the mail will be sent from. */
  sender: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  userInstruction: z.string(),
});
export type NewMailGenInputT = z.infer<typeof NewMailGenInput>;

/** What the `reply` task takes: an answer to a message, or a new one. */
export type ReplyTaskInputT = ReplyGenInputT | NewMailGenInputT;

/**
 * What the model answers. An `effect` Schema rather than Zod because it is the
 * output contract both transports constrain the model with — the CLI through
 * `effect/ai`'s `generateObject`, which takes a Schema and nothing else — and
 * the one JSON Schema both send is derived from it.
 */
export const ReplyGenOutput = Schema.Struct({
  subject: Schema.String,
  body: Schema.String,
});
export type ReplyGenOutputT = typeof ReplyGenOutput.Type;
