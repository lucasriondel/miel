import { Hono } from "hono";
import { z } from "zod";
import {
  createGogAdapter,
  getClaudeAuthStatus,
  startClaudeLoginSession,
  submitClaudeLoginCode,
  submitReauthCode,
} from "@miel/core";

const ReauthBody = z.object({
  account: z.string().email(),
});

const PasteBackCodeBody = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1),
});

export const authRoutes = new Hono();

authRoutes.post("/reauth", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const { account } = ReauthBody.parse(raw);
  const gog = createGogAdapter();
  // `--manual` paste-back: spawns the session and returns the OAuth URL plus a
  // sessionId. The live process is held in core until the user pastes the
  // redirect URL back via POST /auth/reauth/code.
  const session = await gog.startReauth({ account });
  session.done.catch(() => {
    /* surfaced via the /code result or a subsequent sync */
  });
  return c.json({ sessionId: session.sessionId, url: session.url });
});

// Submit the full pasted redirect URL to the waiting reauth process.
authRoutes.post("/reauth/code", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const { sessionId, code } = PasteBackCodeBody.parse(raw);
  const result = await submitReauthCode(sessionId, code);
  if (!result.ok) {
    return c.json(
      { error: "reauth_failed", reason: result.error },
      result.error === "session_not_found" ? 410 : 400,
    );
  }
  return c.json({ ok: true });
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
  const { sessionId, code } = PasteBackCodeBody.parse(raw);
  const result = await submitClaudeLoginCode(sessionId, code);
  if (!result.ok) {
    return c.json(
      { error: "claude_login_failed", reason: result.error },
      result.error === "session_not_found" ? 410 : 400,
    );
  }
  return c.json({ ok: true });
});
