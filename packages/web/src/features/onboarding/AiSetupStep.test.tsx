// Step two of the onboarding gate (#111): a connected mailbox that cannot be
// triaged is the core promise failing on the first sync, so the gate asks for a
// triage provider, that provider's credential and a model before it lets go.
//
// This package has no DOM harness, so what is asserted is the markup a given
// state renders — and that the step reuses the settings page's row rather than
// growing an onboarding copy of it that can drift.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS, PROVIDER_LABELS, PROVIDER_MODELS } from "@miel/core/providerModels";
import { AiSetupStep } from "./AiSetupStep";
import { queryKeys } from "../../api/queries";
import type {
  ClaudeCodeTokenStatus,
  ModelSettings,
  Provider,
  ProviderCredentialStatus,
} from "../../api/types";

const NO_TOKEN: ClaudeCodeTokenStatus = { configured: false, hint: null };

const settingsWith = (provider: Provider, model: string): ModelSettings => ({
  triageProvider: provider,
  triageModel: model,
  filterProvider: "claude-code",
  filterModel: "claude-haiku-4-5",
  replyProvider: "claude-code",
  replyModel: "claude-haiku-4-5",
});

/**
 * Seeds the whole credential roster, since that is what the provider select is
 * built from: a vendor left in flight would disable the select rather than be
 * left out of it. `seed.key` names the one vendor whose status differs from
 * "no key stored".
 */
const render = (
  settings: ModelSettings,
  seed: { token?: ClaudeCodeTokenStatus; key?: ProviderCredentialStatus } = {},
) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.claudeCodeToken, seed.token ?? NO_TOKEN);
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: false,
      hint: null,
    });
  }
  if (seed.key) qc.setQueryData(queryKeys.providerCredential(seed.key.provider), seed.key);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <AiSetupStep titleId="title" descriptionId="description" settings={settings} />
    </QueryClientProvider>,
  );
};

describe("what the step asks for", () => {
  test("names itself and its description with the ids the dialog points at", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    expect(html).toContain('id="title"');
    expect(html).toContain('id="description"');
  });

  test("asks for a credential before asking which provider triages", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    // The select offers only providers that have one, so the grid is what
    // fills it — the other order asked for the consequence first.
    expect(html).toContain('aria-label="Triage provider"');
    for (const label of Object.values(PROVIDER_LABELS)) expect(html).toContain(label);
    expect(html.indexOf("console.anthropic.com")).toBeLessThan(
      html.indexOf('aria-label="Triage provider"'),
    );
  });

  test("offers a vendor as the one that triages once its key is stored", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"), {
      key: { provider: "openai", configured: true, hint: "sk-…9kd" },
    });

    expect(html).toContain('value="openai"');
    expect(html).toContain('value="claude-code"');
    expect(html).not.toContain('value="anthropic"');
  });

  test("offers the selected provider's models and nobody else's", () => {
    const html = render(settingsWith("google", "gemini-2.5-flash"), {
      key: { provider: "google", configured: true, hint: "AIza…9kd" },
    });

    expect(html).toContain('aria-label="Triage model"');
    for (const m of PROVIDER_MODELS.google) expect(html).toContain(`value="${m.id}"`);
    for (const m of PROVIDER_MODELS.openai) expect(html).not.toContain(`value="${m.id}"`);
  });

  test("asks for the local provider's token when that is what triages", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    expect(html).toContain('type="password"');
    // The same row the Credentials card renders, so the instructions match.
    expect(html).toContain("claude setup-token");
  });

  test("asks for every vendor's key up front, not only the selected one's", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    // One field per vendor plus the local token — the grid is how a vendor
    // becomes selectable at all, so all of them are offered a key here.
    for (const vendor of CREDENTIAL_PROVIDERS) {
      expect(html).toContain(`aria-label="${PROVIDER_LABELS[vendor]} API key"`);
    }
    expect(html).toContain('type="password"');
  });

  test("never renders a credential back — the field starts empty", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"), {
      token: { configured: true, hint: "sk-ant-…o4t" },
    });

    expect(html).not.toContain('value="sk-ant');
  });
});

describe("triage only", () => {
  test("configures no other task", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    expect(html).not.toContain("Filter");
    expect(html).not.toContain("Reply");
    expect(html.match(/aria-label="[^"]* provider"/g)).toEqual(['aria-label="Triage provider"']);
  });
});

describe("no way past it", () => {
  test("offers no skip, dismiss or do-it-later control", () => {
    const html = render(settingsWith("claude-code", "claude-haiku-4-5"));

    expect(html).not.toMatch(/skip|not now|maybe later|dismiss/i);
    expect(html).not.toMatch(/aria-label="Close"/i);
  });
});
