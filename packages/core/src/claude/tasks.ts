/**
 * The task table — everything triage, reply and filter-suggest each need, in
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
 * So the differences are data and the transports are code. The row shape is
 * `ai-task-runner-effect`'s `TaskSpec` — the transports themselves moved into
 * that package — and a row holds:
 *
 * - `output` — the task's Zod schema as an `ObjectCodec` ({@link zodCodec}):
 *   the JSON Schema both transports constrain the model with, and the decode
 *   both validate the answer through. A violation is the model breaking its
 *   output contract, which is `ClaudeSchemaError` here exactly as it was.
 * - `cliPrompt` / `hostedPrompt` — deliberately two columns, not one. The CLI
 *   runs with tools and may be told to curl a message body out of the local
 *   API; the hosted transport has none, so that paragraph would be dead text
 *   posting `API_SECRET` to a third party (#105). Where a task has nothing to
 *   say differently, the same builder sits in both columns — which is a
 *   statement, not an omission.
 * - `hostedInstruction` — the one-line user turn the hosted transport puts on
 *   top of the prompt, which is a system message there.
 * - `allowedTools` — the CLI transport's, and empty for every task that has no
 *   escape hatch to reach for.
 *
 * `satisfies Record<ModelTask, …>` is what makes "adding a task means adding a
 * row" true rather than aspirational: a fourth `ModelTask` does not compile
 * until it has one.
 */
import { Effect } from "effect";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ObjectCodec } from "claude-code-effect";
import { taskSpec, type TaskInput, type TaskOutput, type TaskSpec } from "ai-task-runner-effect";
import { ClaudeSchemaError } from "../errors";
import type { ModelTask } from "../providerModels";
import { FilterSuggestOutput } from "../schemas/filterSuggest";
import { ReplyGenOutput } from "../schemas/reply";
import { TriageOutput } from "../schemas/triage";
import {
  buildFilterSuggestPrompt,
  buildHostedTriagePrompt,
  buildReplyPrompt,
  buildTriagePrompt,
} from "./prompts";

/**
 * A task's Zod schema as the output contract both transports share.
 *
 * miel's schemas are Zod end to end — the same objects the API validates with —
 * so they become codecs rather than being restated as Effect schemas: the JSON
 * Schema the transports constrain the model with, and the parser both already
 * shared. The decode fails with miel's own `ClaudeSchemaError`, which is the
 * tag every boundary above keys on.
 */
const zodCodec = <T>(schema: z.ZodType<T>): ObjectCodec<T> => ({
  jsonSchema: zodToJsonSchema(schema, { target: "jsonSchema7" }),
  decode: (payload) =>
    Effect.try({
      try: () => schema.parse(payload),
      catch: (err) =>
        new ClaudeSchemaError({
          issue: (err as Error).message,
          raw: JSON.stringify(payload).slice(0, 2000),
        }),
    }),
});

export const CLAUDE_TASKS = {
  triage: {
    output: zodCodec(TriageOutput),
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
    output: zodCodec(ReplyGenOutput),
    cliPrompt: buildReplyPrompt,
    // One builder in both columns: the reply prompt inlines the (truncated)
    // body it was given and asks for no tool, so both transports can run it.
    hostedPrompt: buildReplyPrompt,
    hostedInstruction: "Generate the reply as JSON.",
    allowedTools: [],
  },
  filter: {
    output: zodCodec(FilterSuggestOutput),
    cliPrompt: buildFilterSuggestPrompt,
    hostedPrompt: buildFilterSuggestPrompt,
    hostedInstruction: "Suggest filters as JSON.",
    allowedTools: [],
  },
} as const satisfies Record<ModelTask, TaskSpec<never, unknown>>;

/** What the task's prompt builders take — the caller's `input`. */
export type ClaudeTaskInput<K extends ModelTask> = TaskInput<typeof CLAUDE_TASKS, K>;

/** What the task's codec yields once the model's answer has been decoded. */
export type ClaudeTaskOutput<K extends ModelTask> = TaskOutput<typeof CLAUDE_TASKS, K>;

/**
 * A task's row, typed to that task's own input and output — the package's
 * `taskSpec` over this table, so the one cast stays where it always was.
 */
export const claudeTaskSpec = <K extends ModelTask>(
  task: K,
): TaskSpec<ClaudeTaskInput<K>, ClaudeTaskOutput<K>> => taskSpec(CLAUDE_TASKS, task);
