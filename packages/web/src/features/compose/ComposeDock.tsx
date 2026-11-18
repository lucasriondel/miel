import { createPortal } from "react-dom";
import type { ComposeSessionActions } from "./ComposeProvider";
import type { ComposeSession } from "./composeSession";
import { ComposeSessionWindow } from "./ComposeSessionWindow";

interface Props {
  sessions: ComposeSession[];
  actions: ComposeSessionActions;
  draftSaveDelayMs: number;
}

/**
 * Where the compose windows live: a strip along the bottom-right edge, the
 * windows side by side in the order they were opened (#96, redesigned).
 *
 * The strip is `pointer-events-none` and each window turns them back on, so the
 * page beside the windows stays clickable. `z-[80]`: above the popovers
 * (`z-[70]`) it must cover, below the modals (`z-[100]`) that must cover it.
 * Portalled to `document.body` like every floating layer, so no ancestor's
 * `overflow` or `transform` can clip it. Not a modal — nothing is trapped,
 * because the page behind is what a user reads while writing.
 */
export const ComposeDock = ({ sessions, actions, draftSaveDelayMs }: Props) => {
  if (sessions.length === 0) return null;
  return createPortal(
    <div
      data-compose-dock=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex items-end justify-end gap-3 px-3 sm:px-6"
    >
      {sessions.map((session) => (
        <ComposeSessionWindow
          key={session.id}
          session={session}
          actions={actions}
          draftSaveDelayMs={draftSaveDelayMs}
        />
      ))}
    </div>,
    document.body,
  );
};
