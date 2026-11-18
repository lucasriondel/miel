import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { ComposeWindow } from "./ComposeWindow";

// The window's shape, which is a design matter rather than a behavioural one
// (the redesign's "2 · Window states"): an open window is a 24px-cornered card
// on the panel fill taking its depth from the top shadow ramp, a minimized one
// is its 300px title bar on the bottom edge. Asserted on the rendered node's
// classes because that is where a class either lands or does not — the
// behaviour is next door in `composeWiring`.

const renderWindow = (minimized = false, status?: ReactNode) =>
  render(
    <ComposeWindow
      title="Lunch?"
      label="Reply: Lunch?"
      minimized={minimized}
      status={status}
      onMinimize={() => {}}
      onRestore={() => {}}
      onClose={() => {}}
    >
      <p>the form</p>
    </ComposeWindow>,
  );

const panel = () => screen.getByRole("region", { name: "Reply: Lunch?" });

describe("the open window", () => {
  test("is a card with the design's 24px corner, on the panel fill", () => {
    renderWindow();

    expect(panel().className).toContain("rounded-[24px]");
    expect(panel().className).toContain("bg-gousse-panel");
    expect(panel().className).toContain("sm:w-[540px]");
  });

  test("takes depth from the top shadow ramp and edges with a hairline", () => {
    renderWindow();

    expect(panel().className).toContain("shadow-gousse-xl");
    expect(panel().className).toContain("border-gousse-line");
    expect(panel().className).toContain("pointer-events-auto");
  });

  test("names the way out in the caller's words, and minimizes", () => {
    render(
      <ComposeWindow
        title="Lunch?"
        minimized={false}
        onMinimize={() => {}}
        onRestore={() => {}}
        onClose={() => {}}
        closeLabel="Discard"
      >
        <p>the form</p>
      </ComposeWindow>,
    );

    expect(screen.getByRole("button", { name: "Discard" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Minimize" })).toBeDefined();
  });

  test("title-bar controls are round and press", () => {
    renderWindow();

    for (const name of ["Minimize", "Close"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("rounded-full");
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
    }
  });
});

describe("the minimized window", () => {
  test("is its title bar alone, with restore in place of minimize", () => {
    renderWindow(true, <span aria-label="Unsent" />);

    expect(screen.getByRole("button", { name: "Restore" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
    expect(screen.getByText("Lunch?")).toBeDefined();
    expect(screen.getByLabelText("Unsent")).toBeDefined();
    expect(screen.queryByText("the form")).toBeNull();
    expect(panel().className).toContain("rounded-t-[14px]");
  });
});
