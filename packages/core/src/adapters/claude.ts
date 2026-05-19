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
import { getModelSettings } from "../services/settings";
import { spawnCapture, ShellError } from "./shell";

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
}

interface ClaudeEnvelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
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
  const { stdout, stderr, exitCode } = await spawnCapture({ cmd });
  if (exitCode !== 0) {
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
    throw new ShellError(
      `claude reported error: ${envelope.result ?? "(no result string)"}`,
      exitCode,
      stderr,
      stdout,
      cmd,
    );
  }
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
  let inner: unknown;
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
  const output = args.parser(inner);
  const runId =
    (typeof envelope.session_id === "string" && envelope.session_id) ||
    (typeof envelope.uuid === "string" && envelope.uuid) ||
    "";
  const modelUsed =
    typeof envelope.model === "string" && envelope.model
      ? envelope.model
      : args.model;
  return { output, runId, model: modelUsed };
}

export function createClaudeAdapter(): ClaudeAdapter {
  return {
    async runTriage(input) {
      const { triageModel } = await getModelSettings();
      const jsonSchema = zodToJsonSchema(TriageOutput, {
        target: "jsonSchema7",
      });
      return invokeClaude({
        prompt: buildTriagePrompt(input),
        model: triageModel,
        schema: jsonSchema,
        parser: (raw) => TriageOutput.parse(raw),
      });
    },
    async generateReply(input) {
      const { replyModel } = await getModelSettings();
      const jsonSchema = zodToJsonSchema(ReplyGenOutput, {
        target: "jsonSchema7",
      });
      return invokeClaude({
        prompt: buildReplyPrompt(input),
        model: replyModel,
        schema: jsonSchema,
        parser: (raw) => ReplyGenOutput.parse(raw),
      });
    },
  };
}
