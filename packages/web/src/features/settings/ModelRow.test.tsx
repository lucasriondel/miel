// One row of the Models card (#105): a provider dropdown that drives a model
// dropdown. The row used to offer the whole catalogue and repair the choice
// afterwards with an inline key prompt; credentials now sit above the models
// and the dropdown only offers what has one.
//
// This package has no DOM harness, so what is asserted is the markup a given
// state renders. The interactions themselves (which PUT goes out when) are the
// route's tests; what matters here is that the user is never offered a pairing
// the route would refuse.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS, PROVIDERS, PROVIDER_MODELS } from "@miel/core/providerModels";
import { ModelRow } from "./ModelRow";
import { queryKeys } from "../../api/queries";
import type { CredentialProvider, Provider } from "../../api/types";

/**
 * Renders the row with the whole credential roster seeded, since that is what
 * builds the option list. `stored` names the vendors that have a key; every
 * other one answers "not configured" rather than staying in flight, which would
 * disable the select.
 */
const render = (provider: Provider, model: string, stored: CredentialProvider[] = []) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: stored.includes(vendor),
      hint: stored.includes(vendor) ? "sk-ant-…3f9" : null,
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ModelRow
        task="triage"
        title="Triage"
        description="Classifies priority."
        value={model}
        provider={provider}
        onSaved={() => {}}
      />
    </QueryClientProvider>,
  );
};

describe("the provider dropdown", () => {
  test("offers the local CLI on a fresh install and nothing else", () => {
    const html = render("claude-code", "claude-haiku-4-5");

    expect(html).toContain('value="claude-code"');
    for (const vendor of CREDENTIAL_PROVIDERS) {
      expect(html).not.toContain(`value="${vendor}"`);
    }
    // The retired spelling is gone; a stored one is migrated, not offered.
    expect(html).not.toContain("hosted-api");
  });

  test("offers a vendor once its key is stored", () => {
    const html = render("claude-code", "claude-haiku-4-5", ["anthropic"]);

    expect(html).toContain('value="anthropic"');
    expect(html).not.toContain('value="openai"');
  });

  test("offers the whole catalogue when every vendor has a key", () => {
    const html = render("claude-code", "claude-haiku-4-5", [...CREDENTIAL_PROVIDERS]);

    for (const provider of PROVIDERS) expect(html).toContain(`value="${provider}"`);
  });

  test("names the local provider Claude Code, not CLI (#108)", () => {
    const html = render("claude-code", "claude-haiku-4-5");

    // Next to Anthropic, Google and OpenAI, "CLI" named a category rather than
    // the product. The option's value — what gets stored — is untouched.
    expect(html).toContain(">Claude Code<");
    expect(html).not.toContain(">CLI<");
    expect(html).toContain('value="claude-code"');
  });
});

describe("the model dropdown follows the provider", () => {
  test("lists that provider's models and nobody else's", () => {
    const html = render("google", "gemini-2.5-flash", ["google"]);

    for (const m of PROVIDER_MODELS.google) expect(html).toContain(`value="${m.id}"`);
    for (const m of PROVIDER_MODELS.openai) expect(html).not.toContain(`value="${m.id}"`);
  });

  test("offers no free-text model id — the pair has to be one the route accepts", () => {
    const html = render("openai", "gpt-4.1-mini", ["openai"]);

    expect(html).not.toContain("__custom__");
    expect(html).not.toContain("Custom");
  });
});

describe("the saved provider whose key went missing", () => {
  test("stays in the dropdown rather than being silently replaced", () => {
    const html = render("openai", "gpt-4.1-mini");

    expect(html).toContain('value="openai"');
  });

  test("asks for the key in the row, which is the way back", () => {
    const html = render("openai", "gpt-4.1-mini");

    expect(html).toContain('type="password"');
    expect(html.toLowerCase()).toContain("key");
  });

  test("says nothing about a key once one is stored", () => {
    const html = render("anthropic", "claude-haiku-4-5", ["anthropic"]);

    expect(html).not.toContain('type="password"');
  });

  test("never asks for a key for the local CLI", () => {
    const html = render("claude-code", "claude-haiku-4-5");

    expect(html).not.toContain('type="password"');
  });
});
