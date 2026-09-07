// The gate is two ordered steps (#111), so it has to look like two ordered
// steps: a user who lands on step two should be able to see that the mailbox
// question is behind them and that this is the last one.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepProgress } from "./StepProgress";

describe("StepProgress", () => {
  test("lists both steps, connect first", () => {
    const html = renderToStaticMarkup(<StepProgress current="connect" />);

    const mailbox = html.indexOf("Connect a mailbox");
    const ai = html.indexOf("Set up AI triage");
    expect(mailbox).toBeGreaterThanOrEqual(0);
    expect(ai).toBeGreaterThan(mailbox);
    expect(html).toContain("1");
    expect(html).toContain("2");
  });

  test("marks the step the user is on, and only that one", () => {
    const onAi = renderToStaticMarkup(<StepProgress current="ai" />);

    expect(onAi.match(/aria-current="step"/g)).toHaveLength(1);
    // The mark sits on the second item, not the first.
    expect(onAi.indexOf('aria-current="step"')).toBeGreaterThan(onAi.indexOf("Connect a mailbox"));
  });

  test("moves the mark with the step", () => {
    const onConnect = renderToStaticMarkup(<StepProgress current="connect" />);

    expect(onConnect.indexOf('aria-current="step"')).toBeLessThan(
      onConnect.indexOf("Set up AI triage"),
    );
  });
});
