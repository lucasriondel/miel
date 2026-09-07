import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useFocusTrap } from "./useFocusTrap";

interface Props {
  open: boolean;
  /** id of the element naming the dialog — its heading, normally. */
  labelledBy: string;
  /** id of the element describing it, read after the name by screen readers. */
  describedBy?: string;
  /**
   * Called when the user asks to close: Escape or a click on the backdrop.
   * **Omit it to make the dialog non-dismissable** — with no handler there is
   * no exit, which is what a blocking gate wants.
   */
  onDismiss?: () => void;
  /** Extra classes for the panel (width, padding). */
  className?: string;
  children: ReactNode;
}

/**
 * Modal dialog. Portalled to `document.body` so no ancestor `overflow-hidden`
 * or stacking context can clip it, and layered above the popovers (`z-[70]`).
 *
 * `role="dialog"` + `aria-modal` give assistive tech the semantics; the panel
 * backs them up by trapping focus ({@link useFocusTrap}) and freezing
 * background scrolling ({@link useScrollLock}), so the page behind is
 * unreachable by keyboard, pointer or wheel while it is open. The app root is
 * deliberately *not* marked `inert`: sonner renders its toaster inside `#root`,
 * so that would silence the toasts raised from inside the dialog too.
 *
 * The design system ships no dialog yet; this lives in the web package and can
 * be promoted upstream once a second caller appears.
 */
export const Modal = ({
  open,
  labelledBy,
  describedBy,
  onDismiss,
  className = "",
  children,
}: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);

  useScrollLock(open);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open || !onDismiss) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return createPortal(
    // The backdrop is a click target, not a control: clicking *it* rather than
    // the panel dismisses. Escape is the keyboard equivalent and is bound on
    // `document` above, so there is nothing here for a key handler to add.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- see above
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 backdrop-blur-[2px] transition-opacity duration-200 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div
        ref={panelRef}
        // Not `<dialog>`: this panel is rendered into a portal and shown by
        // React state, while a native dialog only becomes visible through
        // `showModal()` — which would put the browser's top layer, not this
        // component, in charge of the backdrop and the enter transition.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- see above
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`w-full max-w-md rounded-3xl border border-gousse-line/60 bg-gousse-panel p-7 shadow-gousse-xl outline-none transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${
          entered
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-95 opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100"
        } ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};
