import type { KeyboardEvent, ReactNode } from "react";
import { ComposeMinimizedBar } from "./ComposeMinimizedBar";
import { ComposeTitleBar } from "./ComposeTitleBar";

interface Props {
  /** The line the title bar shows: a subject, or "New message" for a blank compose. */
  title: string;
  /** How assistive tech names the window; defaults to the title. */
  label?: string;
  minimized: boolean;
  /** What the minimized bar leads with: the unsent dot, or a spinner while sending. */
  status?: ReactNode;
  onMinimize: () => void;
  onRestore: () => void;
  /** The way out. With unsent work, the caller asks before it lets go. */
  onClose: () => void;
  /** What the close control is called, when "Close" is not the honest word. */
  closeLabel?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** What leads the open window's title bar: a reply's mode chip. Not drawn minimized. */
  titleLeading?: ReactNode;
  children: ReactNode;
}

/**
 * One floating compose window (#96, redesigned): a 540px card with a 24px
 * corner and the highest shadow, docked by `ComposeDock` — or, minimized, a
 * 300px title bar sitting on the bottom edge.
 *
 * It knows nothing about replies — a title, a body, three controls and a slot
 * before the title the reply fills with its mode chip — which is what lets a new mail, a reply and a forward share it.
 *
 * Not a modal: nothing is trapped, because the page behind it — the message
 * being answered — is exactly what a user reads while writing.
 */
export const ComposeWindow = ({
  title,
  label,
  minimized,
  status,
  onMinimize,
  onRestore,
  onClose,
  closeLabel,
  onKeyDown,
  titleLeading,
  children,
}: Props) =>
  minimized ? (
    <ComposeMinimizedBar
      title={title}
      label={label}
      status={status}
      onRestore={onRestore}
      onClose={onClose}
      closeLabel={closeLabel}
    />
  ) : (
    // The window's keys (⌘↵, ⌘J, Esc, ⌘⌫) are scoped to it: they come from the
    // fields inside and bubble here, so the page under the window never sees them.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <section
      aria-label={label ?? title}
      onKeyDown={onKeyDown}
      className="pointer-events-auto mb-3 flex max-h-[min(calc(100vh-1.5rem),46rem)] w-full flex-col overflow-hidden rounded-[24px] border border-gousse-line bg-gousse-panel shadow-gousse-xl sm:mb-6 sm:max-h-[min(calc(100vh-3rem),46rem)] sm:w-[540px]"
    >
      <ComposeTitleBar
        title={title}
        onMinimize={onMinimize}
        onClose={onClose}
        closeLabel={closeLabel}
        leading={titleLeading}
      />
      {/* Unmounted, not hidden, when minimized: the fields live in the
          provider, so a minimized window keeps every keystroke without
          keeping the DOM. */}
      {children}
    </section>
  );
