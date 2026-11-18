// The Google step of the onboarding gate (#120, #138, A15): the surface a fresh
// install actually hits first, since without a Google OAuth client there is no
// consent URL to send anyone to.
//
// Two halves are pinned. The walkthrough — all three surfaces render the same
// steps, read from core, so what is asserted is that this one renders them in
// order. And since A15 the form: the client is pasted here and saved in miel,
// so what a user types reaches the server as typed, a refusal lands under the
// field it names, and the save is what moves the gate on.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEV_GOOGLE_REDIRECT_URI, GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";
import type { GoogleOAuthConfigStatus } from "../../api/types";
import { NO_GOOGLE_CLIENT } from "../../api/googleOAuthStatus.fixture";

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
 * The one seam stubbed: the api client. Registered in the file body with the
 * subject imported after it, for the reason `gateSteps.test.tsx` gives — a bun
 * module mock is process-global.
 */
mock.module("../../api/client", () => ({
  ApiError,
  apiFetch: async (req: Request) => {
    requests.push(req);
    return answer(req);
  },
}));

const { GoogleConfigStep } = await import("./GoogleConfigStep");
const { queryKeys } = await import("../../api/queries");

afterEach(() => {
  requests.length = 0;
  answer = () => {
    throw new Error("no request was expected here");
  };
});

const renderStep = (
  status: GoogleOAuthConfigStatus = NO_GOOGLE_CLIENT,
  onCheckAgain = () => {},
) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  qc.setQueryData(queryKeys.googleOAuthConfig, status);
  render(
    <QueryClientProvider client={qc}>
      <GoogleConfigStep
        titleId="t"
        descriptionId="d"
        status={status}
        checking={false}
        onCheckAgain={onCheckAgain}
      />
    </QueryClientProvider>,
  );
  return qc;
};

const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const saveButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: "Save and continue" });

describe("the walkthrough", () => {
  test("is an ordered list, one item per step, in the console's own order", () => {
    renderStep();

    const items = within(screen.getByRole("list", { name: /google/i })).getAllByRole("listitem");
    expect(items).toHaveLength(GOOGLE_OAUTH_SETUP_STEPS.length);
    for (const [index, step] of GOOGLE_OAUTH_SETUP_STEPS.entries()) {
      expect(items[index]!.textContent).toContain(step.title);
      expect(items[index]!.textContent).toContain(step.detail);
    }
  });

  test("shows the redirect URI to register verbatim", () => {
    renderStep();

    const walkthrough = within(screen.getByRole("list", { name: /google/i }));
    expect(
      walkthrough.getByText(new RegExp(DEV_GOOGLE_REDIRECT_URI.replace(/\W/g, "\\$&"))),
    ).toBeDefined();
  });

  test("puts the same steps in the setup prompt", () => {
    renderStep();

    const prompt = within(screen.getByRole("region", { name: "Setup prompt" }));
    for (const step of GOOGLE_OAUTH_SETUP_STEPS) {
      expect(prompt.getByText(new RegExp(step.title.replace(/\W/g, "\\$&")))).toBeDefined();
    }
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeDefined();
  });
});

describe("the form", () => {
  test("fills the redirect URI in from this app's API address", () => {
    renderStep();

    expect(field("Redirect URI").value).toBe(`${window.location.origin}/api/auth/google/callback`);
  });

  test("cannot be saved until the ID and the secret are there", () => {
    renderStep();

    expect(saveButton().disabled).toBe(true);
    type("Client ID", "1234-abc.apps.googleusercontent.com");
    expect(saveButton().disabled).toBe(true);
    type("Client secret", "GOCSPX-secret");
    expect(saveButton().disabled).toBe(false);
  });

  test("sends what was typed, and the answer is what moves the gate on", async () => {
    const saved = {
      ...NO_GOOGLE_CLIENT,
      configured: true,
      missing: [],
      source: "database" as const,
      clientId: "1234-abc.apps.googleusercontent.com",
      redirectUri: `${window.location.origin}/api/auth/google/callback`,
      secretHint: "GOCSPX…ret",
      clientChanged: true,
      reconnectRequired: 0,
    };
    // The PUT and the re-read after it answer the same status.
    answer = () => saved;
    const qc = renderStep();

    type("Client ID", " 1234-abc.apps.googleusercontent.com ");
    type("Client secret", "GOCSPX-secret");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(
        qc.getQueryData<GoogleOAuthConfigStatus>(queryKeys.googleOAuthConfig)?.configured,
      ).toBe(true),
    );
    expect(requests[0]).toEqual({
      path: "/settings/google-oauth",
      method: "PUT",
      body: {
        clientId: "1234-abc.apps.googleusercontent.com",
        clientSecret: "GOCSPX-secret",
        redirectUri: `${window.location.origin}/api/auth/google/callback`,
      },
    });
  });

  test("puts a refusal under the field it names", async () => {
    answer = () => {
      throw new ApiError("invalid_google_oauth_config", 400, {
        error: "invalid_google_oauth_config",
        field: "redirectUri",
        reason: "wrong_callback_path",
        message: "The redirect URI must end in /auth/google/callback.",
      });
    };
    renderStep();

    type("Client ID", "1234-abc.apps.googleusercontent.com");
    type("Client secret", "GOCSPX-secret");
    type("Redirect URI", "https://mail.example.com/elsewhere");
    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The redirect URI must end in /auth/google/callback.");
    expect(field("Redirect URI").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("the server's .env, still the fallback", () => {
  test("is named, and checked again on request", () => {
    const onCheckAgain = mock(() => {});
    renderStep(NO_GOOGLE_CLIENT, onCheckAgain);

    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });
});
