// The gate is four ordered steps, so it has to look like four ordered steps: a
// user who lands on the mailbox step should see the server and Google behind
// them and the AI step still ahead.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepProgress } from "./StepProgress";

const LABELS = ["Server", "Google", "Mailbox", "AI triage"];

describe("StepProgress", () => {
  test("lists the four steps in the gate's order", () => {
    const html = renderToStaticMarkup(<StepProgress current="server" />);

    const at = LABELS.map((label) => html.indexOf(label));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual(at.toSorted((a, b) => a - b));
  });

  test("marks the step the user is on, and only that one", () => {
    const onAi = renderToStaticMarkup(<StepProgress current="ai" />);

    expect(onAi.match(/aria-current="step"/g)).toHaveLength(1);
    expect(onAi.indexOf('aria-current="step"')).toBeGreaterThan(onAi.indexOf("Mailbox"));
  });

  test("ticks the steps behind and numbers the ones ahead", () => {
    const onConnect = renderToStaticMarkup(<StepProgress current="connect" />);

    expect(onConnect.match(/\(done\)/g)).toHaveLength(2);
    expect(onConnect).toContain(">3<");
    expect(onConnect).toContain(">4<");
    expect(onConnect.indexOf('aria-current="step"')).toBeLessThan(onConnect.indexOf("AI triage"));
  });
});
