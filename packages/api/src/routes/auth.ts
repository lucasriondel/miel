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

// An authenticated ping. It does nothing, which is the point: it sits behind
// the bearer middleware like every route but `/health`, so a client connecting
// to a server can tell a wrong secret (401) from a wrong URL (no answer)
// before it asks for anything real.
authRoutes.get("/check", (c) => c.json({ ok: true }));
