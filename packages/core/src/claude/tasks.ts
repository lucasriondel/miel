/**
 * The task table — everything triage, reply and promo-extract each need, in
 * one place, keyed by task (#128).
 *
 * The `Claude` service used to carry one method per task, and each of them
 * repeated the same four steps with three different nouns: resolve the
 * provider, branch on hosted-vs-CLI, pick a prompt builder, name a schema. A
 * fourth task cost an edit in five places, and the drift that costs is not
 * hypothetical — the CLI prompt and the hosted prompt differ on purpose, and
 * nothing but a reader's attention kept the wrong one out of the wrong
 * transport.
 *
 * So the differences are data and the transports are code. A row holds:
 *
 * - `output` — the task's output contract as an `effect` Schema: the JSON
 *   Schema both transports constrain the model with, and the decode both
 *   validate the answer through. A violation is the model breaking its output
 *   contract — `ClaudeSchemaError` from the CLI, `HostedApiError` from a
 *   vendor, exactly as before.
 * - `cliPrompt` / `hostedPrompt` — deliberately two columns, not one. The CLI
 *   runs with tools and may be told to curl a message body out of the local
 *   API; the hosted transport has none, so that paragraph would be dead text
 *   posting `API_SECRET` to a third party (#105). Where a task has nothing to
 *   say differently, the same builder sits in both columns — which is a
 *   statement, not an omission.
 * - `hostedInstruction` — the one-line user turn the hosted transport puts on
 *   top of the prompt, which is a system message there.
 * - `allowedTools` — the CLI transport's `--allowedTools`, and empty for every
 *   task that has no escape hatch to reach for.
 *
 * `satisfies Record<ModelTask, …>` is what makes "adding a task means adding a
 * row" true rather than aspirational: a new `ModelTask` does not compile
 * until it has one.
 */
import type { Schema } from "effect";
import type { ModelTask } from "../providerModels";
import { PromoExtractOutput } from "../schemas/promo";
import { ReplyGenOutput } from "../schemas/reply";
import { TriageOutput } from "../schemas/triage";
import {
  buildHostedTriagePrompt,
  buildPromoExtractPrompt,
  buildReplyPrompt,
  buildTriagePrompt,
} from "./prompts";

/**
 * A task's output contract: a Schema whose encoded form is a JSON object, which
 * is what both transports ask the model for, and which needs no service to
 * decode.
 */
export type TaskOutputSchema = Schema.Codec<unknown, Record<string, unknown>, never, never>;

/** The task table shape — everything one named task needs, as data. */
export interface TaskSpec<Input, Output extends TaskOutputSchema> {
  readonly output: Output;
  /** The prompt for the CLI transport, which has `allowedTools`. */
  readonly cliPrompt: (input: Input) => string;
  /** The prompt for the hosted transport, which has no tools at all. */
  readonly hostedPrompt: (input: Input) => string;
  readonly hostedInstruction: string;
  readonly allowedTools: readonly string[];
}

export const CLAUDE_TASKS = {
  triage: {
    output: TriageOutput,
    cliPrompt: buildTriagePrompt,
    // The one task whose two prompts genuinely differ: only the CLI can act on
    // the body-fetch escape hatch, and only the CLI may be handed the secret
    // that fetch needs.
    hostedPrompt: buildHostedTriagePrompt,
    hostedInstruction: "Return the triage analysis as JSON.",
    // Bash, so the model can curl the body API when sender + subject alone are
    // not enough (see `buildTriagePrompt`).
    allowedTools: ["Bash"],
  },
  reply: {
    output: ReplyGenOutput,
    cliPrompt: buildReplyPrompt,
    // One builder in both columns: the reply prompt inlines the (truncated)
    // body it was given and asks for no tool, so both transports can run it.
    hostedPrompt: buildReplyPrompt,
    hostedInstruction: "Generate the reply as JSON.",
    allowedTools: [],
  },
  // The third task (#156), and the row that shows what the table is for: it
  // cost this entry and no copy of the transport branch.
  "promo-extract": {
    output: PromoExtractOutput,
    cliPrompt: buildPromoExtractPrompt,
    // The same builder twice, on purpose and not by omission: the task inlines
    // the mail's visible text and has no tool to reach for, so a CLI variant
    // would have nothing to add but triage's body-fetch paragraph — which
    // carries `API_SECRET` and must never be a prompt a vendor could receive.
    hostedPrompt: buildPromoExtractPrompt,
    hostedInstruction: "Return the extracted promo codes as JSON.",
    allowedTools: [],
  },
} as const satisfies Record<ModelTask, TaskSpec<never, TaskOutputSchema>>;

/** What the task's prompt builders take — the caller's `input`. */
export type ClaudeTaskInput<K extends ModelTask> = Parameters<
  (typeof CLAUDE_TASKS)[K]["cliPrompt"]
>[0];

/** What the task's Schema yields once the model's answer has been decoded. */
export type ClaudeTaskOutput<K extends ModelTask> = (typeof CLAUDE_TASKS)[K]["output"]["Type"];

/**
 * A task's row, typed to that task's own input and output.
 *
 * Indexing the table with a type parameter gives a union of rows, which no
 * caller can apply to a single input; the cast lives here, once, instead of at
 * each transport. `K` is what ties the input the caller passed to the output
 * they get back, and that pairing is checked at the call site.
 */
export const claudeTaskSpec = <K extends ModelTask>(
  task: K,
): TaskSpec<ClaudeTaskInput<K>, Schema.Codec<ClaudeTaskOutput<K>, Record<string, unknown>>> =>
  CLAUDE_TASKS[task] as unknown as TaskSpec<
    ClaudeTaskInput<K>,
    Schema.Codec<ClaudeTaskOutput<K>, Record<string, unknown>>
  >;
