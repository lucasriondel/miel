import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ComposeTitleBar } from "./ComposeTitleBar";

interface Props {
  /** The line the title bar shows: a subject, or "New message" for a blank compose. */
  title: string;
  /** How assistive tech names the window; defaults to the title. */
  label?: string;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  /** The way out. For a reply this is the discard that clears the draft. */
  onClose: () => void;
  /** What the close control is called, when "Close" is not the honest word. */
  closeLabel?: string;
  children: ReactNode;
}

/**
 * The floating compose window (#96): docked bottom-right, over the page rather
 * than in its flow, collapsible to its own title bar.
 *
 * It knows nothing about replies — a title, a body and three controls — which
 * is the whole point: a future blank Compose entry point mounts this with an
 * empty form instead of a reply's prefilled one.
 *
 * Three shape decisions worth keeping. The dock is `pointer-events-none` and
 * the panel turns them back on, so the strip of viewport beside the window
 * stays clickable — a fixed full-width layer that swallowed clicks would make
 * the page under it feel broken. The layer is `z-[80]`: above the popovers
 * (`z-[70]`) it must cover, below the modals (`z-[100]`) that must cover it.
 * And it is portalled to `document.body` like every other floating layer here,
 * so no ancestor's `overflow` or `transform` can clip or re-anchor it.
 *
 * What it is not is a modal: nothing is trapped and nothing is locked, because
 * the page behind it — the message being answered — is exactly what a user
 * reads while writing the reply.
 */
export const ComposeWindow = ({
  title,
  label,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  closeLabel,
  children,
}: Props) =>
  createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-end px-3 pb-3 sm:px-6 sm:pb-6">
      <section
        aria-label={label ?? title}
        className="pointer-events-auto flex max-h-[min(80vh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gousse-line/60 bg-gousse-panel shadow-gousse-xl"
      >
        <ComposeTitleBar
          title={title}
          minimized={minimized}
          onMinimize={onMinimize}
          onRestore={onRestore}
          onClose={onClose}
          closeLabel={closeLabel}
        />
        {/* Unmounted, not hidden: the draft lives in the caller's state, so a
          minimized window keeps every keystroke without keeping the DOM. */}
        {minimized ? null : (
          <div className="flex flex-col gap-3 overflow-y-auto overscroll-contain p-4">
            {children}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
