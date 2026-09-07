// The Models card — one provider/model picker per AI task (#154).
//
// The card used to hold three rows written out by hand while the catalogue had
// four tasks, so promo extraction was the one task nobody could point anywhere:
// it ran on `SETTING_DEFAULTS` — the local CLI — on every sync since #159, and
// an install running the other three on a vendor had no token for it and lost
// the whole sync to a provider it never picked.
//
// So the assertions here are over `MODEL_TASKS` rather than over three titles:
// a fifth task must fail this file until the card offers it. Rendered into the
// DOM harness, with the api client stubbed, because what is worth pinning is
// the PUT a change sends — the field name carries the task, hyphen and all, and
// a row wired to the wrong one would still render perfectly.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDENTIAL_PROVIDERS, MODEL_TASKS, PROVIDER_MODELS } from "@miel/core/providerModels";
import type { CredentialProvider, ModelSettings } from "../../api/types";

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
let answer: (req: Request) => unknown = () => {
  throw new Error("no request was expected here");
};

/**
 * The api client, stubbed in the file body with the subjects imported after it:
 * a bun module mock is process-global, so a suite that registers none gets
 * whichever one ran last.
 */
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: Request) => {
    requests.push(req);
    return answer(req);
  },
}));

const { ModelsCard, MODEL_ROWS } = await import("./ModelsCard");
const { queryKeys } = await import("../../api/queries");

const SETTINGS: ModelSettings = {
  triageModel: "claude-haiku-4-5",
  triageProvider: "claude-code",
  replyModel: "claude-sonnet-4-6",
  replyProvider: "claude-code",
  filterModel: "claude-haiku-4-5",
  filterProvider: "claude-code",
  "promo-extractModel": "claude-haiku-4-5",
  "promo-extractProvider": "claude-code",
};

const renderCard = (stored: CredentialProvider[] = [], value: ModelSettings = SETTINGS) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  for (const provider of CREDENTIAL_PROVIDERS) {
    qc.setQueryData(queryKeys.providerCredential(provider), {
      provider,
      configured: stored.includes(provider),
      hint: stored.includes(provider) ? "sk-ant-…3f9" : null,
    });
  }
  return render(
    <QueryClientProvider client={qc}>
      <ModelsCard value={value} />
    </QueryClientProvider>,
  );
};

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

afterEach(() => {
  requests.length = 0;
  answer = () => {
    throw new Error("no request was expected here");
  };
});

describe("the rows the card draws", () => {
  test("gives every task in the catalogue a picker", () => {
    renderCard();

    for (const task of MODEL_TASKS) {
      expect(select(`${MODEL_ROWS[task].title} provider`)).toBeDefined();
      expect(select(`${MODEL_ROWS[task].title} model`)).toBeDefined();
    }
    // And no more than that: the table is what the card iterates, so an entry
    // that was never rendered — or a fourth row for a task nobody runs — is
    // caught here rather than by the four lookups above, which any superset
    // would satisfy.
    expect(screen.getAllByLabelText(/ provider$/)).toHaveLength(MODEL_TASKS.length);
  });

  test("names each row's task once — no two rows share a title", () => {
    const titles = MODEL_TASKS.map((task) => MODEL_ROWS[task].title);

    expect(new Set(titles).size).toBe(titles.length);
  });

  test("shows what each task's provider and model currently are", () => {
    renderCard([], { ...SETTINGS, "promo-extractProvider": "claude-code" });

    expect(select(`${MODEL_ROWS["promo-extract"].title} provider`).value).toBe("claude-code");
    expect(select(`${MODEL_ROWS["promo-extract"].title} model`).value).toBe("claude-haiku-4-5");
  });
});

describe("changing the fourth task's provider", () => {
  test("sends a patch naming that task, not another", async () => {
    answer = () => ({
      ...SETTINGS,
      "promo-extractProvider": "openai",
      "promo-extractModel": "gpt-4.1-mini",
    });
    renderCard(["openai"]);

    fireEvent.change(select(`${MODEL_ROWS["promo-extract"].title} provider`), {
      target: { value: "openai" },
    });

    await waitFor(() =>
      expect(requests).toEqual([
        { path: "/settings", method: "PUT", body: { "promo-extractProvider": "openai" } },
      ]),
    );
  });

  test("offers a vendor whose key is stored, so the pick is one the route accepts", () => {
    renderCard(["openai"]);

    const options = [...select(`${MODEL_ROWS["promo-extract"].title} provider`).options].map(
      (o) => o.value,
    );
    expect(options).toContain("openai");
    expect(options).not.toContain("google");
  });

  test("sends the model alone when the model is what changed", async () => {
    answer = () => SETTINGS;
    renderCard();

    fireEvent.change(select(`${MODEL_ROWS["promo-extract"].title} model`), {
      target: { value: PROVIDER_MODELS["claude-code"][1].id },
    });

    await waitFor(() =>
      expect(requests).toEqual([
        {
          path: "/settings",
          method: "PUT",
          body: { "promo-extractModel": PROVIDER_MODELS["claude-code"][1].id },
        },
      ]),
    );
  });
});
