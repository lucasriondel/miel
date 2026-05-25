import { Hono } from "hono";
import { z } from "zod";
import {
  createGogAdapter,
  getClaudeAuthStatus,
  startClaudeLoginSession,
  submitClaudeLoginCode,
} from "@miel/core";

const ReauthBody = z.object({
  account: z.string().email(),
});

const ClaudeLoginCodeBody = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post("/reauth", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const { account } = ReauthBody.parse(raw);
  const gog = createGogAdapter();
  const session = await gog.startReauth({ account });
  // Don't await `session.done` — the process keeps running until the user
  // completes the OAuth callback. We just return the URL the browser opens.
  session.done.catch(() => {
    /* surfaced via subsequent sync attempts */
  });
  return c.json({ url: session.url });
});

// Read-only login status of the Claude CLI. ShellError -> 502 via middleware.
authRoutes.get("/claude/status", async (c) => {
  const status = await getClaudeAuthStatus();
  return c.json(status);
});

// Start a Claude CLI login: spawns `claude auth login` and returns the OAuth
// URL once it appears (awaited, like /reauth). The live process is held in core
// keyed by sessionId until the code is submitted.
authRoutes.post("/claude/login", async (c) => {
  const session = await startClaudeLoginSession();
  session.done.catch(() => {
    /* surfaced via the /code result or a subsequent status poll */
  });
  return c.json({ sessionId: session.sessionId, url: session.url });
});

// Submit the pasted code to the waiting login process and await success/failure.
authRoutes.post("/claude/login/code", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const { sessionId, code } = ClaudeLoginCodeBody.parse(raw);
  const result = await submitClaudeLoginCode(sessionId, code);
  if (!result.ok) {
    return c.json(
      { error: "claude_login_failed", reason: result.error },
      result.error === "session_not_found" ? 410 : 400,
    );
  }
  return c.json({ ok: true });
});
