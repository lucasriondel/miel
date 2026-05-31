import { zodToJsonSchema } from "zod-to-json-schema";
import { getEnv } from "../env";
import {
  ReplyGenOutput,
  type ReplyGenInputT,
  type ReplyGenOutputT,
} from "../schemas/reply";
import {
  TriageOutput,
  type TriageInputT,
  type TriageOutputT,
} from "../schemas/triage";
import {
  FilterSuggestOutput,
  type FilterSuggestInputT,
  type FilterSuggestOutputT,
} from "../schemas/filterSuggest";
import { getModelSettings } from "../services/settings";
import { createDebug } from "../util/debug";
import { spawnCapture, ShellError, ClaudeNotLoggedInError } from "./shell";
import { isClaudeNotLoggedInResult } from "./claudeAuth";

const debug = createDebug("adapter:claude");

export interface ClaudeRunResult<T> {
  output: T;
  runId: string;
  model: string;
}

export interface ClaudeAdapter {
  runTriage(input: TriageInputT): Promise<ClaudeRunResult<TriageOutputT>>;
  generateReply(
    input: ReplyGenInputT,
  ): Promise<ClaudeRunResult<ReplyGenOutputT>>;
  runFilterSuggest(
    input: FilterSuggestInputT,
  ): Promise<ClaudeRunResult<FilterSuggestOutputT>>;
}

interface ClaudeEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  session_id?: string;
  uuid?: string;
  model?: string;
  [k: string]: unknown;
}

function buildTriagePrompt(input: TriageInputT): string {
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
    "Messages JSON:",
    JSON.stringify(input.messages),
  ].join("\n");
}

function buildFilterSuggestPrompt(input: FilterSuggestInputT): string {
  return [
    "You design Gmail filters. Given a batch of recently fetched messages, propose Gmail filters that would auto-apply an existing label to similar future messages. Return strict JSON matching the schema.",
    "",
    `Account: ${input.account}`,
    `Existing labels (verbatim names): ${JSON.stringify(input.existingLabels)}`,
    `Existing filters (do NOT duplicate): ${JSON.stringify(input.existingFilters)}`,
    "",
    "Rules:",
    "- Only suggest a filter when at least two messages share a recurring sender domain, sender address, or distinctive subject pattern that is well-handled by exactly one existing label.",
    "- addLabelName MUST be drawn EXACTLY from the existing labels list (case-sensitive). Never invent a new label here.",
    "- Prefer the narrowest precise criterion. If sender is the strong signal, use criteriaFrom (an address or @domain.tld). Use criteriaSubject only for subject patterns. Use criteriaQuery only when sender/subject alone do not capture the pattern.",
    "- Never duplicate one of the existing filters above.",
    "- reasoning: one short sentence citing the pattern you saw.",
    "- If nothing meets the bar, return an empty suggestions array.",
    "",
    "Messages JSON:",
    JSON.stringify(input.messages),
  ].join("\n");
}

