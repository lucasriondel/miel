/**
 * Prompt builders for the AI tasks.
 *
 * Triage has two variants because the two transports have different powers
 * (#105). The Claude Code CLI runs with `allowedTools: ["Bash"]` and can curl a
 * message body out of the local API when sender + subject are not enough; a
 * hosted vendor gets no tools, so that paragraph would be dead text — and it
 * carries `API_SECRET`, which has no business being posted to a third party.
 *
 * Neither variant inlines a body. `claudeUsage.ts` publishes that triage sends
 * sender/subject/snippet/labels and fetches a body only on demand, and the
 * landing page derives its disclosure from that module; inlining bodies for
 * hosted providers would make a public statement false. The cost is that hosted
 * triage is marginally weaker on ambiguous messages, which both prompts already
 * tolerate ("a body is never required for a result").
 *
 * The filter-suggest prompt still branches on whether the user supplied an
 * instruction, and the reply prompt is unchanged.
 */
import { getEnv } from "../env";
import type { FilterSuggestInputT } from "../schemas/filterSuggest";
import type { ReplyGenInputT } from "../schemas/reply";
import type { TriageInputT } from "../schemas/triage";

/** Everything both triage variants say, in order, minus the closing messages. */
function triagePreamble(input: TriageInputT): string[] {
  return [
    "You are an email triage assistant. Classify each message and return strict JSON matching the provided schema.",
    "",
    `Account: ${input.account}`,
    `Existing labels (verbatim names): ${JSON.stringify(input.existingLabels)}`,
    "",
    "Rules:",
    "- For each input message, produce exactly one results entry with the same id.",
    "- priority: 'high' for time-sensitive personal correspondence, money/legal matters, or anything requiring action soon; 'medium' for newsletters worth reading, account notices, normal work threads; 'low' for marketing, automated noise.",
    "- applyExistingLabels: zero or more names drawn EXACTLY from the existing labels list above (case-sensitive).",
    "- suggestNewLabels: propose new labels only when no existing label fits and the theme is recurring. Keep names short (<=40 chars). Reasoning is one sentence.",
    "- reasoning: one or two sentences explaining the priority choice.",
    "",
    "Each message gives you only sender (from), subject, snippet, and current labels.",
  ];
}

const triageMessages = (input: TriageInputT): string[] => [
  "",
  "Messages JSON:",
  JSON.stringify(input.messages),
];

/** The CLI variant: has Bash, so it may fetch a body it genuinely needs. */
export function buildTriagePrompt(input: TriageInputT): string {
  const { API_SECRET, API_PORT } = getEnv();
  return [
    ...triagePreamble(input),
    "This is enough for almost every message. ONLY when you genuinely cannot decide",
    "priority/labels from these (ambiguous sender, empty subject, newsletter-vs-real,",
    "etc.) may you fetch the full message body via the local API:",
    "",
    `  curl -s -H "Authorization: Bearer ${API_SECRET}" \\`,
    `    http://localhost:${API_PORT}/api/messages/${input.accountId}/<id>`,
    "",
    "Use the message's id field as <id>. The response is JSON with bodyText/bodyHtml.",
    "Do NOT fetch bodies you do not need — each fetch is slow and costly. If a fetch",
    "fails, classify from sender + subject anyway; a body is never required for a result.",
    ...triageMessages(input),
  ].join("\n");
}

/**
 * The hosted variant: no tools, so no escape hatch and no bearer token. It is
 * told outright that this is all it gets, so it commits rather than hedging.
 */
export function buildHostedTriagePrompt(input: TriageInputT): string {
  return [
    ...triagePreamble(input),
    "That is all you get: there is no way to fetch the full body, and none is needed.",
    "Classify from sender + subject + snippet even when they are ambiguous — pick the",
    "most likely priority and say so in one sentence; a body is never required for a result.",
    ...triageMessages(input),
  ].join("\n");
}

export function buildFilterSuggestPrompt(input: FilterSuggestInputT): string {
  const hasInstruction = Boolean(input.userInstruction?.trim());

  const intro = hasInstruction
    ? "You design a Gmail filter from a single message the user picked. Propose a filter that would auto-apply a label to similar future messages. Return strict JSON matching the schema."
    : "You design Gmail filters. Given a batch of recently fetched messages, propose Gmail filters that would auto-apply an existing label to similar future messages. Return strict JSON matching the schema.";

  // Without an instruction (batch path) labels must come from the existing list.
  // With an instruction, follow it — the user may ask for a brand-new label.
  const labelRule = hasInstruction
    ? "- addLabelName: prefer an EXACT name from the existing labels list (case-sensitive). Only propose a different name if the user instruction clearly asks for a label that does not exist yet."
    : "- addLabelName MUST be drawn EXACTLY from the existing labels list (case-sensitive). Never invent a new label here.";

  const matchRule = hasInstruction
    ? "- Base the filter on the single message below: pick the strongest recurring signal (sender domain/address or distinctive subject pattern) that future similar messages would also share."
    : "- Only suggest a filter when at least two messages share a recurring sender domain, sender address, or distinctive subject pattern that is well-handled by exactly one existing label.";

  return [
    intro,
    "",
    `Account: ${input.account}`,
    `Existing labels (verbatim names): ${JSON.stringify(input.existingLabels)}`,
    `Existing filters (do NOT duplicate): ${JSON.stringify(input.existingFilters)}`,
    ...(hasInstruction ? ["", "User instruction (follow it):", input.userInstruction!.trim()] : []),
    "",
    "Rules:",
    matchRule,
    labelRule,
    "- Prefer the narrowest precise criterion. If sender is the strong signal, use criteriaFrom (an address or @domain.tld). Use criteriaSubject only for subject patterns. Use criteriaQuery only when sender/subject alone do not capture the pattern.",
    "- Never duplicate one of the existing filters above.",
    "- reasoning: one short sentence citing the pattern you saw.",
    "- If nothing meets the bar, return an empty suggestions array.",
    "",
    "Messages JSON:",
    JSON.stringify(input.messages),
  ].join("\n");
}

export function buildReplyPrompt(input: ReplyGenInputT): string {
  return [
    "You draft a reply email. Return strict JSON matching the schema: { subject, body }.",
    "",
    `Original from: ${input.from}`,
    `Original to: ${JSON.stringify(input.to)}`,
    `Original subject: ${input.subject ?? ""}`,
    "",
    "Original body:",
    input.body,
    "",
    "User instruction for the reply:",
    input.userInstruction,
    "",
    "Guidelines:",
    "- Subject: keep the original subject prefixed with 'Re: ' unless one is already present.",
    "- Body: plain text, no signature block (the user adds their own), no greeting placeholders like [Name]. Be concise and match the user's instruction.",
  ].join("\n");
}
