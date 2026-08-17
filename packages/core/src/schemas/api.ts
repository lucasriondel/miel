import { z } from "zod";
import { CREDENTIAL_PROVIDERS } from "../credentialProviders";
import { MIN_KEY_LENGTH } from "../credentialMasking";
import { PROVIDERS } from "../providerModels";

// Accept either an ISO-8601 datetime (e.g. 2025-01-01T00:00:00Z) or a
// date-only string (e.g. 2025-01-01). The sync pill sends date-only; all
// consumers normalize via `new Date(...)`, which handles both.
const dateOrDateTime = z
  .string()
  .refine(
    (s) => z.string().datetime().safeParse(s).success || z.string().date().safeParse(s).success,
    { message: "Expected an ISO-8601 datetime or date (YYYY-MM-DD)" },
  );

export const DateRange = z.object({
  from: dateOrDateTime,
  to: dateOrDateTime,
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
  includeRemoved: z.coerce.boolean().default(false),
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
  // Edited in the compose window (#96) and optional so a client that names no
  // recipients still gets the stored message's default. Named, they have to be
  // real: an empty list is a client that cleared the To field, not one that
  // wants the reply addressed by the server.
  to: z.array(z.string().min(1)).min(1).optional(),
  cc: z.array(z.string().min(1)).optional(),
});
export type SendReplyRequestT = z.infer<typeof SendReplyRequest>;

export const SetMessageReadRequest = z.object({
  read: z.boolean(),
});
export type SetMessageReadRequestT = z.infer<typeof SetMessageReadRequest>;

export const SetMessagePriorityRequest = z.object({
  priority: z.enum(["high", "medium", "low"]),
});
export type SetMessagePriorityRequestT = z.infer<typeof SetMessagePriorityRequest>;

// DELETE carries no body, so the route assembles this from the path param +
// query string. `gmailFilterId` is Gmail's own opaque id, not a uuid.
export const DeleteFilterRequest = z.object({
  accountId: z.string().uuid(),
  gmailFilterId: z.string().min(1),
});
export type DeleteFilterRequestT = z.infer<typeof DeleteFilterRequest>;

// Merging N filters into one. Two is the smallest set that means anything, and
// it's rejected here as well as in the service — the service is the one that
// sees duplicate ids collapse below the floor. The upper bound is the merged
// `query` criterion: every source adds a term to one Gmail search expression.
export const MergeFiltersRequest = z.object({
  accountId: z.string().uuid(),
  gmailFilterIds: z.array(z.string().min(1)).min(2, "Merging needs at least 2 filters.").max(50),
});
export type MergeFiltersRequestT = z.infer<typeof MergeFiltersRequest>;

export const SuggestFilterRequest = z.object({
  prompt: z.string().max(2000).optional(),
});
export type SuggestFilterRequestT = z.infer<typeof SuggestFilterRequest>;

export const BatchMessageActionRequest = z.object({
  accountId: z.string().uuid(),
  gmailMessageIds: z.array(z.string().min(1)).min(1).max(1000),
  action: z.enum(["read", "unread", "archive", "trash"]),
});
export type BatchMessageActionRequestT = z.infer<typeof BatchMessageActionRequest>;

export const SendToWorpRequest = z.object({
  flow: z.enum(["personal", "pro"]),
});
export type SendToWorpRequestT = z.infer<typeof SendToWorpRequest>;

// The provider enum is the catalogue's own list (#105), so a vendor added there
// is accepted here without a second edit. The model is only shape-checked at
// this layer: whether an id belongs to the chosen provider depends on the
// provider the patch may not name, so the route resolves the pair.
export const UpdateSettingsRequest = z.object({
  triageModel: z.string().min(1).optional(),
  triageProvider: z.enum(PROVIDERS).optional(),
  replyModel: z.string().min(1).optional(),
  replyProvider: z.enum(PROVIDERS).optional(),
  filterModel: z.string().min(1).optional(),
  filterProvider: z.enum(PROVIDERS).optional(),
});
export type UpdateSettingsRequestT = z.infer<typeof UpdateSettingsRequest>;

