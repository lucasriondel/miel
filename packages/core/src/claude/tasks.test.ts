// The task table (#128): one row per AI task, holding everything that used to
// be spread across three near-identical service methods — the output schema and
// its parser, the two prompt builders, and the tools the CLI transport is
// allowed to use.
//
// What this suite is for is the *shape* of that knowledge, since the shape is
// the acceptance criterion: a task is a row, so a fourth task is a fourth row
// and nothing else. The per-transport behaviour is Claude.test.ts's and
// hosted.test.ts's (plus the transport's own suite in `ai-task-runner-effect`).
// Run: bun test src/claude/tasks.test.ts
import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
// The CLI triage prompt embeds these; the hosted ones must not.
process.env.API_SECRET = "top-secret-bearer-token";
process.env.API_PORT = "5531";

const { CLAUDE_TASKS, claudeTaskSpec } = await import("./tasks");
// The published list of tasks that put a message body in a prompt (#158). This
// suite is the half that keeps it honest against the prompts themselves.
import { BODY_BEARING_TASKS } from "../claudeUsage";
import { MODEL_TASKS, type ModelTask } from "../providerModels";
import type { FilterSuggestInputT } from "../schemas/filterSuggest";
import type { PromoExtractInputT } from "../schemas/promo";
import type { ReplyGenInputT } from "../schemas/reply";
import type { TriageInputT } from "../schemas/triage";

const TRIAGE: TriageInputT = {
  account: "user@example.com",
  accountId: "acc-1",
  existingLabels: ["Receipts"],
  messages: [
    {
      id: "m1",
      from: "sender@example.com",
      subject: "Invoice",
      snippet: "Your invoice is ready",
      currentLabels: ["INBOX"],
    },
  ],
};

const REPLY: ReplyGenInputT = {
  from: "sender@example.com",
  to: ["user@example.com"],
  subject: "Invoice",
  body: "The invoice is attached.",
  userInstruction: "Say thanks.",
};

const FILTER: FilterSuggestInputT = {
  account: "user@example.com",
  existingLabels: ["Receipts"],
  existingFilters: [],
  messages: TRIAGE.messages,
};

const PROMO: PromoExtractInputT = {
  from: "Zara <newsletter@email.marketing-cloud.example.com>",
  subject: "Your 20% weekend",
  receivedAt: "2026-09-05T09:12:00.000Z",
  body: "Take 20% off with code WEEKEND20. Ends Sunday.",
};

/** One input per task, so every row can be exercised by iterating the table. */
const INPUTS: { [K in ModelTask]: Parameters<(typeof CLAUDE_TASKS)[K]["cliPrompt"]>[0] } = {
  triage: TRIAGE,
  reply: REPLY,
  filter: FILTER,
  "promo-extract": PROMO,
};

const promptsFor = (task: ModelTask) => {
  // The table is keyed by task and each row is typed to its own input; a loop
  // over the keys is where that pairing has to be re-stated for the compiler.
  const spec = claudeTaskSpec(task) as {
    cliPrompt: (i: unknown) => string;
    hostedPrompt: (i: unknown) => string;
  };
  const input = INPUTS[task];
  return { cli: spec.cliPrompt(input), hosted: spec.hostedPrompt(input) };
};

describe("the task table", () => {
  test("has exactly one row per model task", () => {
    expect(Object.keys(CLAUDE_TASKS).toSorted()).toEqual([...MODEL_TASKS].toSorted());
  });

  test.each([...MODEL_TASKS])("%s carries its own codec and prompts", (task) => {
    const spec = claudeTaskSpec(task);

    // The row's output contract is an ObjectCodec now (#105 → the runner
    // package): the JSON Schema the model is constrained with, and the decode
    // both transports validate through.
    expect(typeof spec.output.decode).toBe("function");
    expect(spec.output.jsonSchema).toBeTruthy();
    const { cli, hosted } = promptsFor(task);
    expect(cli.length).toBeGreaterThan(0);
    expect(hosted.length).toBeGreaterThan(0);
  });

  // The reason the two prompt builders are per-task columns rather than one:
  // the hosted transport has no tools, so an instruction to curl the body out
  // of the local API would be dead text carrying API_SECRET to a vendor.
  test.each([...MODEL_TASKS])("%s's hosted prompt names no local API and no secret", (task) => {
    const { hosted } = promptsFor(task);

    expect(hosted).not.toContain("curl");
    expect(hosted).not.toContain("localhost");
    expect(hosted).not.toContain(process.env.API_SECRET);
  });

  // The other side of that rule, for the tasks whose two columns hold one
  // builder: sending the identical prompt down both transports is only safe
  // while that prompt has nothing a vendor may not see, so both halves are
  // asserted together. It is the guard that keeps triage's body-fetch
  // paragraph — the one carrying API_SECRET — out of a task that has no tool
  // to act on it and no business posting it anywhere (#156).
  test.each(["reply", "filter", "promo-extract"] as const)(
    "%s hands both transports the same prompt, and it names no local API",
    (task) => {
      const { cli, hosted } = promptsFor(task);

      expect(cli).toBe(hosted);
      expect(cli).not.toContain("curl");
      expect(cli).not.toContain("localhost");
      expect(cli).not.toContain(process.env.API_SECRET);
    },
  );

  // Tools are the CLI transport's, and only the task with an escape hatch to
  // reach for has any: the row is what says so.
  test("only triage may use a tool, and only Bash", () => {
    expect(claudeTaskSpec("triage").allowedTools).toEqual(["Bash"]);
    expect(claudeTaskSpec("reply").allowedTools).toEqual([]);
    expect(claudeTaskSpec("filter").allowedTools).toEqual([]);
    expect(claudeTaskSpec("promo-extract").allowedTools).toEqual([]);
  });

  // Issue #158. The landing page, the privacy policy and the README all publish
  // which tasks send a whole message body, and all three read that list from
  // `claudeUsage.ts` rather than writing it out. This is the other half of that
  // promise: the list has to be the set of prompts that actually inline the body
  // they were handed, so a fifth task that carries one fails here until the
  // disclosure gains a row. A task with no `body` in its input inlines none —
  // triage's messages carry Gmail's snippet, which the copy discloses as such.
  test("the published body-bearing tasks are the prompts that inline a body", () => {
    const inlinesBody = MODEL_TASKS.filter((task) => {
      const { body } = INPUTS[task] as { body?: string };
      if (typeof body !== "string") return false;
      const { cli, hosted } = promptsFor(task);
      return cli.includes(body) || hosted.includes(body);
    });

    expect(inlinesBody.toSorted()).toEqual(
      BODY_BEARING_TASKS.map((entry) => entry.task).toSorted(),
    );
  });

  test("each task asks the hosted transport for its own output in its own words", () => {
    const instructions = MODEL_TASKS.map((t) => claudeTaskSpec(t).hostedInstruction);

    expect(new Set(instructions).size).toBe(MODEL_TASKS.length);
  });
});
