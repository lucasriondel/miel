import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ComposeWindow } from "./ComposeWindow";

// The window's shape, which is a DESIGN.md matter rather than a behavioural one
// (#96, and #85 §2/§3/§5 for the rules): a card at the shared radius taking its
// depth from the shadow ramp, a hairline edge at reduced alpha, and title-bar
// controls that press and clear the 40px hit floor. Asserted on the rendered
// node's classes because that is where a class either lands or does not — the
// behaviour these classes are attached to is next door in `replyWindow`.

const renderWindow = (minimized = false) =>
  render(
    <ComposeWindow
      title="Lunch?"
      label="Reply: Lunch?"
      minimized={minimized}
      onMinimize={() => {}}
      onRestore={() => {}}
      onClose={() => {}}
    >
      <p>the form</p>
    </ComposeWindow>,
  );

const panel = () => screen.getByRole("region", { name: "Reply: Lunch?" });

describe("the window surface", () => {
  test("is a card at the shared radius, on the panel fill (§3)", () => {
    renderWindow();

    expect(panel().className).toContain("rounded-3xl");
    expect(panel().className).toContain("bg-gousse-panel");
  });

  // §2: depth is a shadow ramp; the border is a hairline at reduced alpha and
  // never carries the weight. The window is the highest floating layer here.
  test("takes depth from the top shadow ramp and edges with a hairline", () => {
    renderWindow();

    expect(panel().className).toContain("shadow-gousse-xl");
    expect(panel().className).toMatch(/border border-gousse-line\/\d+/);
    expect(panel().className).not.toContain("border-2");
  });

  // A fixed layer spanning the viewport would swallow clicks on the page it
  // floats over; only the panel takes them back.
  test("leaves the page beside it clickable", () => {
    renderWindow();

    expect(panel().parentElement!.className).toContain("pointer-events-none");
    expect(panel().className).toContain("pointer-events-auto");
  });
});

describe("the title bar", () => {
  test("gives each icon control a 40px target that presses (§5)", () => {
    renderWindow();

    for (const name of ["Minimize", "Close"]) {
      const cls = screen.getByRole("button", { name }).className;
      expect(cls).toContain("h-10");
      expect(cls).toContain("w-10");
      expect(cls).toContain("rounded-full");
      expect(cls).toContain("active:scale-[0.96]");
      expect(cls).not.toContain("transition-all");
    }
  });

  test("names the way out in the caller's words", () => {
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
  });

  test("swaps minimize for restore, and keeps the title either way", () => {
    const view = renderWindow(true);

    expect(screen.getByRole("button", { name: "Restore" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
    expect(screen.getByText("Lunch?")).toBeDefined();
    expect(screen.queryByText("the form")).toBeNull();

    view.unmount();
    renderWindow(false);
    expect(screen.getByText("the form")).toBeDefined();
  });
});

// §3's concentric rule: a `rounded-3xl` child inside a `rounded-3xl` card
// repeats the parent's corner. The window is the card now, so its contents
// separate with hairlines and pills instead.
test("no child repeats the window's own corner", () => {
  renderWindow();

  const repeated = [...panel().querySelectorAll("*")].filter((node) =>
    node.className.toString().includes("rounded-3xl"),
  );
  expect(repeated).toHaveLength(0);
});
