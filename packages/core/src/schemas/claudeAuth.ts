import { z } from "zod";

export const ClaudeAuthStatus = z
  .object({
    loggedIn: z.boolean(),
    authMethod: z.string().optional(),
    email: z.string().optional(),
  })
  .passthrough();
export type ClaudeAuthStatusT = z.infer<typeof ClaudeAuthStatus>;

export const ClaudeLoginCodeRequest = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1),
});
export type ClaudeLoginCodeRequestT = z.infer<typeof ClaudeLoginCodeRequest>;
