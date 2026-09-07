import { describe, expect, test } from "bun:test";
import {
  MAX_RESTORE_FRAMES,
  createScrollMemory,
  restoreScroll,
  restoreStep,
  type ScrollTarget,
} from "./useScrollRestoration";

// #95. Coming back from a message has to land where the user left the list.
// The scrolling happens in a `div`, not the document, so the browser restores
// nothing on its own and react-router's `ScrollRestoration` (which drives
// `window`) can't help either. These are the two decisions the hook is made
// of; the DOM wiring around them stays a manual criterion in this package.

describe("createScrollMemory", () => {
  test("has nothing to say about a history entry it has never seen", () => {
    expect(createScrollMemory().get("k1")).toBeUndefined();
  });

  test("remembers an offset against the history entry it belongs to", () => {
    const memory = createScrollMemory();
    memory.set("k1", 640);
    memory.set("k2", 0);
    expect(memory.get("k1")).toBe(640);
    expect(memory.get("k2")).toBe(0);
  });

  test("keeps the latest offset for an entry, not the first", () => {
    const memory = createScrollMemory();
    memory.set("k1", 100);
    memory.set("k1", 900);
    expect(memory.get("k1")).toBe(900);
  });

  test("forgets the least recently used entry once it is full", () => {
    // A long session would otherwise accumulate one entry per navigation for
    // pages the user can no longer reach.
    const memory = createScrollMemory(2);
    memory.set("k1", 1);
    memory.set("k2", 2);
    memory.set("k3", 3);
    expect(memory.get("k1")).toBeUndefined();
    expect(memory.get("k2")).toBe(2);
    expect(memory.get("k3")).toBe(3);
  });

  test("counts reading an entry as using it", () => {
    const memory = createScrollMemory(2);
    memory.set("k1", 1);
    memory.set("k2", 2);
    memory.get("k1");
    memory.set("k3", 3);
    expect(memory.get("k1")).toBe(1);
    expect(memory.get("k2")).toBeUndefined();
  });
});

const step = (over: Partial<Parameters<typeof restoreStep>[0]>) =>
  restoreStep({
    target: 600,
    scrollHeight: 4000,
    clientHeight: 800,
    frame: 0,
    ...over,
  });

describe("restoreStep", () => {
  test("applies the offset once the list is tall enough to hold it", () => {
    expect(step({})).toBe("apply");
  });

  test("applies the top of the list without waiting for anything", () => {
    expect(step({ target: 0, scrollHeight: 100, clientHeight: 800 })).toBe("apply");
  });

  test("waits while the list is still short — messages arrive from cache a frame late", () => {
    // Setting scrollTop past the current maximum silently clamps, so applying
    // early lands the user at the wrong offset with nothing left to correct it.
    expect(step({ scrollHeight: 900, clientHeight: 800 })).toBe("wait");
  });

  test("applies as soon as the last row makes the offset reachable", () => {
    expect(step({ scrollHeight: 1400, clientHeight: 800, frame: 12 })).toBe("apply");
  });

  test("gives up rather than waiting forever on a list that stayed short", () => {
    // The period may genuinely hold fewer messages than it did — a delete, a
    // filter change. The user is then at the top, which is where they belong.
    expect(step({ scrollHeight: 900, clientHeight: 800, frame: MAX_RESTORE_FRAMES })).toBe(
      "give-up",
    );
  });
});

// A real element grows its own `scrollHeight`; the fake needs the test to do
// it, which is the one thing `ScrollTarget` declares read-only.
type FakeScrollTarget = { -readonly [K in keyof ScrollTarget]: ScrollTarget[K] };

describe("restoreScroll", () => {
  /** A scroll container whose content height we control, plus a frame queue. */
  const harness = (scrollHeight: number) => {
    const frames: Array<() => void> = [];
    const cancelled: number[] = [];
    const el: FakeScrollTarget = { scrollHeight, clientHeight: 800, scrollTop: 0 };
    const cancel = restoreScroll(el, 600, {
      request: (cb) => {
        frames.push(cb);
        return frames.length;
      },
      cancel: (id) => cancelled.push(id),
    });
    /** Run the frame the loop is waiting on, if any. */
    const nextFrame = () => frames.shift()?.();
    return { el, cancel, nextFrame, pending: () => frames.length, cancelled };
  };

  test("lands on the offset straight away when the list is already there", () => {
    const h = harness(4000);
    expect(h.el.scrollTop).toBe(600);
    expect(h.pending()).toBe(0);
  });

  test("holds off while the list is short, then lands once it fills", () => {
    const h = harness(900);
    expect(h.el.scrollTop).toBe(0);

    h.nextFrame();
    expect(h.el.scrollTop).toBe(0);

    h.el.scrollHeight = 4000;
    h.nextFrame();
    expect(h.el.scrollTop).toBe(600);
    // Landed, so nothing is left waiting on another frame.
    h.nextFrame();
    expect(h.pending()).toBe(0);
  });

  test("stops trying on a list that never grows, leaving the user at the top", () => {
    const h = harness(900);
    for (let i = 0; i <= MAX_RESTORE_FRAMES; i += 1) h.nextFrame();
    expect(h.el.scrollTop).toBe(0);
    expect(h.pending()).toBe(0);
  });

  test("a cancelled restore never touches the scroll position again", () => {
    // The user scrolled while the list was still filling: where they are now
    // is where they want to be.
    const h = harness(900);
    h.cancel();
    h.el.scrollHeight = 4000;
    h.nextFrame();
    expect(h.el.scrollTop).toBe(0);
    expect(h.cancelled.length).toBe(1);
  });
});