export const UpdateScheduleSettingsRequest = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(1).optional(),
  since: z.string().min(1).optional(),
});
export type UpdateScheduleSettingsRequestT = z.infer<typeof UpdateScheduleSettingsRequest>;

export const UpdateTriageBatchSettingsRequest = z.object({
  batchSize: z.number().int().min(1).max(50).optional(),
  batchConcurrency: z.number().int().min(1).max(10).optional(),
});
export type UpdateTriageBatchSettingsRequestT = z.infer<typeof UpdateTriageBatchSettingsRequest>;

// The vendor whose key is being set/read, taken from the path. Kept as an enum
// so an unknown vendor is a 400 at the edge rather than a row the service would
// have to reject.
export const ProviderCredentialParam = z.object({
  provider: z.enum(CREDENTIAL_PROVIDERS),
});
export type ProviderCredentialParamT = z.infer<typeof ProviderCredentialParam>;

// The key is `.trim()`ed here as well as in the service: a pasted key routinely
// carries a trailing newline, and " " must fail the min-length check rather
// than be stored as a one-character credential. No max — vendors set their own
// key lengths and a future one may be longer than anything we'd guess.
//
// The minimum is the service's own constant rather than a literal, so the edge
// and the setter cannot drift apart — and so worp's key below can be held to the
// same bar instead of a second spelling of it (#118).
export const SetProviderCredentialRequest = z.object({
  apiKey: z.string().trim().min(MIN_KEY_LENGTH),
});
export type SetProviderCredentialRequestT = z.infer<typeof SetProviderCredentialRequest>;

// worp's settings (#107). A patch: an omitted field is left as stored, which is
// what lets the UI save the base URL without re-sending the key it never had.
//
// The shape rules live here; the semantic ones (is the URL http(s), is a header
// name a valid token, is it one miel sets itself) live in `worpConfig.ts` and
// are applied by the service, so the CLI cannot route around them.
export const UpdateWorpSettingsRequest = z.object({
  // Empty is meaningful and must survive: it is how worp is turned off.
  baseUrl: z.string().trim().optional(),
  // `null` clears the stored key; a string sets it. Undefined leaves it alone —
  // distinct from null, which is why this is nullable rather than just optional.
  //
  // A string that is neither of those is held to the same minimum as the two
  // credentials above (#118): worp's gate is meant to catch a misconfiguration
  // at configuration time, and a key too short to be one used to sail through it
  // and fail at the relay instead. The empty string is exempt because it is not
  // a key — it is the UI's other way of saying "clear it", like `null`.
  apiKey: z
    .string()
    .trim()
    .refine((v) => v.length === 0 || v.length >= MIN_KEY_LENGTH, {
      message: `A key must be at least ${MIN_KEY_LENGTH} characters, or empty to clear it.`,
    })
    .nullable()
    .optional(),
  // A patch over the stored header map, not a replacement (#119): `null`
  // removes that header, a string sets it, an unnamed one is left alone — which
  // is what lets the UI remove one header without re-sending values it was
  // never given. Values are otherwise unconstrained (any string may be a
  // legitimate token) but names are checked against the HTTP token rule.
  extraHeaders: z.record(z.string(), z.string().nullable()).optional(),
});
export type UpdateWorpSettingsRequestT = z.infer<typeof UpdateWorpSettingsRequest>;

// The Claude Code token (#109). Same shape and same reasoning as the vendor key
// above — trimmed here as well as in the service, and a minimum length so a
// stray paste is a 400 rather than a stored value that fails on the next sync.
export const SetClaudeCodeTokenRequest = z.object({
  token: z.string().trim().min(MIN_KEY_LENGTH),
});
export type SetClaudeCodeTokenRequestT = z.infer<typeof SetClaudeCodeTokenRequest>;
