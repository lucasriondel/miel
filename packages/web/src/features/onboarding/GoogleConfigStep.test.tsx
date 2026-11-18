// The Google step of the onboarding gate (#120, #138): the surface a fresh install
// actually hits first, since without a Google OAuth client there is no consent
// URL to send anyone to.
//
// It used to explain the whole of Google Cloud in two sentences — "they come
// from a Web application OAuth client in the console" — which names the
// destination and none of the six things that have to happen to get there.
// #138 gave all three surfaces the same walkthrough, read from core, so what is
// asserted here is that this one renders it in order and still names the
// variables the server reported as missing.
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DEV_GOOGLE_REDIRECT_URI, GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";
import { GoogleConfigStep } from "./GoogleConfigStep";

const MISSING = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

const renderStep = (missing: readonly string[] = MISSING, onCheckAgain = () => {}) =>
  render(
    <GoogleConfigStep
      titleId="t"
      descriptionId="d"
      missing={missing}
      checking={false}
      onCheckAgain={onCheckAgain}
    />,
  );

const missingList = () => within(screen.getByRole("list", { name: "Missing variables" }));

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

  // The one value in the walkthrough a reader copies rather than reads, and the
  // one Google refuses the sign-in over when it is off by a character.
  test("shows the redirect URI to register verbatim", () => {
    renderStep();

    const walkthrough = within(screen.getByRole("list", { name: /google/i }));
    expect(
      walkthrough.getByText(new RegExp(DEV_GOOGLE_REDIRECT_URI.replace(/\W/g, "\\$&"))),
    ).toBeDefined();
  });

  // The redesign's setup prompt is the same walkthrough, as text for an AI
  // assistant — built from the same steps, so it cannot say something else.
  test("puts the same steps in the setup prompt", () => {
    renderStep();

    const prompt = within(screen.getByRole("region", { name: "Setup prompt" }));
    for (const step of GOOGLE_OAUTH_SETUP_STEPS) {
      expect(prompt.getByText(new RegExp(step.title.replace(/\W/g, "\\$&")))).toBeDefined();
    }
    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeDefined();
  });
});

describe("what the server reported missing", () => {
  test("is still listed, name by name, with what each one is", () => {
    renderStep();

    expect(missingList().getByText("GOOGLE_CLIENT_ID")).toBeDefined();
    expect(missingList().getByText("GOOGLE_CLIENT_SECRET")).toBeDefined();
    expect(missingList().queryByText("GOOGLE_REDIRECT_URI")).toBeNull();
  });

  test("follows the server's own list rather than a fixed three", () => {
    renderStep(["GOOGLE_REDIRECT_URI"]);

    expect(missingList().getByText("GOOGLE_REDIRECT_URI")).toBeDefined();
    expect(missingList().queryByText("GOOGLE_CLIENT_ID")).toBeNull();
  });
});

describe("what the step still does not do", () => {
  // These three are environment variables read by the API process, not runtime
  // settings. The redesign draws a form that saves them; miel does not, so the
  // step has nothing to paste into — only copies, a link and a re-check.
  test("offers no field to paste the client into", () => {
    renderStep();

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  test("checks again on request, since restarting the API is what clears it", () => {
    const onCheckAgain = mock(() => {});
    renderStep(MISSING, onCheckAgain);

    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });
});