function buildReplyPrompt(input: ReplyGenInputT): string {
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

async function invokeClaude<T>(args: {
  prompt: string;
  model: string;
  schema: object;
  parser: (raw: unknown) => T;
  kind: string;
}): Promise<ClaudeRunResult<T>> {
  const { CLAUDE_BIN } = getEnv();
  const cmd = [
    CLAUDE_BIN,
    "-p",
    "--output-format=json",
    `--model=${args.model}`,
    `--json-schema=${JSON.stringify(args.schema)}`,
    args.prompt,
  ];
  debug("invoke", {
    kind: args.kind,
    model: args.model,
    promptLen: args.prompt.length,
  });
  const startedAt = Date.now();
  const { stdout, stderr, exitCode } = await spawnCapture({ cmd });
  debug("invoke returned", {
    kind: args.kind,
    exitCode,
    ms: Date.now() - startedAt,
    stdoutBytes: stdout.length,
  });
  // "Not logged in" surfaces as exitCode 1 with a JSON envelope on stdout
  // (is_error:true, result:"Not logged in · Please run /login"). Detect it before
  // any other ShellError so it can drive the web login flow, not a generic error.
  const throwIfNotLoggedIn = (): void => {
    if (isClaudeNotLoggedInResult(stdout) || isClaudeNotLoggedInResult(stderr)) {
      throw new ClaudeNotLoggedInError(
        new ShellError("claude is not logged in", exitCode, stderr, stdout, cmd),
      );
    }
  };
  if (exitCode !== 0) {
    throwIfNotLoggedIn();
    throw new ShellError(
      `claude exited with ${exitCode}`,
      exitCode,
      stderr,
      stdout,
      cmd,
    );
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ShellError(
      "claude produced no stdout",
      exitCode,
      stderr,
      stdout,
      cmd,
    );
  }
  let envelope: ClaudeEnvelope;
  try {
    envelope = JSON.parse(trimmed) as ClaudeEnvelope;
  } catch (err) {
    throw new ShellError(
      `Failed to parse claude envelope JSON: ${(err as Error).message}`,
      exitCode,
      stderr,
      stdout,
      cmd,
    );
  }
  if (envelope.is_error) {
    throwIfNotLoggedIn();
    throw new ShellError(
      `claude reported error: ${envelope.result ?? "(no result string)"}`,
      exitCode,
      stderr,
      stdout,
      cmd,
    );
  }
  let inner: unknown;
  if (envelope.structured_output !== undefined) {
    inner = envelope.structured_output;
  } else {
    const resultStr = envelope.result;
    if (typeof resultStr !== "string" || !resultStr.trim()) {
      throw new ShellError(
        "claude envelope missing result string",
        exitCode,
        stderr,
        stdout,
        cmd,
      );
    }
    try {
      inner = JSON.parse(resultStr);
    } catch (err) {
      throw new ShellError(
        `Failed to parse claude result JSON: ${(err as Error).message}`,
        exitCode,
        stderr,
        stdout,
        cmd,
      );
    }
  }
  const output = args.parser(inner);
  const runId =
    (typeof envelope.session_id === "string" && envelope.session_id) ||
    (typeof envelope.uuid === "string" && envelope.uuid) ||
    "";
  const modelUsed =
    typeof envelope.model === "string" && envelope.model
      ? envelope.model
      : args.model;
  debug("invoke parsed", {
    kind: args.kind,
    model: modelUsed,
    runId,
  });
  return { output, runId, model: modelUsed };
}

export function createClaudeAdapter(): ClaudeAdapter {
  return {
    async runTriage(input) {
      debug("runTriage", {
        account: input.account,
        messages: input.messages.length,
        existingLabels: input.existingLabels.length,
      });
      const { triageModel } = await getModelSettings();
      const jsonSchema = zodToJsonSchema(TriageOutput, {
        target: "jsonSchema7",
      });
      const result = await invokeClaude({
        prompt: buildTriagePrompt(input),
        model: triageModel,
        schema: jsonSchema,
        parser: (raw) => TriageOutput.parse(raw),
        kind: "triage",
      });
      debug("runTriage done", {
        account: input.account,
        results: result.output.results.length,
        runId: result.runId,
      });
      return result;
    },
    async runFilterSuggest(input) {
      debug("runFilterSuggest", {
        account: input.account,
        messages: input.messages.length,
        existingFilters: input.existingFilters.length,
      });
      const { filterModel } = await getModelSettings();
      const jsonSchema = zodToJsonSchema(FilterSuggestOutput, {
        target: "jsonSchema7",
      });
      const result = await invokeClaude({
        prompt: buildFilterSuggestPrompt(input),
        model: filterModel,
        schema: jsonSchema,
        parser: (raw) => FilterSuggestOutput.parse(raw),
        kind: "filterSuggest",
      });
      debug("runFilterSuggest done", {
        account: input.account,
        suggestions: result.output.suggestions.length,
        runId: result.runId,
      });
      return result;
    },
    async generateReply(input) {
      debug("generateReply", {
        from: input.from,
        to: input.to,
        subject: input.subject,
        bodyLen: input.body.length,
        instructionLen: input.userInstruction.length,
      });
      const { replyModel } = await getModelSettings();
      const jsonSchema = zodToJsonSchema(ReplyGenOutput, {
        target: "jsonSchema7",
      });
      const result = await invokeClaude({
        prompt: buildReplyPrompt(input),
        model: replyModel,
        schema: jsonSchema,
        parser: (raw) => ReplyGenOutput.parse(raw),
        kind: "reply",
      });
      debug("generateReply done", {
        subjectLen: result.output.subject.length,
        bodyLen: result.output.body.length,
        runId: result.runId,
      });
      return result;
    },
  };
}
