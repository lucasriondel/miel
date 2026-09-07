import { z } from "zod";

export const ReplyGenInput = z.object({
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string().nullable(),
  body: z.string(),
  userInstruction: z.string(),
});
export type ReplyGenInputT = z.infer<typeof ReplyGenInput>;

export const ReplyGenOutput = z.object({
  subject: z.string(),
  body: z.string(),
});
export type ReplyGenOutputT = z.infer<typeof ReplyGenOutput>;
