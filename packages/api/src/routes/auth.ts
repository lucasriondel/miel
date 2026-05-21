import { Hono } from "hono";
import { z } from "zod";
import { createGogAdapter } from "@miel/core";

const ReauthBody = z.object({
  account: z.string().email(),
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
