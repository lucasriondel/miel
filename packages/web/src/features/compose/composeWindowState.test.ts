import { describe, expect, test } from "bun:test";
import {
  composeWindowMode,
  hasUnsentWork,
  type ComposeDraftState,
  type ComposeWindowMode,
} from "./composeWindowState";

// The floating compose window (#96) can be in three states, not two — closed,
// open, minimized to its title bar — and the one rule that is not a matter of
// markup is *when it is allowed to be shut*: a window holding a draft or unsent
// text must never fall closed on its own (#91's non-negotiable, carried over).
// Minimizing is not closing: it hides the body and keeps every keystroke, which
// is exactly why it needs its own state rather than a boolean.

const state = (over: Partial<ComposeDraftState> = {}): ComposeDraftState => ({
  prompt: "",
  body: "",
  hasDraft: false,
  isBusy: false,
  sentMessageId: null,
  ...over,
});

describe("hasUnsentWork", () => {
  test("an untouched window holds nothing", () => {
    expect(hasUnsentWork(state())).toBe(false);
  });

  test("typed instruction or typed body counts, whitespace alone does not", () => {
    expect(hasUnsentWork(state({ prompt: "Decline politely" }))).toBe(true);
    expect(hasUnsentWork(state({ body: "Sounds good." }))).toBe(true);
    expect(hasUnsentWork(state({ prompt: "  \n ", body: "\t" }))).toBe(false);
  });

  test("a generated draft counts even with both fields cleared", () => {
    expect(hasUnsentWork(state({ hasDraft: true }))).toBe(true);
  });

  test("an in-flight generate or send counts", () => {
    expect(hasUnsentWork(state({ isBusy: true }))).toBe(true);
  });

  // The sent confirmation carries the Gmail id, which is the only place the
  // user can read it — closing on success would throw it away.
  test("a completed send still counts, so the confirmation stays on screen", () => {
    expect(hasUnsentWork(state({ sentMessageId: "18f2" }))).toBe(true);
  });
});

describe("composeWindowMode", () => {
  test("is closed until the user opens it", () => {
    expect(composeWindowMode("closed", state())).toBe("closed");
    expect(composeWindowMode("open", state())).toBe("open");
  });

  test("stays open while work is unsent, whatever the intent says", () => {
    expect(composeWindowMode("closed", state({ hasDraft: true }))).toBe("open");
    expect(composeWindowMode("closed", state({ body: "hi" }))).toBe("open");
  });

  // Minimizing is the whole point of the title bar: it is an explicit request
  // to keep the draft and get it out of the way, so unsent work must not
  // re-expand it — that would make the control appear broken.
  test("a minimized window holding a draft stays minimized", () => {
    const modes: ComposeWindowMode[] = [
      composeWindowMode("minimized", state()),
      composeWindowMode("minimized", state({ body: "half a sentence" })),
      composeWindowMode("minimized", state({ isBusy: true })),
    ];
    expect(modes).toEqual(["minimized", "minimized", "minimized"]);
  });

  // Discard is the explicit way out: it clears the state *and* the intent, so
  // the window shuts on the next render rather than being overridden.
  test("closes once discard has cleared both the intent and the work", () => {
    expect(composeWindowMode("closed", state())).toBe("closed");
  });
});
