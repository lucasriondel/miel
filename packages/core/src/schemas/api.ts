import { z } from "zod";

export const DateRange = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type DateRangeT = z.infer<typeof DateRange>;

export const SyncRequest = z
  .object({
    account: z.string().email().optional(),
    since: z.string().min(1).optional(),
    range: DateRange.optional(),
    max: z.number().int().positive().max(1000).optional(),
  })
  .refine((v) => !(v.since && v.range), {
    message: "Provide either `since` or `range`, not both.",
    path: ["range"],
  });
export type SyncRequestT = z.infer<typeof SyncRequest>;

export const CreateLabelRequest = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1).max(80),
});
export type CreateLabelRequestT = z.infer<typeof CreateLabelRequest>;

export const ListMessagesQuery = z.object({
  account: z.string().uuid().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  label: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
  includeArchived: z.coerce.boolean().default(false),
  includeTrashed: z.coerce.boolean().default(false),
  internalDateFrom: z.string().datetime().optional(),
  internalDateTo: z.string().datetime().optional(),
});
export type ListMessagesQueryT = z.infer<typeof ListMessagesQuery>;

export const ModifyLabelsRequest = z.object({
  add: z.array(z.string().uuid()).optional(),
  remove: z.array(z.string().uuid()).optional(),
});
export type ModifyLabelsRequestT = z.infer<typeof ModifyLabelsRequest>;

export const ApplySuggestionsRequest = z.object({
  triageId: z.string().uuid(),
  acceptExistingLabelIds: z.array(z.string().uuid()).optional(),
  acceptNewSuggestionIds: z.array(z.string().uuid()).optional(),
});
export type ApplySuggestionsRequestT = z.infer<typeof ApplySuggestionsRequest>;

export const GenerateReplyRequest = z.object({
  prompt: z.string().min(1),
});
export type GenerateReplyRequestT = z.infer<typeof GenerateReplyRequest>;

export const SendReplyRequest = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});
export type SendReplyRequestT = z.infer<typeof SendReplyRequest>;

export const SetMessageReadRequest = z.object({
  read: z.boolean(),
});
export type SetMessageReadRequestT = z.infer<typeof SetMessageReadRequest>;

export const BatchMessageActionRequest = z.object({
  accountId: z.string().uuid(),
  gmailMessageIds: z.array(z.string().min(1)).min(1).max(1000),
  action: z.enum(["read", "archive", "trash"]),
});
export type BatchMessageActionRequestT = z.infer<
  typeof BatchMessageActionRequest
>;

export const UpdateSettingsRequest = z.object({
  triageModel: z.string().min(1).optional(),
  replyModel: z.string().min(1).optional(),
});
export type UpdateSettingsRequestT = z.infer<typeof UpdateSettingsRequest>;
