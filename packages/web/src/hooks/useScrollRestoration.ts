import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scroll offsets remembered per history entry (#95).
 *
 * The app scrolls a `div`, not the document, so the browser restores nothing
 * across a back navigation and react-router's `ScrollRestoration` — which
 * drives `window` — has nothing to drive. Keyed by `location.key`, which is
 * the history entry itself: a back lands on the same key and finds its offset,
 * while any push (a new filter, a new period) gets a fresh one and starts at
 * the top, as it should.
 */
export interface ScrollMemory {
  get(key: string): number | undefined;
  set(key: string, offset: number): void;
}

/** A session's worth of offsets, oldest-unused dropped past `limit`. */
export function createScrollMemory(limit = 30): ScrollMemory {
  // Insertion order is the recency order: re-inserting on every touch moves an
  // entry to the end, so the first key is always the least recently used.
  const offsets = new Map<string, number>();

  const touch = (key: string, offset: number) => {
    offsets.delete(key);
    offsets.set(key, offset);
  };

  return {
    get(key) {
      const offset = offsets.get(key);
      if (offset !== undefined) touch(key, offset);
      return offset;
    },
    set(key, offset) {
      touch(key, offset);
      if (offsets.size > limit) {
        const oldest = offsets.keys().next();
        if (!oldest.done) offsets.delete(oldest.value);
      }
    },
  };
}

/**
 * Frames to keep trying before settling for the top. At 60fps that is a
 * generous second — long enough for a cached list to render and its images to
 * lay out, short enough that a genuinely shorter list doesn't leave a restore
 * pending under the user's own scrolling.
 */
export const MAX_RESTORE_FRAMES = 60;

export type RestoreStep = "apply" | "wait" | "give-up";

/**
 * Whether the container can be scrolled to `target` yet. Setting `scrollTop`
 * past the current maximum clamps silently, so an early apply lands at the
 * wrong offset with nothing left to correct it — hence waiting for the list to
 * reach its full height first.
 */
export function restoreStep(input: {
  target: number;
  scrollHeight: number;
  clientHeight: number;
  frame: number;
}): RestoreStep {
  if (input.target <= 0) return "apply";
  if (input.target <= input.scrollHeight - input.clientHeight) return "apply";
  return input.frame < MAX_RESTORE_FRAMES ? "wait" : "give-up";
}

/** The part of an element a restore reads and writes. */
export interface ScrollTarget {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  scrollTop: number;
}

/** Frame scheduling, injected so the loop can be driven a frame at a time. */
export interface FrameScheduler {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
}

const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * Scrolls `el` to `target`, waiting frame by frame for the list to grow tall
 * enough to hold it (see {@link restoreStep}). Returns a cancel — the caller
 * calls it when the user scrolls for themselves, since a restore landing after
 * that would yank them away from where they chose to be.
 */
export function restoreScroll(
  el: ScrollTarget,
  target: number,
  scheduler: FrameScheduler = rafScheduler,
): () => void {
  let frame = 0;
  let raf = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const step = restoreStep({
      target,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      frame,
    });
    if (step === "apply") el.scrollTop = target;
    if (step !== "wait") return;
    frame += 1;
    raf = scheduler.request(tick);
  };

  tick();

  return () => {
    if (cancelled) return;
    cancelled = true;
    scheduler.cancel(raf);
  };
}

const sessionScrollMemory = createScrollMemory();

/**
 * Saves the scroll offset of `ref`'s element against the history entry being
 * left, and restores it on the way back.
 *
 * The offset is read from the scroll events rather than from the element at
 * save time: by the time a route change commits, the new (shorter) page has
 * already clamped `scrollTop` toward zero, so the element no longer knows
 * where the user was.
 */
export function useScrollRestoration(
  ref: RefObject<HTMLElement | null>,
  memory: ScrollMemory = sessionScrollMemory,
): void {
  const { key } = useLocation();
  const offsetRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      offsetRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = memory.get(key) ?? 0;
    offsetRef.current = target;

    const cancel = restoreScroll(el, target);
    // A user who scrolls while the list is still filling has said where they
    // want to be. Wheel and touch are the gestures that can outrun the list;
    // the scroll event itself can't be used, since the restore raises one.
    el.addEventListener("wheel", cancel, { passive: true });
    el.addEventListener("touchmove", cancel, { passive: true });

    return () => {
      cancel();
      el.removeEventListener("wheel", cancel);
      el.removeEventListener("touchmove", cancel);
      memory.set(key, offsetRef.current);
    };
  }, [key, ref, memory]);
}
