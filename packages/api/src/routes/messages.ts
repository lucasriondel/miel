import { Hono } from "hono";
import {
  apiSchemas,
  applyLabels,
  applySuggestions,
  archiveMessage,
  generateReply,
  getMessageDetail,
  listMessages,
  sendReply,
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
  });
  const result = await listMessages({
    accountId: q.account,
    priority: q.priority,
    labelId: q.label,
    limit: q.limit,
    cursor: q.cursor,
    includeArchived: q.includeArchived,
    includeTrashed: q.includeTrashed,
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

messagesRoutes.post(
  "/:accountId/:gmailMessageId/apply-suggestions",
  async (c) => {
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
  },
);

messagesRoutes.post("/:accountId/:gmailMessageId/archive", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const result = await archiveMessage({ accountId, gmailMessageId });
  return c.json(result);
});

messagesRoutes.delete("/:accountId/:gmailMessageId", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const result = await trashMessage({ accountId, gmailMessageId });
  return c.json(result);
});

messagesRoutes.post(
  "/:accountId/:gmailMessageId/generate-reply",
  async (c) => {
    const accountId = c.req.param("accountId");
    const gmailMessageId = c.req.param("gmailMessageId");
    const body = apiSchemas.GenerateReplyRequest.parse(await c.req.json());
    const result = await generateReply({
      accountId,
      gmailMessageId,
      prompt: body.prompt,
    });
    return c.json(result);
  },
);

messagesRoutes.post("/:accountId/:gmailMessageId/send-reply", async (c) => {
  const accountId = c.req.param("accountId");
  const gmailMessageId = c.req.param("gmailMessageId");
  const body = apiSchemas.SendReplyRequest.parse(await c.req.json());
  const result = await sendReply({
    accountId,
    gmailMessageId,
    subject: body.subject,
    body: body.body,
  });
  return c.json(result);
});
