import { Schema } from "effect";
import { z } from "zod";

export const ReplyGenInput = z.object({
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  body: z.string(),
  userInstruction: z.string(),
});
export type ReplyGenInputT = z.infer<typeof ReplyGenInput>;

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
