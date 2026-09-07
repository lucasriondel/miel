// Which providers a model row offers, now that credentials come before models
// and the select is gated on them. The rule this file pins down is the one that
// is easy to get wrong in the obvious direction: "offer what has a key" alone
// would drop the saved provider the moment its key went missing, and the select
// would then display a provider the server never stored.
import { describe, expect, test } from "bun:test";
import { CREDENTIAL_PROVIDERS, PROVIDERS } from "@miel/core/providerModels";
import { providerOptions } from "./providerOptions";
import type { CredentialProvider } from "../../api/types";

const stored = (...providers: CredentialProvider[]) => new Set(providers);

describe("providerOptions", () => {
  test("offers the local provider with nothing stored at all", () => {
    expect(providerOptions("claude-code", stored())).toEqual(["claude-code"]);
  });

  test("adds a vendor once its key is stored", () => {
    expect(providerOptions("claude-code", stored("anthropic"))).toEqual([
      "claude-code",
      "anthropic",
    ]);
  });

  test("leaves out vendors with no key — the route would refuse them", () => {
    const options = providerOptions("claude-code", stored("google"));

    expect(options).not.toContain("anthropic");
    expect(options).not.toContain("openai");
  });

  test("keeps the saved provider even when its key went missing", () => {
    // Dropping it would leave the select rendering some other provider as the
    // current value, which is a silent lie about what the task runs on.
    expect(providerOptions("openai", stored())).toContain("openai");
  });

  test("does not list the saved provider twice once its key is back", () => {
    const options = providerOptions("openai", stored("openai"));

    expect(options.filter((p) => p === "openai")).toHaveLength(1);
  });

  test("offers the whole catalogue when every vendor has a key", () => {
    expect(providerOptions("claude-code", stored(...CREDENTIAL_PROVIDERS))).toEqual([...PROVIDERS]);
  });

  test("follows catalogue order, so the local provider comes first", () => {
    const options = providerOptions("openai", stored("openai", "anthropic"));

    expect(options[0]).toBe("claude-code");
    expect(options).toEqual(PROVIDERS.filter((p) => p !== "google"));
  });
});
