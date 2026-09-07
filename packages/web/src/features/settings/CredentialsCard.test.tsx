// The Settings card that holds every AI credential — one tile per provider,
// because the local provider's token and a vendor's API key are the same kind
// of setting and the split that used to separate them made one look like a
// different category (#110).
//
// Rendered into the DOM harness (#129) rather than matched as markup, which is
// what this suite used to do: a credential is a lifecycle — read, paste, save,
// fail, clear — and half of it only happens after a click. Since #135 one hook
// owns that lifecycle for every provider, so these tests exercise it through
// the tile a user actually sees, on both kinds of credential.
//
// A tile has two shapes rather than one, which is the point of the layout and
// the thing these tests pin: with nothing stored it is a paste field, and with
// a credential stored it is the masked hint and a way to remove it — no dead
// input under a key that already exists.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CLAUDE_CODE_PROVIDER,
  CREDENTIAL_PROVIDERS,
  PROVIDERS,
  PROVIDER_LABELS,
} from "@miel/core/providerModels";
import type {
  ClaudeCodeTokenStatus,
  CredentialProvider,
  Provider,
  ProviderCredentialStatus,
} from "../../api/types";

interface Request {
  path: string;
  method?: string;
  body?: unknown;
}

/**
 * The mock's own `ApiError`, because that is the class `apiErrorMessage` will
 * narrow against once the module is replaced: a rejected credential has to
 * reach the user as the sentence beside the code, not as the code (#130).
 */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

const requests: Request[] = [];
const REFUSE = (): unknown => {
  throw new Error("no request was expected here");
};
let answer: (req: Request) => unknown = REFUSE;

/**
 * The one seam stubbed: the api client, which is where a save or a clear would
 * leave the process. Registered in the file body with the subjects imported
 * after it, for the reason `gateSteps.test.tsx` gives — a bun module mock is
 * process-global, so a suite that registers none gets whichever one ran last.
 */
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: Request) => {
    requests.push(req);
    return answer(req);
  },
}));

const { CredentialsCard } = await import("./CredentialsCard");
const { queryKeys } = await import("../../api/queries");

const NO_TOKEN: ClaudeCodeTokenStatus = { configured: false, hint: null };
const STORED_TOKEN: ClaudeCodeTokenStatus = { configured: true, hint: "sk-ant-…o4t" };
const storedKey = (provider: CredentialProvider): ProviderCredentialStatus => ({
  provider,
  configured: true,
  hint: "sk-ant-…3f9",
});

/**
 * The card with the server's answers already in the cache and `staleTime`
 * infinite, so nothing is refetched behind the render: every request the tests
 * below count is one a click made.
 */
const renderCard = (
  keys: Partial<Record<CredentialProvider, ProviderCredentialStatus>> = {},
  token: ClaudeCodeTokenStatus = NO_TOKEN,
) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  for (const provider of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(
      queryKeys.providerCredential(provider),
      keys[provider] ?? { provider, configured: false, hint: null },
    );
  }
  qc.setQueryData(queryKeys.claudeCodeToken, token);
  return render(
    <QueryClientProvider client={qc}>
      <CredentialsCard />
    </QueryClientProvider>,
  );
};

/** One provider's tile, by the name it is labelled with. */
const tile = (provider: Provider) =>
  within(screen.getByRole("group", { name: PROVIDER_LABELS[provider] }));

afterEach(() => {
  requests.length = 0;
  answer = REFUSE;
});

