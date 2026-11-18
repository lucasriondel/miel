import { Hono } from "hono";
import {
  apiSchemas,
  cancelGeneration,
  cancelScheduled,
  deleteDraft,
  generateNewMessage,
  listScheduled,
  removeUpload,
  reschedule,
  saveDraft,
  scheduleSend,
  sendNewMessage,
  uploadAttachment,
} from "@miel/core";

/**
 * Writing a message that answers nothing — the compose window opened from the
 * sidebar — and everything the window does around a send: its autosave into
 * Gmail drafts, its attachment uploads, stopping an AI draft, and schedule send.
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
    from: body.from,
    uploadIds: body.uploadIds,
  });
  return c.json(result);
});

// The reply task with no source message: nothing a correspondent wrote is in
// the prompt, so this is not a body-bearing call. Stoppable by request id, or
// by dropping the request.
composeRoutes.post("/generate", async (c) => {
  const body = apiSchemas.GenerateMessageRequest.parse(await c.req.json());
  const result = await generateNewMessage(
    {
      accountId: body.accountId,
      prompt: body.prompt,
      to: body.to,
      subject: body.subject,
      previousDraft: body.previousDraft,
    },
    { requestId: body.requestId, signal: c.req.raw.signal },
  );
  return c.json(result);
});

// Stop a generation by the id the client gave it. `cancelled: false` means
// there was nothing running under that id (it finished, or never started).
composeRoutes.post("/generations/:requestId/cancel", (c) => {
  const cancelled = cancelGeneration(c.req.param("requestId"));
  return c.json({ ok: true, cancelled });
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

// One file per request, as `multipart/form-data` with `accountId` and `file`.
// The window uploads each file as it is attached and keeps the id; a send names
// the ids. A file over the limit is refused (413) without blocking the rest.
composeRoutes.post("/uploads", async (c) => {
  const form = await c.req.parseBody();
  const { accountId } = apiSchemas.UploadParams.pick({ accountId: true }).parse({
    accountId: form.accountId,
  });
  const file = form.file;
  if (!(file instanceof File)) {
    return c.json({ error: "validation_failed", message: "Send the file as `file`." }, 400);
  }
  const result = await uploadAttachment({
    accountId,
    filename: file.name,
    mimeType: file.type,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  return c.json(result, 201);
});

// A chip removed before the send.
composeRoutes.delete("/uploads/:accountId/:uploadId", async (c) => {
  const params = apiSchemas.UploadParams.parse({
    accountId: c.req.param("accountId"),
    uploadId: c.req.param("uploadId"),
  });
  const result = await removeUpload({ accountId: params.accountId, id: params.uploadId });
  return c.json(result);
});

// Schedule send. Gmail's API has none, so miel holds the message and the API
// process sends it when it is due — see `scheduledSends.ts` in core.
composeRoutes.post("/scheduled", async (c) => {
  const body = apiSchemas.ScheduleSendRequest.parse(await c.req.json());
  const result = await scheduleSend({
    accountId: body.accountId,
    kind: body.kind,
    sourceGmailMessageId: body.sourceGmailMessageId,
    sendAt: new Date(body.sendAt),
    payload: {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      body: body.body,
      from: body.from,
      uploadIds: body.uploadIds,
      forwardAttachmentIds: body.keepAttachmentIds,
      replyAll: body.replyAll,
      includeQuote: body.includeQuote,
      quotedText: body.quotedText,
      draftId: body.draftId,
    },
  });
  return c.json(result, 201);
});

composeRoutes.get("/scheduled", async (c) => {
  const account = c.req.query("account");
  const accountId = account ? apiSchemas.UploadParams.shape.accountId.parse(account) : undefined;
  const items = await listScheduled({ accountId });
  return c.json({ items });
});

// The toast's Undo, or a cancel from the list.
composeRoutes.delete("/scheduled/:id", async (c) => {
  const { id } = apiSchemas.ScheduledSendIdParams.parse({ id: c.req.param("id") });
  return c.json(await cancelScheduled(id));
});

// A new time — also how a failed send is given another go.
composeRoutes.patch("/scheduled/:id", async (c) => {
  const { id } = apiSchemas.ScheduledSendIdParams.parse({ id: c.req.param("id") });
  const body = apiSchemas.RescheduleRequest.parse(await c.req.json());
  return c.json(await reschedule({ id, sendAt: new Date(body.sendAt) }));
});
