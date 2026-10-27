import { z } from "zod";

export const Priority = z.enum(["high", "medium", "low"]);
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

export const TriageOutputItem = z.object({
  id: z.string(),
  priority: Priority,
  reasoning: z.string(),
});
export type TriageOutputItemT = z.infer<typeof TriageOutputItem>;

export const TriageOutput = z.object({
  results: z.array(TriageOutputItem),
});
export type TriageOutputT = z.infer<typeof TriageOutput>;
