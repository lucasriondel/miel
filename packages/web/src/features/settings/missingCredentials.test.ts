import { describe, expect, test } from "bun:test";
import type { CredentialProvider, ModelSettings } from "../../api/types";
import { missingCredentials } from "./missingCredentials";

const ALL_LOCAL: ModelSettings = {
  triageModel: "claude-haiku-4-5",
  triageProvider: "claude-code",
  replyModel: "claude-sonnet-4-6",
  replyProvider: "claude-code",
  "promo-extractModel": "claude-haiku-4-5",
  "promo-extractProvider": "claude-code",
};

const none = new Set<CredentialProvider>();

describe("which tasks cannot run", () => {
  test("a fresh install — every task local, nothing stored — gets the design's sentence", () => {
    const missing = missingCredentials(ALL_LOCAL, false, none);

    expect(missing?.title).toBe("No AI credential yet");
    expect(missing?.body).toContain("Every task runs on Claude Code by default");
  });

  test("nothing to say once the local token is stored", () => {
    expect(missingCredentials(ALL_LOCAL, true, none)).toBeNull();
  });

  test("names the task and vendor when one task points at a keyless vendor", () => {
    const settings: ModelSettings = { ...ALL_LOCAL, replyProvider: "openai" };

    const missing = missingCredentials(settings, true, none);

    expect(missing?.title).toBe("A task has no credential");
    expect(missing?.body).toStartWith("Reply runs on OpenAI");
  });

  test("a vendor whose key is stored is runnable", () => {
    const settings: ModelSettings = { ...ALL_LOCAL, replyProvider: "openai" };

    expect(missingCredentials(settings, true, new Set(["openai"]))).toBeNull();
  });
});
