// A refused credential has to say so where it was typed (#116).
//
// Pasting a key the server rejects used to clear the spinner and show nothing:
// the field owned the save mutation and never read its error, so the row it sat
// in had nothing to render. Since #135 one hook owns the whole lifecycle for
// every provider, so there is one error to read and one ladder deciding which
// failure the user is owed — the two per-kind wrappers that each spelled that
// ladder out are gone.
//
// Rendered into the DOM harness (#129), which is what a mutation failure needs:
// it only exists after a click. What this suite used to do instead was read
// `ClaudeCodeTokenRow.tsx` and `ProviderKeyRow.tsx` as text and match the
// ladder with a regex — the last thing keeping those dead components in the
// tree, and an assertion about spelling rather than about what a user sees.
//
// The tile's own refusals are next door in `CredentialsCard.test.tsx`. What is
// here is the field itself, and the one other place a key is typed: the inline
// prompt in a model row, where a silent failure is the same bug in a worse
// place — nothing else on screen would explain the refusal.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";

interface Request {
  path: string;
  method?: string;
  body?: unknown;
}

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

// This suite's own stub of the api client, registered before the subjects are
// imported: a bun module mock is process-global, so a file that registers none
// gets whichever one ran last.
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: Request) => {
    requests.push(req);
    return answer(req);
  },
}));

const { SecretField } = await import("@/components/ui/secret-field");
const { ModelRow } = await import("./ModelRow");
const { queryKeys } = await import("../../api/queries");

afterEach(() => {
  requests.length = 0;
  answer = REFUSE;
});

const field = (error: string | null) =>
  render(
    <SecretField
      value=""
      onChange={() => {}}
      onSubmit={() => {}}
      label="Anthropic API key"
      placeholder="sk-ant-…"
      submitLabel="Save"
      pending={false}
      error={error}
    />,
  );

describe("the field a secret is typed into", () => {
  test("shows the failure the server answered with, as a sentence", () => {
    // What reaches the field is what `apiErrorMessage` made of the envelope:
    // the `message` beside the code, not `invalid_provider_credential` (#130).
    field("Anthropic rejected that key.");

    expect(screen.getByRole("alert").textContent).toBe("Anthropic rejected that key.");
  });

  test("does not hide the resting state behind an alert", () => {
    field(null);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("never echoes what was typed back into the message", () => {
    // The draft is the caller's; the error is the server's. Nothing here should
    // put one into the other.
    render(
      <SecretField
        value="sk-ant-api03-secret"
        onChange={() => {}}
        onSubmit={() => {}}
        label="Anthropic API key"
        placeholder="sk-ant-…"
        submitLabel="Save"
        pending={false}
        error="Save failed"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Save failed");
    expect(alert.textContent).not.toContain("sk-ant-api03-secret");
  });
});

/**
 * The row for a task pointed at a vendor with no key stored — the one state
 * that still asks for a key outside the credentials grid, and the way back from
 * a key that went missing out of band.
 */
const renderModelRow = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  for (const vendor of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(vendor), {
      provider: vendor,
      configured: false,
      hint: null,
    });
  }
  return render(
    <QueryClientProvider client={qc}>
      <ModelRow
        task="triage"
        title="Triage"
        description="Classifies priority."
        value="gpt-4.1-mini"
        provider="openai"
      />
    </QueryClientProvider>,
  );
};

describe("the inline prompt in a model row", () => {
  test("asks for the key of the vendor the task points at", () => {
    renderModelRow();

    expect(screen.getByLabelText("OpenAI API key").getAttribute("type")).toBe("password");
  });

  test("reports a refused key where it was typed", async () => {
    answer = () => {
      throw new ApiError("invalid_provider_credential", 400, {
        error: "invalid_provider_credential",
        message: "OpenAI rejected that key.",
      });
    };
    renderModelRow();

    fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: "sk-wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Save OpenAI key" }));

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toBe("OpenAI rejected that key.");
    expect(requests).toEqual([
      {
        path: "/settings/provider-credentials/openai",
        method: "PUT",
        body: { apiKey: "sk-wrong" },
      },
    ]);
  });

  test("stops asking once the key is stored", async () => {
    answer = () => ({ provider: "openai", configured: true, hint: "sk-…9kd" });
    renderModelRow();

    fireEvent.change(screen.getByLabelText("OpenAI API key"), { target: { value: "sk-right" } });
    fireEvent.click(screen.getByRole("button", { name: "Save OpenAI key" }));

    await waitFor(() => expect(screen.queryByLabelText("OpenAI API key")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
