import { z } from "zod";

export const FilterSuggestInputMessage = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  currentLabels: z.array(z.string()),
});
export type FilterSuggestInputMessageT = z.infer<typeof FilterSuggestInputMessage>;

export const FilterSuggestInput = z.object({
  account: z.string().email(),
  existingLabels: z.array(z.string()),
  existingFilters: z.array(
    z.object({
      criteriaFrom: z.string().optional(),
      criteriaSubject: z.string().optional(),
      criteriaQuery: z.string().optional(),
      addLabelName: z.string().optional(),
    }),
  ),
  messages: z.array(FilterSuggestInputMessage).min(1).max(100),
  /**
   * Free-text steer from the user (e.g. from the "Filter similar" popover).
   * When present, Claude follows it and MAY propose a label name that is not in
   * the existing list — the new label is created on accept.
   */
  userInstruction: z.string().optional(),
});
export type FilterSuggestInputT = z.infer<typeof FilterSuggestInput>;

export const FilterSuggestItem = z.object({
  criteriaFrom: z.string().optional().nullable(),
  criteriaSubject: z.string().optional().nullable(),
  criteriaQuery: z.string().optional().nullable(),
  addLabelName: z.string().min(1).max(80),
  reasoning: z.string(),
});
export type FilterSuggestItemT = z.infer<typeof FilterSuggestItem>;

export const FilterSuggestOutput = z.object({
  suggestions: z.array(FilterSuggestItem),
});
export type FilterSuggestOutputT = z.infer<typeof FilterSuggestOutput>;
