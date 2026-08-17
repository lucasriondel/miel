// Step one of the onboarding gate (#120, #138): the surface a fresh install
// actually hits first, since without a Google OAuth client there is no consent
// URL to send anyone to.
//
// It used to explain the whole of Google Cloud in two sentences — "they come
// from a Web application OAuth client in the console" — which names the
// destination and none of the six things that have to happen to get there.
// #138 gave all three surfaces the same walkthrough, read from core, so what is
// asserted here is that this one renders it in order and still names the
// variables the server reported as missing.
import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { DEV_GOOGLE_REDIRECT_URI, GOOGLE_OAUTH_SETUP_STEPS } from "@miel/core/googleOAuthSetup";
import { GoogleConfigStep } from "./GoogleConfigStep";

const MISSING = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

const renderStep = (missing: readonly string[] = MISSING) =>
  render(<GoogleConfigStep titleId="t" descriptionId="d" missing={missing} />);

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

    expect(
      screen.getByText(new RegExp(DEV_GOOGLE_REDIRECT_URI.replace(/\W/g, "\\$&"))),
    ).toBeDefined();
  });
});

describe("what the server reported missing", () => {
  test("is still listed, name by name, with what each one is", () => {
    renderStep();

    expect(screen.getByText("GOOGLE_CLIENT_ID")).toBeDefined();
    expect(screen.getByText("GOOGLE_CLIENT_SECRET")).toBeDefined();
    expect(screen.queryByText("GOOGLE_REDIRECT_URI")).toBeNull();
  });

  test("follows the server's own list rather than a fixed three", () => {
    renderStep(["GOOGLE_REDIRECT_URI"]);

    expect(screen.getByText("GOOGLE_REDIRECT_URI")).toBeDefined();
    expect(screen.queryByText("GOOGLE_CLIENT_ID")).toBeNull();
  });
});

describe("what the step still does not do", () => {
  // These three are environment variables read by the API process, not runtime
  // settings: there is nothing to paste here and no action to offer, and a
  // button that could only fail is worse than none.
  test("offers nothing to press or paste, since the work happens outside the app", () => {
    renderStep();

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
