import { Toaster } from "sonner";
import { ToastIcon } from "./ToastIcon";

/**
 * The app's toasts, as the redesign draws them (Main view › Toasts): one dark
 * line at the bottom centre — the glyph, the message, at most one action and
 * the close — on the same ink in both themes. The per-type colour is the
 * glyph's alone (`index.css`, `.miel-toast`).
 */
export const MielToaster = () => (
  <Toaster
    position="bottom-center"
    gap={8}
    offset={20}
    visibleToasts={3}
    closeButton
    className="miel-toaster"
    icons={{
      success: <ToastIcon type="success" />,
      error: <ToastIcon type="error" />,
      info: <ToastIcon type="info" />,
      warning: <ToastIcon type="warning" />,
      loading: <ToastIcon type="loading" />,
    }}
    toastOptions={{
      unstyled: true,
      closeButtonAriaLabel: "Dismiss notification",
      classNames: {
        toast:
          "miel-toast min-h-10 rounded-[10px] bg-[rgb(var(--gousse-toast))] py-2 pr-3 pl-3 text-[#f7f8fa] shadow-[0_8px_24px_rgb(20_32_46/0.2)]",
        icon: "miel-toast-icon flex h-3.5 w-3.5 shrink-0 items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5",
        content: "flex min-w-0 flex-col gap-0.5",
        title: "text-[13px] leading-snug font-medium text-[#f7f8fa]",
        description: "text-xs leading-snug text-[#aeb7c2] tabular-nums",
        actionButton:
          "miel-toast-action flex h-[26px] shrink-0 items-center rounded-[7px] bg-white/12 px-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-white/20",
        cancelButton:
          "miel-toast-action flex h-[26px] shrink-0 items-center rounded-[7px] px-2.5 text-xs font-semibold text-[#aeb7c2] transition-colors duration-150 hover:bg-white/10 hover:text-white",
        closeButton: "miel-toast-close",
      },
    }}
  />
);
