/**
 * When the floating compose window is allowed to be shut (#96).
 *
 * The window rests closed, opens over the page and can be minimized to its own
 * title bar, so "is it open" is not a boolean: the user's intent is one input,
 * and whether the window holds anything they would lose is the other. Keeping
 * the second one here — a predicate over plain state rather than a branch
 * inside a render — is what makes "a window holding a draft or unsent text does
 * not close on its own" (#91, carried into #96) assertable without a render.
 *
 * Nothing here is reply-specific: a future blank Compose window is the same
 * three states over the same question.
 */
export type ComposeWindowMode = "closed" | "open" | "minimized";

export interface ComposeDraftState {
  /** What the user typed into the instruction field. */
  prompt: string;
  /** The message body as it stands, generated or typed. */
  body: string;
  /** A draft the AI returned that is still on screen. */
  hasDraft: boolean;
  /** A generate or send request is in flight. */
  isBusy: boolean;
  /** The Gmail id of the sent reply, once a send has succeeded. */
  sentMessageId: string | null;
}

/**
 * Subject and recipients are deliberately not part of this: both are prefilled
 * from the message being answered, so counting them would mean a reply window
 * could never be closed again.
 */
export const hasUnsentWork = (state: ComposeDraftState): boolean =>
  state.prompt.trim().length > 0 ||
  state.body.trim().length > 0 ||
  state.hasDraft ||
  state.isBusy ||
  state.sentMessageId !== null;

/**
 * `intent` is what the user asked for — a pill click opens, the title bar's
 * control minimizes, discard closes. Unsent work overrides a *closed* intent
 * and nothing else: minimizing is an explicit request to keep the draft and get
 * it out of the way, so a window that re-expanded itself would read as broken.
 */
export const composeWindowMode = (
  intent: ComposeWindowMode,
  state: ComposeDraftState,
): ComposeWindowMode => (intent === "closed" && hasUnsentWork(state) ? "open" : intent);
