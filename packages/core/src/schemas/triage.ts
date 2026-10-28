import { Schema } from "effect";
import { z } from "zod";

export const PRIORITIES = ["high", "medium", "low"] as const;
export const Priority = z.enum(PRIORITIES);
export type PriorityT = z.infer<typeof Priority>;

export const TriageInputItem = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  currentLabels: z.array(z.string()),
  // Optional: the slim triage prompt omits these. The model fetches the body
  // on demand via the API. Kept optional so a fuller payload still validates.
  to: z.array(z.string()).optional(),
  body: z.string().optional(),
  internalDate: z.string().optional(),
});
export type TriageInputItemT = z.infer<typeof TriageInputItem>;

export const TriageInput = z.object({
  account: z.string().email(),
  accountId: z.string(),
  messages: z.array(TriageInputItem).min(1).max(20),
});
export type TriageInputT = z.infer<typeof TriageInput>;

/**
 * What the model answers, as an `effect` Schema: the output contract both
 * transports constrain the model with (`claude/tasks.ts`). The inputs above
 * stay Zod because the API validates them; this is the one shape that has to
 * be a Schema, since `effect/ai`'s `generateObject` takes nothing else.
 */
export const TriageOutputItem = Schema.Struct({
  id: Schema.String,
  priority: Schema.Literals(PRIORITIES),
  reasoning: Schema.String,
});
export type TriageOutputItemT = typeof TriageOutputItem.Type;

export const TriageOutput = Schema.Struct({
  results: Schema.mutable(Schema.Array(TriageOutputItem)),
});
export type TriageOutputT = typeof TriageOutput.Type;