describe("the grid of credentials", () => {
  test("gives every provider in the catalogue its own tile", () => {
    renderCard();

    for (const provider of PROVIDERS) {
      expect(tile(provider).getByText(PROVIDER_LABELS[provider])).toBeDefined();
    }
  });

  test("puts the local provider first — it is the default and needs no vendor account", () => {
    renderCard();

    const text = document.body.textContent ?? "";
    const positions = PROVIDERS.map((provider) => text.indexOf(PROVIDER_LABELS[provider]));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
  });

  test("says the promise once, under the grid, rather than on all four tiles", () => {
    renderCard();

    expect(screen.getAllByText(/stored encrypted/i)).toHaveLength(1);
  });

  // The mark is what identifies a tile before its label is read, so every
  // provider needs one — a provider added to the catalogue without a mark would
  // otherwise render an empty square rather than fail anywhere.
  test("draws a mark for every provider, inline and decorative", () => {
    renderCard();

    expect(document.querySelectorAll("svg")).toHaveLength(PROVIDERS.length);
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("a tile with nothing stored", () => {
  test("offers a password field, and nothing to clear", () => {
    renderCard();

    for (const provider of PROVIDERS) {
      expect(tile(provider).getByText("Not set")).toBeDefined();
      expect(tile(provider).queryByRole("button", { name: /^Clear/ })).toBeNull();
    }
    expect(tile("anthropic").getByLabelText("Anthropic API key").getAttribute("type")).toBe(
      "password",
    );
    expect(
      tile(CLAUDE_CODE_PROVIDER).getByLabelText("Claude Code token").getAttribute("type"),
    ).toBe("password");
  });

  test("does not invite the browser to autofill or remember what is typed", () => {
    renderCard();

    const field = tile("openai").getByLabelText("OpenAI API key");
    expect(field.getAttribute("autocomplete")).toBe("off");
    expect(field.getAttribute("spellcheck")).toBe("false");
  });

  test("says where to get one", () => {
    renderCard();

    expect(tile("anthropic").getByText("console.anthropic.com")).toBeDefined();
    expect(tile(CLAUDE_CODE_PROVIDER).getByText(/setup-token/)).toBeDefined();
  });

  // There is no second source left, so a tile must not go on describing one: an
  // operator told the token might be coming from the server environment would
  // go looking for a variable nothing reads.
  test("never points at the environment for a token", () => {
    for (const token of [NO_TOKEN, STORED_TOKEN]) {
      const view = renderCard({}, token);
      const text = document.body.textContent ?? "";

      expect(text).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(text.toLowerCase()).not.toContain("environment");

      view.unmount();
    }
  });
});

describe("a tile whose credential is stored", () => {
  test("shows the masked hint in place of the field", () => {
    renderCard({ anthropic: storedKey("anthropic") }, STORED_TOKEN);

    expect(tile("anthropic").getByText("sk-ant-…3f9")).toBeDefined();
    expect(tile("anthropic").queryByLabelText("Anthropic API key")).toBeNull();
    expect(tile(CLAUDE_CODE_PROVIDER).getByText("sk-ant-…o4t")).toBeDefined();
    expect(tile(CLAUDE_CODE_PROVIDER).queryByLabelText("Claude Code token")).toBeNull();
  });

  test("keeps the vendors apart — one stored key does not light up the others", () => {
    renderCard({ openai: storedKey("openai") });

    expect(tile("openai").getByText("Stored")).toBeDefined();
    expect(tile("anthropic").getByText("Not set")).toBeDefined();
    expect(tile("google").getByText("Not set")).toBeDefined();
    expect(tile(CLAUDE_CODE_PROVIDER).getByText("Not set")).toBeDefined();
  });

  test("names the credential in the clear button, so the two kinds read as peers", () => {
    renderCard({ anthropic: storedKey("anthropic") }, STORED_TOKEN);

    expect(tile("anthropic").getByRole("button", { name: "Clear key" })).toBeDefined();
    expect(tile(CLAUDE_CODE_PROVIDER).getByRole("button", { name: "Clear token" })).toBeDefined();
  });
});

describe("pasting a credential", () => {
  test("sends a vendor key to that vendor's endpoint, and shows what came back", async () => {
    answer = () => ({ provider: "anthropic", configured: true, hint: "sk-ant-…3f9" });
    renderCard();

    fireEvent.change(tile("anthropic").getByLabelText("Anthropic API key"), {
      target: { value: "  sk-ant-api03-secret  " },
    });
    fireEvent.click(tile("anthropic").getByRole("button", { name: "Save key" }));

    await waitFor(() => expect(tile("anthropic").getByText("sk-ant-…3f9")).toBeDefined());
    expect(requests).toEqual([
      {
        path: "/settings/provider-credentials/anthropic",
        method: "PUT",
        body: { apiKey: "sk-ant-api03-secret" },
      },
    ]);
  });

  // The same tile and the same shape, a different route: the local provider's
  // credential is not a vendor key and is written through its own endpoint.
  test("sends the local provider's token to the token endpoint", async () => {
    answer = () => ({ configured: true, hint: "sk-ant-…o4t" });
    renderCard();

    fireEvent.change(tile(CLAUDE_CODE_PROVIDER).getByLabelText("Claude Code token"), {
      target: { value: "sk-ant-oat01-secret" },
    });
    fireEvent.click(tile(CLAUDE_CODE_PROVIDER).getByRole("button", { name: "Save token" }));

    await waitFor(() => expect(tile(CLAUDE_CODE_PROVIDER).getByText("sk-ant-…o4t")).toBeDefined());
    expect(requests).toEqual([
      {
        path: "/settings/claude-code-token",
        method: "PUT",
        body: { token: "sk-ant-oat01-secret" },
      },
    ]);
  });

  test("never renders the credential back — only the masked hint", async () => {
    answer = () => ({ provider: "google", configured: true, hint: "AIza…9kd" });
    renderCard();

    fireEvent.change(tile("google").getByLabelText("Google API key"), {
      target: { value: "AIzaSyTOPSECRET" },
    });
    fireEvent.click(tile("google").getByRole("button", { name: "Save key" }));

    await waitFor(() => expect(tile("google").getByText("AIza…9kd")).toBeDefined());
    expect(document.body.innerHTML).not.toContain("AIzaSyTOPSECRET");
  });

  test("asks for nothing when the field is empty", () => {
    renderCard();

    // Nothing to submit, so no button to press — and Enter sends no request.
    expect(tile("openai").queryByRole("button", { name: "Save key" })).toBeNull();
    fireEvent.keyDown(tile("openai").getByLabelText("OpenAI API key"), { key: "Enter" });

    expect(requests).toEqual([]);
  });
});

describe("a refused save", () => {
  const REJECTED = () => {
    throw new ApiError("invalid_provider_credential", 400, {
      error: "invalid_provider_credential",
      message: "Anthropic rejected that key.",
    });
  };

  test("shows the sentence the server sent, not the code beside it", async () => {
    answer = REJECTED;
    renderCard();

    fireEvent.change(tile("anthropic").getByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-wrong" },
    });
    fireEvent.click(tile("anthropic").getByRole("button", { name: "Save key" }));

    const alert = await waitFor(() => tile("anthropic").getByRole("alert"));
    expect(alert.textContent).toBe("Anthropic rejected that key.");
  });

  test("keeps what was typed, so the user can fix it rather than retype it", async () => {
    answer = REJECTED;
    renderCard();
    const field = tile("anthropic").getByLabelText<HTMLInputElement>("Anthropic API key");

    fireEvent.change(field, { target: { value: "sk-ant-wrong" } });
    fireEvent.click(tile("anthropic").getByRole("button", { name: "Save key" }));

    await waitFor(() => tile("anthropic").getByRole("alert"));
    expect(field.value).toBe("sk-ant-wrong");
  });

  test("reports the failure on the tile it happened on, and on no other", async () => {
    answer = REJECTED;
    renderCard();

    fireEvent.change(tile("anthropic").getByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-wrong" },
    });
    fireEvent.click(tile("anthropic").getByRole("button", { name: "Save key" }));

    await waitFor(() => tile("anthropic").getByRole("alert"));
    expect(tile("openai").queryByRole("alert")).toBeNull();
    expect(tile(CLAUDE_CODE_PROVIDER).queryByRole("alert")).toBeNull();
  });

  // The token row already surfaced its save failure before #135; the point of
  // one hook is that the vendor tiles and this one cannot drift apart again.
  test("says so on the local provider's tile the same way", async () => {
    answer = () => {
      throw new Error("That token was refused.");
    };
    renderCard();

    fireEvent.change(tile(CLAUDE_CODE_PROVIDER).getByLabelText("Claude Code token"), {
      target: { value: "sk-ant-nope" },
    });
    fireEvent.click(tile(CLAUDE_CODE_PROVIDER).getByRole("button", { name: "Save token" }));

    const alert = await waitFor(() => tile(CLAUDE_CODE_PROVIDER).getByRole("alert"));
    expect(alert.textContent).toBe("That token was refused.");
  });
});

describe("clearing a credential", () => {
  test("deletes the vendor's key and drops back to the paste field", async () => {
    answer = () => ({ provider: "anthropic", configured: false, hint: null });
    renderCard({ anthropic: storedKey("anthropic") });

    fireEvent.click(tile("anthropic").getByRole("button", { name: "Clear key" }));

    await waitFor(() =>
      expect(tile("anthropic").getByLabelText("Anthropic API key")).toBeDefined(),
    );
    expect(requests).toEqual([
      { path: "/settings/provider-credentials/anthropic", method: "DELETE" },
    ]);
    expect(tile("anthropic").getByText("Not set")).toBeDefined();
  });

  test("deletes the local provider's token through the token endpoint", async () => {
    answer = () => ({ configured: false, hint: null });
    renderCard({}, STORED_TOKEN);

    fireEvent.click(tile(CLAUDE_CODE_PROVIDER).getByRole("button", { name: "Clear token" }));

    await waitFor(() =>
      expect(tile(CLAUDE_CODE_PROVIDER).getByLabelText("Claude Code token")).toBeDefined(),
    );
    expect(requests).toEqual([{ path: "/settings/claude-code-token", method: "DELETE" }]);
  });

  test("says it is in flight, and refuses a second press meanwhile", async () => {
    let release: (() => void) | undefined;
    answer = () =>
      new Promise((resolve) => {
        release = () => resolve({ provider: "google", configured: false, hint: null });
      });
    renderCard({ google: storedKey("google") });

    fireEvent.click(tile("google").getByRole("button", { name: "Clear key" }));

    const button = await waitFor(() =>
      tile("google").getByRole<HTMLButtonElement>("button", { name: "Clearing…" }),
    );
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(requests).toHaveLength(1);

    release?.();
    await waitFor(() => expect(tile("google").getByText("Not set")).toBeDefined());
  });

  test("shows a refused clear as a sentence on the tile", async () => {
    answer = () => {
      throw new Error("The key of the vendor triage runs on cannot be cleared.");
    };
    renderCard({ openai: storedKey("openai") });

    fireEvent.click(tile("openai").getByRole("button", { name: "Clear key" }));

    const alert = await waitFor(() => tile("openai").getByRole("alert"));
    expect(alert.textContent).toBe("The key of the vendor triage runs on cannot be cleared.");
    // Still stored: a refused clear leaves the credential where it was.
    expect(tile("openai").getByText("Stored")).toBeDefined();
  });
});
