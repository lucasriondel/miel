// The wire shape of a model-settings patch — which tasks a caller may point at
// a provider (#154).
//
// The catalogue in `providerModels.ts` is the one list of AI tasks: the settings
// service builds its keys and its `ModelSettings` fields from it, and
// `taskProviders.ts` runs its credential rule over it. This schema is the door
// those two sit behind, and it used to name three of the four tasks by hand —
// so a patch pointing `promo-extract` at a vendor was stripped by the parse and
// answered with a 200 and the unchanged settings. That is the worst kind of
// refusal: the caller is told the edit landed.
//
// The assertion is therefore over `MODEL_TASKS` rather than over a list written
// here, because a fifth task must fail this file until the door names it too.
//
// Schemas only — no db, no environment, so this needs no Postgres.
import { describe, expect, test } from "bun:test";
import { MODEL_TASKS, type ModelTask } from "../providerModels";
import { UpdateSettingsRequest } from "./api";

// Spread because `test.each` wants a mutable array. Typed, so the field lookups
// below are the compile-time half of the same assertion: `${task}Provider` only
// indexes the parsed value if the schema carries a field for every task.
const TASKS: ModelTask[] = [...MODEL_TASKS];

describe("a patch may name any task in the catalogue", () => {
  test.each(TASKS)("%s's provider survives the parse", (task) => {
    const parsed = UpdateSettingsRequest.safeParse({ [`${task}Provider`]: "anthropic" });

    expect(parsed.success).toBe(true);
    // Not `toMatchObject`: zod strips an unknown key silently, so the field has
    // to be read back off the parsed value to prove it was not dropped.
    expect(parsed.success && parsed.data[`${task}Provider`]).toBe("anthropic");
  });

  test.each(TASKS)("%s's model survives the parse", (task) => {
    const parsed = UpdateSettingsRequest.safeParse({ [`${task}Model`]: "claude-haiku-4-5" });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data[`${task}Model`]).toBe("claude-haiku-4-5");
  });

  // The half that is not about the new task: the pair is still shape-checked,
  // and a vendor outside the catalogue is a 400 at the edge rather than a row
  // the resolver would have to reject on the next sync.
  test.each(TASKS)("%s refuses a provider nobody serves", (task) => {
    expect(UpdateSettingsRequest.safeParse({ [`${task}Provider`]: "mistral" }).success).toBe(false);
  });

  test.each(TASKS)("%s refuses an empty model id", (task) => {
    expect(UpdateSettingsRequest.safeParse({ [`${task}Model`]: "" }).success).toBe(false);
  });

  test("an empty patch is valid — every field is optional", () => {
    expect(UpdateSettingsRequest.safeParse({}).success).toBe(true);
  });
});
