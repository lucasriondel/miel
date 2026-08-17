import { Toaster } from "sonner";
import { ToastIcon } from "./ToastIcon";

/**
 * App-wide toast host. Wraps sonner with the miel design language: sonner's own
 * palette (`richColors`) is deliberately off — every surface here is a
 * `bg-gousse-panel` floating card with a hairline + `shadow-gousse-xl`, and the
 * only color is the semantic priority token carried by the leading glyph
 * (see `.miel-toast` in `index.css`).
 *
 * `unstyled` is left on so sonner's default background/border/font rules never
 * land; layout that sonner still owns (stacking, swipe, mount/unmount
 * transforms) is untouched.
 */
export const MielToaster = () => (
  <Toaster
    position="bottom-right"
    gap={10}
    offset={16}
    visibleToasts={4}
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
          "miel-toast group/toast w-full gap-x-2.5 gap-y-3 rounded-2xl border border-gousse-line bg-gousse-panel p-3 shadow-gousse-xl",
        icon: "miel-toast-icon mt-px flex h-4 w-4 shrink-0 items-center justify-center",
        content: "flex min-w-0 flex-col gap-0.5",
        title: "text-[13px] font-bold leading-snug text-gousse-ink",
        description: "text-[11.5px] font-medium leading-snug text-gousse-muted tabular-nums",
        actionButton:
          "miel-toast-action flex w-full items-center justify-center rounded-xl bg-gousse-accent px-3 py-2.5 text-[11.5px] font-bold text-gousse-bg transition-[background-color,transform] duration-150 hover:bg-gousse-accent/85 active:scale-[0.98]",
        cancelButton:
          "miel-toast-action flex w-full items-center justify-center rounded-xl bg-gousse-line/40 px-3 py-2.5 text-[11.5px] font-bold text-gousse-muted transition-[background-color,transform] duration-150 hover:bg-gousse-line/60 active:scale-[0.98]",
        closeButton: "miel-toast-close",
      },
    }}
  />
);
