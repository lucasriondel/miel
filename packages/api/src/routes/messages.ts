import { Hono } from "hono";
import {
  AttachmentNotFoundError,
  apiSchemas,
  applyLabels,
  applySuggestions,
  archiveMessage,
  batchModifyMessages,
  downloadAttachment,
  generateReply,
  getMessageDetail,
  listMessages,
  sendReply,
  sendToWorp,
  setMessageRead,
  setMessagePriority,
  suggestFilterForMessage,
  trashMessage,
} from "@miel/core";

export const messagesRoutes = new Hono();

messagesRoutes.get("/", async (c) => {
  const q = apiSchemas.ListMessagesQuery.parse({
    account: c.req.query("account"),
    priority: c.req.query("priority"),
    label: c.req.query("label"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
    includeArchived: c.req.query("includeArchived"),
    includeTrashed: c.req.query("includeTrashed"),
    includeRemoved: c.req.query("includeRemoved"),
    internalDateFrom: c.req.query("internalDateFrom"),
    internalDateTo: c.req.query("internalDateTo"),
  });
  const result = await listMessages({
    accountId: q.account,
    priority: q.priority,
    labelId: q.label,
    limit: q.limit,
    cursor: q.cursor,
    includeArchived: q.includeArchived,
    includeTrashed: q.includeTrashed,
    includeRemoved: q.includeRemoved,
    internalDateFrom: q.internalDateFrom,
    internalDateTo: q.internalDateTo,
  });
  return c.json(result);
});

messagesRoutes.post("/batch", async (c) => {
  const body = apiSchemas.BatchMessageActionRequest.parse(await c.req.json());
  const result = await batchModifyMessages({
    accountId: body.accountId,
    gmailMessageIds: body.gmailMessageIds,
    action: body.action,
  });
  return c.json(result);
});

messagesRoutes.get("/:accountId/:gmailMessageId", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const detail = await getMessageDetail({ accountId, gmailMessageId });
  if (!detail) {
    return c.json({ error: "message_not_found" }, 404);
  }
  return c.json(detail);
});

messagesRoutes.post("/:accountId/:gmailMessageId/labels", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.ModifyLabelsRequest.parse(await c.req.json());
  const result = await applyLabels({
    accountId,
    gmailMessageId,
    addLabelIds: body.add,
    removeLabelIds: body.remove,
  });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/apply-suggestions", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.ApplySuggestionsRequest.parse(await c.req.json());
  const result = await applySuggestions({
    accountId,
    gmailMessageId,
    triageId: body.triageId,
    acceptExistingLabelIds: body.acceptExistingLabelIds,
    acceptNewSuggestionIds: body.acceptNewSuggestionIds,
  });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/archive", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const result = await archiveMessage({ accountId, gmailMessageId });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/read", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.SetMessageReadRequest.parse(await c.req.json());
  const result = await setMessageRead({
    accountId,
    gmailMessageId,
    read: body.read,
  });
  return c.json(result);
});

messagesRoutes.delete("/:accountId/:gmailMessageId", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const result = await trashMessage({ accountId, gmailMessageId });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/generate-reply", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.GenerateReplyRequest.parse(await c.req.json());
  const result = await generateReply({
    accountId,
    gmailMessageId,
    prompt: body.prompt,
  });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/send-reply", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.SendReplyRequest.parse(await c.req.json());
  const result = await sendReply({
    accountId,
    gmailMessageId,
    subject: body.subject,
    body: body.body,
    to: body.to,
    cc: body.cc,
  });
  return c.json(result);
});

messagesRoutes.post("/:accountId/:gmailMessageId/filter-suggest", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.SuggestFilterRequest.parse(await c.req.json().catch(() => ({})));
  const result = await suggestFilterForMessage({
    accountId,
    gmailMessageId,
    prompt: body.prompt,
  });
  return c.json(result);
});

messagesRoutes.get("/:accountId/:gmailMessageId/attachments/:attachmentId", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const attachmentId = c.req.param("attachmentId");
  try {
    const att = await downloadAttachment({
      accountId,
      gmailMessageId,
      attachmentId,
    });
    const safeName = (att.filename || "attachment").replace(/["\\]/g, "_");
    // Copy into a fresh ArrayBuffer so we don't hand the response the whole
    // Uint8Array's underlying buffer (Node/Bun sometimes ships a shared one).
    const body = new ArrayBuffer(att.data.byteLength);
    new Uint8Array(body).set(att.data);
    return new Response(body, {
      headers: {
        "Content-Type": att.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(att.size),
      },
    });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return c.json({ error: "attachment_not_found" }, 404);
    }
    throw err;
  }
});

messagesRoutes.post(
  "/:accountId/:gmailMessageId/attachments/:attachmentId/send-to-worp",
  async (c) => {
    const accountId = c.req.param("accountId");
    const gmailMessageId = c.req.param("gmailMessageId");
    const attachmentId = c.req.param("attachmentId");
    const body = apiSchemas.SendToWorpRequest.parse(await c.req.json());
    try {
      const result = await sendToWorp({
        accountId,
        gmailMessageId,
        attachmentId,
        flow: body.flow,
      });
      return c.json({ ok: true, result });
    } catch (err) {
      if (err instanceof AttachmentNotFoundError) {
        return c.json({ error: "attachment_not_found" }, 404);
      }
      throw err;
    }
  },
);

messagesRoutes.post("/:accountId/:gmailMessageId/priority", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.SetMessagePriorityRequest.parse(await c.req.json());
  const result = await setMessagePriority({
    accountId,
    gmailMessageId,
    priority: body.priority,
  });
  return c.json(result);
});
