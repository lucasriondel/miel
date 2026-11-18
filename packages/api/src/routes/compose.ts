import { Hono } from "hono";
import { apiSchemas, deleteDraft, generateNewMessage, saveDraft, sendNewMessage } from "@miel/core";

/**
 * Writing a message that answers nothing — the compose window opened from the
 * sidebar — and the window's autosave into Gmail drafts.
 *
 * Its own prefix rather than a `/messages` route because there is no message in
 * the path to act on: the account travels in the body. Thin like every route —
 * which addresses are usable, what a draft id means and which failures surface
 * are the core services' rules, so the CLI would get the same ones.
 */
export const composeRoutes = new Hono();

composeRoutes.post("/send", async (c) => {
  const body = apiSchemas.SendMessageRequest.parse(await c.req.json());
  const result = await sendNewMessage({
    accountId: body.accountId,
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    body: body.body,
    draftId: body.draftId,
  });
  return c.json(result);
});

// The reply task with no source message: nothing a correspondent wrote is in
// the prompt, so this is not a body-bearing call.
composeRoutes.post("/generate", async (c) => {
  const body = apiSchemas.GenerateMessageRequest.parse(await c.req.json());
  const result = await generateNewMessage({
    accountId: body.accountId,
    prompt: body.prompt,
    to: body.to,
    subject: body.subject,
  });
  return c.json(result);
});

// PUT because it is idempotent on the draft id: naming one replaces it.
composeRoutes.put("/drafts", async (c) => {
  const body = apiSchemas.SaveDraftRequest.parse(await c.req.json());
  const result = await saveDraft(body);
  return c.json(result);
});

composeRoutes.delete("/drafts/:accountId/:draftId", async (c) => {
  const params = apiSchemas.DraftParams.parse({
    accountId: c.req.param("accountId"),
    draftId: c.req.param("draftId"),
  });
  const result = await deleteDraft(params);
  return c.json(result);
});
