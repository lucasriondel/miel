import { Hono } from "hono";
import { getClaudeCodeTokenStatus } from "@miel/core";

export const authRoutes = new Hono();

// Read-only status of the long-lived Claude Code token. There is no interactive
// login and no environment fallback — the token is stored encrypted, pasted in
// the app, so this reports presence and a masked hint (#109). It answers from
// the same service as `/settings/claude-code-token`, which is where a token is
// written. The Google OAuth routes live in `routes/googleOAuth.ts`.
authRoutes.get("/claude/status", async (c) => {
  return c.json(await getClaudeCodeTokenStatus());
});
