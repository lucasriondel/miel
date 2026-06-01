import { z } from "zod";

export const GogAccount = z.object({
  email: z.string().email(),
  client: z.string().optional(),
  services: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  auth: z.string().optional(),
});
export type GogAccountT = z.infer<typeof GogAccount>;

export const GogAuthList = z.object({
  accounts: z.array(GogAccount),
});
export type GogAuthListT = z.infer<typeof GogAuthList>;

export const GogLabel = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  messageListVisibility: z.string().optional(),
  labelListVisibility: z.string().optional(),
  color: z
    .object({
      backgroundColor: z.string().optional(),
      textColor: z.string().optional(),
    })
    .optional(),
});
export type GogLabelT = z.infer<typeof GogLabel>;

export const GogLabelListResponse = z.union([
  z.object({ labels: z.array(GogLabel) }),
  z.array(GogLabel),
]);

export const GogSearchHit = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  thread_id: z.string().optional(),
  snippet: z.string().optional(),
  subject: z.string().optional(),
  from: z.string().optional(),
  date: z.string().optional(),
});
export type GogSearchHitT = z.infer<typeof GogSearchHit>;

export const GogSearchResponse = z.union([
  z.object({
    threads: z.array(GogSearchHit).optional(),
    messages: z.array(GogSearchHit).optional(),
    nextPageToken: z.string().optional(),
  }),
  z.array(GogSearchHit),
]);

export const GogHeader = z.object({
  name: z.string(),
  value: z.string(),
});

export const GogMessagePayloadBody = z.object({
  size: z.number().optional(),
  data: z.string().optional(),
  attachmentId: z.string().optional(),
});

export type GogMessagePayloadT = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: z.infer<typeof GogMessagePayloadBody>;
  parts?: GogMessagePayloadT[];
};

export const GogMessagePayload: z.ZodType<GogMessagePayloadT> = z.lazy(() =>
  z.object({
    partId: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(GogHeader).optional(),
    body: GogMessagePayloadBody.optional(),
    parts: z.array(GogMessagePayload).optional(),
  }),
);

export const GogMessageRaw = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  internalDate: z.union([z.string(), z.number()]).optional(),
  payload: GogMessagePayload.optional(),
  historyId: z.string().optional(),
  sizeEstimate: z.number().optional(),
});
export type GogMessageRawT = z.infer<typeof GogMessageRaw>;

export const GogMessageDecoded = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).optional(),
  snippet: z.string().optional(),
  internalDate: z.union([z.string(), z.number()]).optional(),
  subject: z.string().optional().nullable(),
  from: z.string().optional().nullable(),
  to: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  cc: z.union([z.string(), z.array(z.string())]).optional().nullable(),
  date: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  body: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export const GogMessage = z.union([GogMessageDecoded, GogMessageRaw]);
export type GogMessageT = z.infer<typeof GogMessage>;

export const GogCreateLabelResponse = GogLabel;

export const GogFilterCriteria = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    query: z.string().optional(),
    negatedQuery: z.string().optional(),
    hasAttachment: z.boolean().optional(),
    excludeChats: z.boolean().optional(),
    size: z.number().optional(),
    sizeComparison: z.string().optional(),
  })
  .passthrough();
export type GogFilterCriteriaT = z.infer<typeof GogFilterCriteria>;

export const GogFilterAction = z
  .object({
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
    forward: z.string().optional(),
  })
  .passthrough();
export type GogFilterActionT = z.infer<typeof GogFilterAction>;

export const GogFilter = z.object({
  id: z.string(),
  criteria: GogFilterCriteria.optional().default({}),
  action: GogFilterAction.optional().default({}),
});
export type GogFilterT = z.infer<typeof GogFilter>;

// `gog gmail filters create` wraps the new filter under a `filter` key.
export const GogFilterCreateResponse = z.union([
  z.object({ filter: GogFilter }),
  GogFilter,
]);

export const GogFilterListResponse = z.union([
  z.object({ filters: z.array(GogFilter).optional() }),
  z.array(GogFilter),
]);

export const GogSendResponse = z
  .object({
    id: z.string().optional(),
    messageId: z.string().optional(),
    threadId: z.string().optional(),
  })
  .passthrough();
